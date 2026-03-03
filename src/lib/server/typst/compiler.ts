import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { getGitHubToken, githubApi, type GitHubTree } from "$lib/server/github";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface PageInfo {
  width: number;
  height: number;
}

export interface CompileResult {
  pages: PageInfo[];
  pageSvgs: string[];
  diagnostics: string[];
  timestamp: number;
}

// In-memory cache: projectId → CompileResult
const cache = new Map<string, CompileResult>();

/**
 * Split a full multi-page SVG into per-page SVG fragments.
 * The Typst renderer outputs pages as `<g class="typst-page" ...>` groups
 * inside a single root `<svg>`. We extract each and wrap in a standalone SVG.
 */
function splitSvgPages(fullSvg: string): { pages: PageInfo[]; pageSvgs: string[] } {
  const pages: PageInfo[] = [];
  const pageSvgs: string[] = [];

  // Extract defs block (fonts, gradients, etc.) — everything between <defs>...</defs>
  const defsMatch = fullSvg.match(/<defs[\s>][\s\S]*?<\/defs>/);
  const defs = defsMatch ? defsMatch[0] : "";

  // Extract style block
  const styleMatch = fullSvg.match(/<style[\s>][\s\S]*?<\/style>/);
  const style = styleMatch ? styleMatch[0] : "";

  // Extract root SVG attributes for namespace declarations
  const rootSvgMatch = fullSvg.match(/<svg([^>]*)>/);
  const rootAttrs = rootSvgMatch?.[1] ?? "";

  // Extract namespace declarations from root
  const nsMatches = rootAttrs.match(/xmlns[^=]*="[^"]*"/g) ?? [];
  const namespaces = nsMatches.join(" ");

  // Find all typst-page groups with their transforms
  const pageRegex =
    /<g[^>]*class="typst-page"[^>]*data-page-width="([^"]*)"[^>]*data-page-height="([^"]*)"[^>]*>([\s\S]*?)(?=<g[^>]*class="typst-page"|<\/svg>)/g;

  let match;
  while ((match = pageRegex.exec(fullSvg)) !== null) {
    const widthPt = parseFloat(match[1]!);
    const heightPt = parseFloat(match[2]!);
    const content = match[3]!;

    pages.push({ width: widthPt, height: heightPt });

    // Build standalone SVG for this page
    const pageSvg = `<svg ${namespaces} viewBox="0 0 ${widthPt} ${heightPt}" width="${widthPt}" height="${heightPt}">${style}${defs}<g class="typst-page">${content}</g></svg>`;
    pageSvgs.push(pageSvg);
  }

  // Fallback: if regex didn't find pages, return the whole SVG as a single page
  if (pages.length === 0) {
    const viewBoxMatch = fullSvg.match(/viewBox="([^"]*)"/);
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1]!.split(/\s+/).map(Number);
      pages.push({ width: parts[2] ?? 595, height: parts[3] ?? 842 });
    } else {
      pages.push({ width: 595, height: 842 });
    }
    pageSvgs.push(fullSvg);
  }

  return { pages, pageSvgs };
}

interface GitHubBlob {
  content: string;
  encoding: string;
  sha: string;
  size: number;
}

/** Workspace info for a project on disk */
export interface WorkspaceInfo {
  workDir: string;
  entryFile: string;
  filePaths: string[];
}

// Track workspace tree SHAs for change detection
const workspaceTreeShas = new Map<string, string>();
const workspaceFilePaths = new Map<string, string[]>();

// In-flight deduplication for workspace creation
const workspacePromises = new Map<string, Promise<WorkspaceInfo>>();

// In-flight deduplication for compilation
const compilePromises = new Map<string, Promise<CompileResult>>();

const COMPILE_TIMEOUT_MS = 60_000;
const BLOB_CONCURRENCY = 10;

/**
 * Run promises with a concurrency limit.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Ensure project files are written to a temp directory.
 * Returns the workspace path and entry file. Keeps files on disk
 * so both the compiler and tinymist can use them.
 *
 * Uses tree SHA to skip blob fetching when content hasn't changed.
 */
export async function ensureWorkspace(projectId: string): Promise<WorkspaceInfo> {
  // Deduplicate concurrent calls for the same project
  const inflight = workspacePromises.get(projectId);
  if (inflight) return inflight;

  const promise = ensureWorkspaceImpl(projectId);
  workspacePromises.set(projectId, promise);
  try {
    return await promise;
  } finally {
    workspacePromises.delete(projectId);
  }
}

