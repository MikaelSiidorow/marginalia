<script lang="ts">
  import FileTree, { type TreeEntry } from "$lib/components/viewer/FileTree.svelte";
  import SourceEditor from "$lib/components/viewer/SourceEditor.svelte";
  import PreviewPane, { type SourceLocation } from "$lib/components/viewer/PreviewPane.svelte";
  import CommentsSheet from "$lib/components/viewer/CommentsSheet.svelte";
  import type { CommentData } from "$lib/components/viewer/CommentThread.svelte";
  import TopBar from "$lib/components/viewer/TopBar.svelte";
  import ShareDialog from "$lib/components/viewer/ShareDialog.svelte";
  import { get_z } from "$lib/z.svelte";
  import { queries } from "$lib/zero/queries";
  import { mutators } from "$lib/zero/mutators";
  import { createTypstProject } from "$lib/typst/project.svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  let { data, params } = $props();
  const projectId = $derived(params.id);
  const userId = $derived(data.user.id);

  const z = get_z();
  const membershipQuery = $derived(z.q(queries.project.byId({ id: projectId })));
  const membership = $derived(membershipQuery.data[0]);
  const project = $derived(membership?.project);
  const members = $derived(project?.members ?? []);
  const comments = $derived(project?.comments ?? []);

  const TEXT_EXTENSIONS = new Set([
    ".typ", ".txt", ".md", ".bib", ".csv", ".json", ".yaml", ".yml", ".toml", ".xml", ".html",
    ".css", ".js", ".ts", ".py", ".rs", ".tex", ".sty", ".cls", ".lua", ".sh", ".cfg", ".ini",
    ".csl", ".xsl", ".xslt", ".log", ".gitignore",
  ]);

  function isTextFile(path: string) {
    const dot = path.lastIndexOf(".");
    return dot !== -1 && TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
  }

  // File tree state
  let treeEntries = $state<TreeEntry[]>([]);
  let blobShas = $state(new Map<string, string>());
  let treeLoading = $state(true);
  let selectedFile = $state<string | null>(null);
  let fileContent = $state("");
  let fileLoading = $state(false);

  // Typst project (server-side compilation)
  const typstProject = createTypstProject();

  // Bidirectional source ↔ preview jump
  let scrollTarget = $state<{ page: number; y: number } | null>(null);
  let editorRef: SourceEditor | undefined = $state();

  // Comments state
  let pendingAnchor = $state<{ file: string; line: number } | null>(null);

  // Share dialog
  let shareOpen = $state(false);

  // Comments sheet
  let commentsOpen = $state(false);

  // Comment lines for the current file
  const commentLinesForFile = $derived(
    new Set(
      comments
        .filter((c) => c.anchorFile === selectedFile && c.anchorLine != null && !c.resolved)
        .map((c) => c.anchorLine!),
    ),
  );

  function fileUrl(path: string, sha?: string) {
    let url = `/api/github/file?projectId=${projectId}&path=${encodeURIComponent(path)}`;
    if (sha) url += `&sha=${sha}`;
    url += `&v=${__BUILD_VERSION__}`;
    return url;
  }

  // Load file tree when project loads
  $effect(() => {
    if (project) loadTree();
  });

  async function loadTree() {
    treeLoading = true;
    try {
      const res = await fetch(`/api/github/tree?projectId=${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      const rawTree: { path: string; type: "blob" | "tree"; sha: string }[] = data.tree ?? [];
      treeEntries = rawTree.map((e) => ({ path: e.path, type: e.type }));
      blobShas = new Map(rawTree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]));

      // Trigger server-side compilation
      typstProject.compile(projectId);

      // Restore file from URL or auto-select entry file
      const fileFromUrl = page.url.searchParams.get("file");
      const initialFile = fileFromUrl ?? project?.entryFile;
      if (!selectedFile && initialFile) {
        await selectFile(initialFile);
      }
    } finally {
      treeLoading = false;
    }
  }

  async function selectFile(path: string) {
    selectedFile = path;
    pendingAnchor = null;

    // Sync to URL without adding history entry
    const url = new URL(page.url);
    url.searchParams.set("file", path);
    replaceState(url, {});

    if (!isTextFile(path)) {
      fileContent = "";
      return;
    }

    fileLoading = true;
    try {
      const res = await fetch(fileUrl(path, blobShas.get(path)));
      if (res.ok) {
        fileContent = await res.text();
      }
    } finally {
      fileLoading = false;
    }
  }

  // Source → Preview: click triggers jump to nearest heading in preview
  let jumpAbort: AbortController | undefined;
  function handleEditorClick(line: number) {
    if (!selectedFile) return;
    jumpAbort?.abort();
    jumpAbort = new AbortController();
    fetch("/api/typst/jump", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        direction: "toPreview",
        file: selectedFile,
        line,
        col: 0,
      }),
      signal: jumpAbort.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.page != null && data?.y != null) {
          scrollTarget = { page: data.page, y: data.y };
        }
      })
      .catch(() => {
        // silently ignore jump failures and aborts
      });
  }

  // Preview → Source: click on preview element
  async function handleSourceLoc(loc: SourceLocation) {
    // Navigate to the file if different
    if (loc.file !== selectedFile) {
      await selectFile(loc.file);
    }
    // Scroll editor to the line
    requestAnimationFrame(() => {
      editorRef?.scrollToLine(loc.line);
    });
  }

  function handleLineGutterClick(line: number) {
    if (!selectedFile) return;
    pendingAnchor = { file: selectedFile, line };
  }

  async function handleCommentSubmit(body: string) {
    if (!pendingAnchor) return;
    await z.mutate(
      mutators.comment.create({
        id: crypto.randomUUID(),
        projectId,
        anchorType: "source",
        anchorFile: pendingAnchor.file,
        anchorLine: pendingAnchor.line,
        body,
      }),
    );
    pendingAnchor = null;
  }

  async function handleResolve(commentId: string) {
    await z.mutate(mutators.comment.resolve({ id: commentId, projectId }));
  }

  async function handleDelete(commentId: string) {
    await z.mutate(mutators.comment.delete({ id: commentId }));
  }

  function handleCommentClick(comment: CommentData) {
    if (comment.anchorFile && comment.anchorFile !== selectedFile) {
      selectFile(comment.anchorFile);
    }
  }
</script>

{#if !project}
  <div class="loading">{t`Loading project...`}</div>
{:else}
  <div class="viewer">
    <TopBar
      repoFullName={project.repoFullName}
      branch={project.defaultBranch ?? "main"}
      memberCount={members.length}
      commentCount={comments.filter((c) => !c.resolved).length}
      onshare={() => (shareOpen = true)}
      oncomments={() => (commentsOpen = true)}
    />

    <div class="panes">
      <aside class="file-panel">
        {#if treeLoading}
          <p class="panel-loading">{t`Loading files...`}</p>
        {:else}
          <FileTree entries={treeEntries} selectedPath={selectedFile} {projectId} onselect={selectFile} />
        {/if}
      </aside>

      <div class="source-panel">
        {#if fileLoading}
          <p class="panel-loading">{t`Loading...`}</p>
        {:else if selectedFile && isTextFile(selectedFile)}
          <SourceEditor
            bind:this={editorRef}
            content={fileContent}
            filename={selectedFile}
            commentLines={commentLinesForFile}
            pendingLine={pendingAnchor?.file === selectedFile ? pendingAnchor.line : null}
            onlinegutterclick={handleLineGutterClick}
            oncommentsubmit={handleCommentSubmit}
            oncancelpending={() => (pendingAnchor = null)}
            oncursorchange={handleEditorClick}
          />
        {:else if selectedFile}
          <p class="panel-loading">{t`Binary file — no preview available`}</p>
        {:else}
          <p class="panel-loading">{t`Select a file to view`}</p>
        {/if}
      </div>

      <div class="preview-panel">
        <PreviewPane
          {projectId}
          pages={typstProject.pages}
          compiling={typstProject.compiling}
          error={typstProject.error}
          diagnostics={typstProject.diagnostics}
          getPageUrl={(page) => typstProject.getPageUrl(page)}
          {scrollTarget}
          onsourceloc={handleSourceLoc}
        />
      </div>
    </div>
  </div>

  <CommentsSheet
    open={commentsOpen}
    {comments}
    currentUserId={userId}
    onresolve={handleResolve}
    ondelete={handleDelete}
    oncommentclick={handleCommentClick}
    onclose={() => (commentsOpen = false)}
  />

  <ShareDialog bind:open={shareOpen} {projectId} onclose={() => (shareOpen = false)} />
{/if}

<style>
  .viewer {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
  }

  .panes {
    display: grid;
    grid-template-columns: 12rem 1fr 1fr;
    flex: 1;
    overflow: hidden;
  }

  .file-panel {
    border-right: 1px solid var(--border);
    overflow-y: auto;
    background-color: var(--surface-1);
  }

  .source-panel {
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  .preview-panel {
    overflow: hidden;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100dvh;
    color: var(--text-2);
  }

  .panel-loading {
    padding: var(--space-3);
    color: var(--text-2);
    font-size: var(--text-sm);
  }

  @media (max-width: 80rem) {
    .panes {
      grid-template-columns: 10rem 1fr 1fr;
    }
  }

  @media (max-width: 60rem) {
    .panes {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }

    .file-panel,
    .preview-panel {
      display: none;
    }
  }
</style>
