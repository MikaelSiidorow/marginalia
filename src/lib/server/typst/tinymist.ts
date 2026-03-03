import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import WebSocket from "ws";
import { ensureWorkspace } from "./compiler";

const TINYMIST_BIN =
  process.env.TINYMIST_BIN || join(process.env.HOME || "/root", ".local/bin/tinymist");

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_SESSIONS = 20;
const CLEANUP_DELAY_MS = 30_000;

interface JumpToPreviewResult {
  page: number;
  x: number;
  y: number;
}

interface JumpToSourceResult {
  file: string;
  line: number;
  col: number;
}

interface OutlineItem {
  title: string;
  position: { page_no: number; x: number; y: number };
  children: OutlineItem[];
}

/**
 * Manages a tinymist LSP process + data plane WebSocket for a single project.
 *
 * Source->Preview: uses the document outline (heading -> page position mapping).
 * Preview->Source: uses tinymist's `src-point` WebSocket command for word-level precision.
 */
class TinymistSession {
  private process: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingLspRequests = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private buffer = "";
  private contentLength = -1;

  // Preview->Source: waiter for src-point result
  private sourceWaiter: ((result: JumpToSourceResult) => void) | null = null;

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;

  // Document outline for Source->Preview mapping
  private outline: OutlineItem[] = [];
  private outlinePromise: Promise<void>;
  private outlineResolve!: () => void;

  // Include map: relative file path -> chapter title (from parsing entry file)
  private includeMap = new Map<string, string>();
  private entryParsed = false;

  readonly projectId: string;
  private workDir = "";
  private entryFile = "";
  private taskId = "";

  constructor(projectId: string) {
    this.projectId = projectId;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.outlinePromise = new Promise((resolve) => {
      this.outlineResolve = resolve;
    });
  }

  /** Check if the underlying process is still alive. */
  isAlive(): boolean {
    return this.process !== null && this.process.exitCode === null && !this.process.killed;
  }

  async initialize(): Promise<void> {
    const workspace = await ensureWorkspace(this.projectId);
    this.workDir = workspace.workDir;
    this.entryFile = workspace.entryFile;

    this.process = spawn(TINYMIST_BIN, ["lsp"], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.workDir,
    });

    this.process.stdout!.on("data", (chunk: Buffer) => {
      this.handleLspData(chunk.toString());
    });