async function ensureWorkspaceImpl(projectId: string): Promise<WorkspaceInfo> {
  const workDir = join(tmpdir(), `marginalia-${projectId}`);

  // Get project
  const [project] = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error("Project not found");
  }

  // Get GitHub token
  const token = await getGitHubToken(project.ownerId);
  if (!token) {
    throw new Error("GitHub not connected for project owner");
  }

  // Fetch file tree (lightweight — just metadata + tree SHA)
  const tree = await githubApi<GitHubTree>(
    token,
    `/repos/${project.repoFullName}/git/trees/${project.defaultBranch}?recursive=1`,
  );

  // Check if tree SHA matches — if so, workspace is already up to date
  const previousSha = workspaceTreeShas.get(projectId);
  if (previousSha === tree.sha && existsSync(workDir)) {
    return {
      workDir,
      entryFile: project.entryFile || "main.typ",
      filePaths: workspaceFilePaths.get(projectId) ?? [],
    };
  }

  const blobs = tree.tree.filter((e) => e.type === "blob");

  // Fetch file contents with concurrency limit
  const fileContents = await mapWithConcurrency(blobs, BLOB_CONCURRENCY, async (entry) => {
    const blob = await githubApi<GitHubBlob>(
      token,
      `/repos/${project.repoFullName}/git/blobs/${entry.sha}`,
    );
    const bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
    return { path: entry.path, bytes };
  });

  // Write files to disk
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const filePaths: string[] = [];
  for (const { path, bytes } of fileContents) {
    const fullPath = join(workDir, path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, bytes);
    filePaths.push(path);
  }

  workspaceTreeShas.set(projectId, tree.sha);
  workspaceFilePaths.set(projectId, filePaths);

  return {
    workDir,
    entryFile: project.entryFile || "main.typ",
    filePaths,
  };
}

/**
 * Write project files to a temp directory and compile with NodeCompiler.
 * Deduplicates concurrent calls for the same project.
 */
export async function compileProject(projectId: string): Promise<CompileResult> {
  // Check cache (TTL: 30 seconds)
  const cached = cache.get(projectId);
  if (cached && Date.now() - cached.timestamp < 30_000) {
    return cached;
  }

  // Deduplicate concurrent compilations
  const inflight = compilePromises.get(projectId);
  if (inflight) return inflight;

  const promise = compileProjectImpl(projectId);
  compilePromises.set(projectId, promise);
  try {
    return await promise;
  } finally {
    compilePromises.delete(projectId);
  }
}

async function compileProjectImpl(projectId: string): Promise<CompileResult> {
  const { workDir, entryFile } = await ensureWorkspace(projectId);

  const c = NodeCompiler.create({ workspace: workDir });

  try {
    const mainPath = join(workDir, entryFile);

    // Wrap compilation in a timeout
    const compileResult = await Promise.race([
      Promise.resolve(c.compile({ mainFilePath: mainPath })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Compilation timed out (60s limit)")), COMPILE_TIMEOUT_MS),
      ),
    ]);

    const diagnostics: string[] = [];

    const diagErr = compileResult.takeDiagnostics();
    if (diagErr) {
      for (const d of diagErr.shortDiagnostics) {
        diagnostics.push(typeof d === "string" ? d : JSON.stringify(d));
      }
    }

    const doc = compileResult.result;
    if (!doc) {
      const err = compileResult.takeError();
      const msg = err ? err.shortDiagnostics.map(String).join("\n") : "Compilation failed";
      throw new Error(msg);
    }

    const svgString = c.svg(doc);
    const { pages, pageSvgs } = splitSvgPages(svgString);

    const result: CompileResult = {
      pages,
      pageSvgs,
      diagnostics,
      timestamp: Date.now(),
    };

    cache.set(projectId, result);
    return result;
  } finally {
    // Don't delete workspace — tinymist needs it
  }
}

/**
 * Get a cached compile result (does not trigger compilation).
 */
export function getCachedResult(projectId: string): CompileResult | undefined {
  return cache.get(projectId);
}

/**
 * Invalidate the cache for a project.
 */
export function invalidateCache(projectId: string): void {
  cache.delete(projectId);
}
