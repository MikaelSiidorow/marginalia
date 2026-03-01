<script lang="ts">
  import { PersistedState } from "runed";
  import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
  import FileIcon from "phosphor-svelte/lib/FileIcon";
  import FileCodeIcon from "phosphor-svelte/lib/FileCodeIcon";
  import FilePdfIcon from "phosphor-svelte/lib/FilePdfIcon";
  import FileImageIcon from "phosphor-svelte/lib/FileImageIcon";
  import FileTextIcon from "phosphor-svelte/lib/FileTextIcon";
  import FileCsvIcon from "phosphor-svelte/lib/FileCsvIcon";
  import FileHtmlIcon from "phosphor-svelte/lib/FileHtmlIcon";
  import FileZipIcon from "phosphor-svelte/lib/FileZipIcon";
  import FileMdIcon from "phosphor-svelte/lib/FileMdIcon";
  import BookBookmarkIcon from "phosphor-svelte/lib/BookBookmarkIcon";
  import GearIcon from "phosphor-svelte/lib/GearIcon";
  import FolderIcon from "phosphor-svelte/lib/FolderIcon";
  import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  export type TreeEntry = {
    path: string;
    type: "blob" | "tree";
  };

  type TreeNode = {
    name: string;
    path: string;
    type: "blob" | "tree";
    children: TreeNode[];
  };

  interface Props {
    entries: TreeEntry[];
    selectedPath: string | null;
    projectId: string;
    onselect: (path: string) => void;
  }

  let { entries, selectedPath, projectId, onselect }: Props = $props();

  // Persist expanded directories per project across sessions
  const expandedState = new PersistedState<string[]>(
    `marginalia:tree:${projectId}`,
    [],
    {
      storage: "local",
      serializer: {
        serialize: (v) => JSON.stringify(v),
        deserialize: (v) => { try { return JSON.parse(v); } catch { return undefined; } },
      },
    },
  );

  // Convenience accessors wrapping the persisted array as a Set-like interface
  const expandedDirs = {
    has(path: string) { return expandedState.current.includes(path); },
    add(path: string) {
      if (!expandedState.current.includes(path)) {
        expandedState.current = [...expandedState.current, path];
      }
    },
    delete(path: string) {
      expandedState.current = expandedState.current.filter((p) => p !== path);
    },
  };

  const tree = $derived(buildTree(entries));

  function buildTree(flat: TreeEntry[]): TreeNode[] {
    const root: TreeNode[] = [];
    const dirs = new Map<string, TreeNode>();

    // Sort: folders first, then alphabetical
    const sorted = [...flat].sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    for (const entry of sorted) {
      const parts = entry.path.split("/");
      const name = parts.at(-1) ?? entry.path;
      const node: TreeNode = { name, path: entry.path, type: entry.type, children: [] };

      if (parts.length === 1) {
        root.push(node);
      } else {
        const parentPath = parts.slice(0, -1).join("/");
        const parent = dirs.get(parentPath);
        if (parent) {
          parent.children.push(node);
        }
      }

      if (entry.type === "tree") {
        dirs.set(entry.path, node);
      }
    }

    return root;
  }

  function toggleDir(path: string) {
    if (expandedDirs.has(path)) {
      expandedDirs.delete(path);
    } else {
      expandedDirs.add(path);
    }
  }

  // Auto-expand directories containing the selected file
  $effect(() => {
    if (!selectedPath) return;
    const parts = selectedPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      expandedDirs.add(parts.slice(0, i).join("/"));
    }
  });

  type FileKind = "typst" | "pdf" | "bib" | "image" | "markdown" | "xml" | "config" | "code" | "data" | "archive" | "text" | "generic";

  function getFileKind(name: string): FileKind {
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
    switch (ext) {
      case ".typ":
        return "typst";
      case ".pdf":
        return "pdf";
      case ".bib":
        return "bib";
      case ".png":
      case ".jpg":
      case ".jpeg":
      case ".gif":
      case ".svg":
      case ".webp":
      case ".bmp":
      case ".ico":
        return "image";
      case ".md":
      case ".mdx":
        return "markdown";
      case ".xml":
      case ".csl":
      case ".html":
      case ".xsl":
      case ".xslt":
        return "xml";
      case ".toml":
      case ".yaml":
      case ".yml":
      case ".ini":
      case ".cfg":
        return "config";
      case ".json":
      case ".csv":
        return "data";
      case ".zip":
      case ".tar":
      case ".gz":
      case ".7z":
      case ".rar":
        return "archive";
      case ".js":
      case ".ts":
      case ".py":
      case ".rs":
      case ".lua":
      case ".sh":
      case ".css":
      case ".tex":
      case ".sty":
      case ".cls":
        return "code";
      case ".txt":
      case ".log":
        return "text";
      default:
        if (name.startsWith(".")) return "text";
        return "generic";
    }
  }
</script>