    this.process.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text.includes("ERROR") || text.includes("WARN")) {
        console.error(`[tinymist:${this.projectId}] ${text}`);
      }
    });

    this.process.on("exit", (code) => {
      console.log(`[tinymist:${this.projectId}] exited with code ${code}`);
      this.ready = false;
      this.process = null;
    });

    // Initialize LSP with workspace info
    await this.sendRequest("initialize", {
      processId: process.pid,
      capabilities: {
        workspace: { workspaceFolders: true, configuration: true },
      },
      rootUri: `file://${this.workDir}`,
      workspaceFolders: [{ uri: `file://${this.workDir}`, name: this.projectId }],
      initializationOptions: {
        formatterMode: "disable",
        rootPath: this.workDir,
      },
    });
    this.sendNotification("initialized", {});

    // Open the entry file so tinymist starts compilation
    const entryPath = join(this.workDir, this.entryFile);
    const entryContent = readFileSync(entryPath, "utf-8");
    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: `file://${entryPath}`,
        languageId: "typst",
        version: 1,
        text: entryContent,
      },
    });

    // Wait for initial compilation
    await new Promise((r) => setTimeout(r, 2000));

    // Start preview to get data plane port
    this.taskId = `marginalia-${this.projectId.slice(0, 8)}`;
    const previewResult = (await this.sendRequest("workspace/executeCommand", {
      command: "tinymist.doStartPreview",
      arguments: [["--task-id", this.taskId, "--data-plane-host", "127.0.0.1:0", entryPath]],
    })) as { dataPlanePort?: number; staticServerPort?: number } | null;

    if (!previewResult?.dataPlanePort && !previewResult?.staticServerPort) {
      throw new Error("tinymist preview did not return a data plane port");
    }

    const wsPort = previewResult.dataPlanePort || previewResult.staticServerPort!;
    await this.connectWebSocket(wsPort);

    this.ready = true;
    this.readyResolve();
    this.resetIdleTimer();
  }

  private async connectWebSocket(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${port}`, {
        origin: `http://127.0.0.1:${port}`,
      });

      let resolved = false;

      this.ws.on("open", () => {
        this.ws!.send("current");
      });

      this.ws.on("message", (data: Buffer | string) => {
        const buf = typeof data === "string" ? Buffer.from(data) : (data as Buffer);
        const text = buf.toString("utf8", 0, Math.min(200, buf.length));

        if (text.startsWith("diff-v1,") && !resolved) {
          resolved = true;
          resolve();
        }
      });

      this.ws.on("error", (err) => {
        console.error(`[tinymist:${this.projectId}] ws error:`, err.message);
        if (!resolved) reject(err);
      });

      this.ws.on("close", () => {
        this.ws = null;
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 15000);
    });
  }

  // --- Source -> Preview (outline-based) ---

  /**
   * Parse the entry file to build a mapping from included files to chapter titles.
   * Maps "chapters/01_introduction.typ" -> "Introduction", etc.
   */
  private parseEntryStructure(): void {
    if (this.entryParsed) return;
    this.entryParsed = true;

    try {
      const content = readFileSync(join(this.workDir, this.entryFile), "utf-8");
      const lines = content.split("\n");
      let currentHeading: string | null = null;

      for (const line of lines) {
        // Match level-1 headings: = Title <optional-label>
        const headingMatch = line.match(/^=\s+(.+?)(?:\s*<[^>]+>)?\s*$/);
        if (headingMatch) {
          currentHeading = headingMatch[1]!.trim();
          continue;
        }

        // Match includes: #include "path"
        const includeMatch = line.match(/#include\s+"([^"]+)"/);
        if (includeMatch && currentHeading) {
          this.includeMap.set(includeMatch[1]!, currentHeading);
        }
      }
    } catch {
      // Can't read entry file — outline jumps will have limited functionality
    }
  }

  /**
   * Find heading lines in a .typ file.
   * Returns headings sorted by line number.
   */
  private findHeadingsInFile(
    relPath: string,
  ): Array<{ line: number; title: string; level: number }> {
    try {
      const content = readFileSync(join(this.workDir, relPath), "utf-8");
      const lines = content.split("\n");
      const headings: Array<{ line: number; title: string; level: number }> = [];

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i]!.match(/^(=+)\s+(.+?)(?:\s*<[^>]+>)?\s*$/);
        if (match) {
          headings.push({
            line: i,
            title: match[2]!.trim(),
            level: match[1]!.length,
          });
        }
      }

      return headings;
    } catch {
      return [];
    }
  }

  /**
   * Normalize a title for fuzzy matching.
   */
  private normalizeTitle(title: string): string {
    return title.toLowerCase().trim().replace(/[^\w\s]/g, "");
  }

  /**
   * Find an outline item by title (recursive search).
   */
  private findOutlineByTitle(items: OutlineItem[], title: string): OutlineItem | null {
    const normalized = this.normalizeTitle(title);
    for (const item of items) {
      if (this.normalizeTitle(item.title) === normalized) return item;
      const child = this.findOutlineByTitle(item.children, title);
      if (child) return child;
    }
    return null;
  }

  /**
   * Source -> Preview: resolve a source location to page coordinates.
   * Uses the document outline to find the nearest heading.
   */
  async jumpToPreview(
    file: string,
    line: number,
    _col: number,
  ): Promise<JumpToPreviewResult | null> {
    await this.readyPromise;
    if (!this.ready) return null;
    this.resetIdleTimer();

    // Wait for outline (with 5s timeout)
    await Promise.race([this.outlinePromise, new Promise<void>((r) => setTimeout(r, 5000))]);

    if (this.outline.length === 0) return null;

    this.parseEntryStructure();

    let bestMatch: OutlineItem | null = null;

    if (file === this.entryFile) {
      // For the entry file, find the nearest heading at or before this line
      const headings = this.findHeadingsInFile(this.entryFile);
      let nearestTitle: string | null = null;
      for (const h of headings) {
        if (h.line <= line) nearestTitle = h.title;
        else break;
      }
      if (nearestTitle) {
        bestMatch = this.findOutlineByTitle(this.outline, nearestTitle);
      }
    } else {
      // For included files, find the parent chapter first
      const chapterTitle = this.includeMap.get(file);
      if (!chapterTitle) return null;

      const chapter = this.findOutlineByTitle(this.outline, chapterTitle);
      if (!chapter) return null;

      // Find sub-headings in the included file
      const headings = this.findHeadingsInFile(file);
      let nearestTitle: string | null = null;
      for (const h of headings) {
        if (h.line <= line) nearestTitle = h.title;
        else break;
      }

      if (nearestTitle) {
        // Try to find the sub-heading in the chapter's children
        const subMatch = this.findOutlineByTitle(chapter.children, nearestTitle);
        bestMatch = subMatch ?? chapter;
      } else {
        // Before first sub-heading — use the chapter position
        bestMatch = chapter;
      }
    }

    // Fallback: if file is in the include map, go to the chapter heading
    if (!bestMatch) {
      const chapterTitle = this.includeMap.get(file);
      if (chapterTitle) {
        bestMatch = this.findOutlineByTitle(this.outline, chapterTitle);
      }
    }

    if (!bestMatch) return null;

    return {
      page: bestMatch.position.page_no - 1, // 1-based -> 0-based
      x: bestMatch.position.x,
      y: bestMatch.position.y,
    };
  }

  // --- Preview -> Source (src-point via WebSocket) ---

  /**
   * Preview -> Source: resolve page coordinates to a source location.
   * Uses tinymist's src-point which walks the rendered frame tree.
   */
  async jumpToSource(
    page: number,
    x: number,
    y: number,
  ): Promise<JumpToSourceResult | null> {
    await this.readyPromise;
    if (!this.ready || !this.ws) return null;
    this.resetIdleTimer();

    const sourcePromise = new Promise<JumpToSourceResult | null>((resolve) => {
      this.sourceWaiter = resolve;
      setTimeout(() => {
        if (this.sourceWaiter === resolve) {
          this.sourceWaiter = null;
          resolve(null);
        }
      }, 3000);
    });

    // tinymist uses 1-based pages
    const payload = JSON.stringify({ page_no: page + 1, x, y });
    this.ws.send(`src-point ${payload}`);

    return sourcePromise;
  }

  // --- LSP JSON-RPC protocol ---

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error("LSP process not running"));
        return;
      }

      const id = ++this.requestId;
      this.pendingLspRequests.set(id, { resolve, reject });

      const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      const message = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
      this.process.stdin.write(message);

      setTimeout(() => {
        if (this.pendingLspRequests.has(id)) {
          this.pendingLspRequests.delete(id);
          reject(new Error(`LSP request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin?.writable) return;
    const body = JSON.stringify({ jsonrpc: "2.0", method, params });
    const message = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    this.process.stdin.write(message);
  }

  private sendResponse(id: number, result: unknown): void {
    if (!this.process?.stdin?.writable) return;
    const body = JSON.stringify({ jsonrpc: "2.0", id, result });
    const message = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    this.process.stdin.write(message);
  }

  private handleLspData(data: string) {
    this.buffer += data;

    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const header = this.buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }
        this.contentLength = parseInt(match[1]!, 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) break;

      const body = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;

      try {
        const msg = JSON.parse(body) as {
          id?: number;
          method?: string;
          result?: unknown;
          error?: { message: string };
          params?: unknown;
        };

        // Response to our request
        if (msg.id != null && this.pendingLspRequests.has(msg.id)) {
          const pending = this.pendingLspRequests.get(msg.id)!;
          this.pendingLspRequests.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error.message));
          else pending.resolve(msg.result);
          continue;
        }

        // Server-initiated request (needs response)
        if (msg.method && msg.id != null) {
          if (msg.method === "window/showDocument") {
            // Preview->Source: src-point produces this
            const docParams = msg.params as {
              uri?: string;
              selection?: { start: { line: number; character: number } };
            };
            this.sendResponse(msg.id, { success: true });

            if (docParams?.uri && docParams.selection && this.sourceWaiter) {
              let relPath = docParams.uri;
              if (relPath.startsWith("file://")) relPath = relPath.slice(7);
              if (relPath.startsWith(this.workDir)) relPath = relPath.slice(this.workDir.length + 1);
              this.sourceWaiter({
                file: relPath,
                line: docParams.selection.start.line + 1,
                col: docParams.selection.start.character,
              });
              this.sourceWaiter = null;
            }
          } else if (msg.method === "workspace/configuration") {
            // Provide rootPath so tinymist resolves workspace correctly
            const items = ((msg.params as Record<string, unknown>)?.items ?? []) as {
              section?: string;
            }[];
            const result = items.map((item) =>
              item.section === "tinymist" ? { rootPath: this.workDir } : {},
            );
            this.sendResponse(msg.id, result);
          } else {
            this.sendResponse(msg.id, null);
          }
          continue;
        }

        // Notifications
        if (msg.method === "tinymist/documentOutline") {
          const params = msg.params as { items?: OutlineItem[] };
          if (params?.items && params.items.length > 0) {
            this.outline = params.items;
            this.outlineResolve();
          }
        } else if (msg.method === "tinymist/preview/scrollSource") {
          // Alternative preview->source path
          const info = msg.params as {
            filepath?: string;
            start?: [number, number] | null;
          };
          if (info?.filepath && info.start && this.sourceWaiter) {
            let relPath = info.filepath;
            if (relPath.startsWith("file://")) relPath = relPath.slice(7);
            if (relPath.startsWith(this.workDir)) relPath = relPath.slice(this.workDir.length + 1);
            this.sourceWaiter({
              file: relPath,
              line: info.start[0] + 1,
              col: info.start[1],
            });
            this.sourceWaiter = null;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.dispose(), IDLE_TIMEOUT);
  }

  dispose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.ws?.close();
    this.ws = null;
    if (this.process) {
      this.sendNotification("shutdown", null);
      setTimeout(() => {
        this.process?.kill();
        this.process = null;
      }, 1000);
    }
    this.ready = false;
    sessions.delete(this.projectId);

    // Clean up temp dir after a delay (avoids racing with concurrent page requests)
    const workDir = this.workDir;
    if (workDir) {
      setTimeout(() => {
        rm(workDir, { recursive: true, force: true }).catch(() => {});
      }, CLEANUP_DELAY_MS);
    }
  }
}

// Session pool: one per project, insertion-ordered for LRU eviction
const sessions = new Map<string, TinymistSession>();
const initPromises = new Map<string, Promise<TinymistSession>>();

/**
 * Evict the oldest session if at the limit.
 */
function evictIfNeeded() {
  if (sessions.size < MAX_SESSIONS) return;
  // Map iteration is in insertion order — first key is the oldest
  const oldestKey = sessions.keys().next().value;
  if (oldestKey) {
    const oldest = sessions.get(oldestKey);
    console.log(`[tinymist] evicting oldest session: ${oldestKey}`);
    oldest?.dispose();
  }
}

async function getSession(projectId: string): Promise<TinymistSession> {
  const existing = sessions.get(projectId);
  if (existing) {
    // Crash recovery: check if process is still alive
    if (!existing.isAlive()) {
      console.log(`[tinymist:${projectId}] process dead, removing stale session`);
      sessions.delete(projectId);
    } else {
      // Move to end of map for LRU (delete + re-insert)
      sessions.delete(projectId);
      sessions.set(projectId, existing);
      return existing;
    }
  }

  const pending = initPromises.get(projectId);
  if (pending) return pending;

  const promise = (async () => {
    evictIfNeeded();
    const session = new TinymistSession(projectId);
    try {
      await session.initialize();
      sessions.set(projectId, session);
      return session;
    } catch (e) {
      session.dispose();
      throw e;
    } finally {
      initPromises.delete(projectId);
    }
  })();

  initPromises.set(projectId, promise);
  return promise;
}

/**
 * Source -> Preview: resolve a source location to page coordinates.
 */
export async function jumpToPreview(
  projectId: string,
  file: string,
  line: number,
  col: number,
): Promise<JumpToPreviewResult | null> {
  const session = await getSession(projectId);
  return session.jumpToPreview(file, line, col);
}

/**
 * Preview -> Source: resolve page coordinates to a source location.
 */
export async function jumpToSource(
  projectId: string,
  page: number,
  x: number,
  y: number,
): Promise<JumpToSourceResult | null> {
  const session = await getSession(projectId);
  return session.jumpToSource(page, x, y);
}