{#snippet fileIcon(name: string)}
  {@const kind = getFileKind(name)}
  {#if kind === "typst"}
    <FileCodeIcon size={15} weight="duotone" class="icon-typst" />
  {:else if kind === "pdf"}
    <FilePdfIcon size={15} weight="duotone" class="icon-pdf" />
  {:else if kind === "bib"}
    <BookBookmarkIcon size={15} weight="duotone" class="icon-bib" />
  {:else if kind === "image"}
    <FileImageIcon size={15} weight="duotone" class="icon-image" />
  {:else if kind === "markdown"}
    <FileMdIcon size={15} weight="duotone" class="icon-markdown" />
  {:else if kind === "xml"}
    <FileHtmlIcon size={15} weight="duotone" class="icon-xml" />
  {:else if kind === "config"}
    <GearIcon size={15} weight="duotone" class="icon-config" />
  {:else if kind === "data"}
    <FileCsvIcon size={15} weight="duotone" class="icon-data" />
  {:else if kind === "archive"}
    <FileZipIcon size={15} weight="duotone" class="icon-archive" />
  {:else if kind === "code"}
    <FileCodeIcon size={15} weight="duotone" class="icon-code" />
  {:else if kind === "text"}
    <FileTextIcon size={15} weight="duotone" class="icon-text" />
  {:else}
    <FileIcon size={15} weight="duotone" class="icon-generic" />
  {/if}
{/snippet}

{#snippet renderNodes(nodes: TreeNode[], depth: number)}
  {#each nodes as node (node.path)}
    {#if node.type === "tree"}
      {@const isOpen = expandedDirs.has(node.path)}
      <button
        class="tree-item dir"
        style="padding-left: {depth * 14 + 6}px"
        onclick={() => toggleDir(node.path)}
        title={node.name}
      >
        <CaretRightIcon
          size={11}
          weight="bold"
          class="caret {isOpen ? 'expanded' : ''}"
        />
        {#if isOpen}
          <FolderOpenIcon size={15} weight="duotone" class="icon-folder" />
        {:else}
          <FolderIcon size={15} weight="duotone" class="icon-folder" />
        {/if}
        <span class="name">{node.name}</span>
      </button>
      {#if isOpen}
        {@render renderNodes(node.children, depth + 1)}
      {/if}
    {:else}
      <button
        class="tree-item file"
        class:selected={node.path === selectedPath}
        style="padding-left: {depth * 14 + 6}px"
        onclick={() => onselect(node.path)}
        title={node.path}
      >
        <span class="caret-spacer"></span>
        {@render fileIcon(node.name)}
        <span class="name">{node.name}</span>
      </button>
    {/if}
  {/each}
{/snippet}

<nav class="file-tree" aria-label={t`File tree`}>
  {#if entries.length === 0}
    <p class="empty">{t`No files`}</p>
  {:else}
    {@render renderNodes(tree, 0)}
  {/if}
</nav>

<style>
  .file-tree {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    font-size: 12.5px;
    padding: var(--space-1) 0;
    user-select: none;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-top: 2px;
    padding-bottom: 2px;
    padding-right: var(--space-2);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-2);
    min-height: 24px;
    width: 100%;

    &:hover {
      background-color: var(--surface-2);
      color: var(--text-1);
    }

    &.selected {
      background-color: oklch(60% 0.1 260deg / 12%);
      color: var(--accent);
    }

    &.dir {
      color: var(--text-1);
      font-weight: 500;
    }
  }

  .caret-spacer {
    width: 11px;
    flex-shrink: 0;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .tree-item :global(.caret) {
    transition: transform 0.12s ease;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .tree-item :global(.caret.expanded) {
    transform: rotate(90deg);
  }

  /* All icons should not shrink */
  .tree-item :global(svg) {
    flex-shrink: 0;
  }

  /* File type icon colors */
  .tree-item :global(.icon-typst) {
    color: oklch(65% 0.18 180deg); /* teal — primary file type */
  }

  .tree-item :global(.icon-pdf) {
    color: oklch(62% 0.2 25deg); /* red */
  }

  .tree-item :global(.icon-bib) {
    color: oklch(68% 0.16 80deg); /* amber/gold */
  }

  .tree-item :global(.icon-image) {
    color: oklch(65% 0.16 150deg); /* green */
  }

  .tree-item :global(.icon-markdown) {
    color: oklch(68% 0.12 240deg); /* soft blue */
  }

  .tree-item :global(.icon-xml) {
    color: oklch(65% 0.14 30deg); /* warm red-orange */
  }

  .tree-item :global(.icon-config) {
    color: oklch(65% 0.08 250deg); /* muted blue-gray */
  }

  .tree-item :global(.icon-data) {
    color: oklch(68% 0.14 60deg); /* warm orange */
  }

  .tree-item :global(.icon-archive) {
    color: oklch(60% 0.1 300deg); /* purple */
  }

  .tree-item :global(.icon-code) {
    color: oklch(68% 0.14 260deg); /* blue */
  }

  .tree-item :global(.icon-text) {
    color: var(--text-2);
  }

  .tree-item :global(.icon-generic) {
    color: var(--text-2);
  }

  .tree-item :global(.icon-folder) {
    color: oklch(72% 0.14 75deg); /* warm folder yellow-orange */
  }

  .empty {
    padding: var(--space-3);
    color: var(--text-2);
    font-size: var(--text-sm);
  }
</style>
