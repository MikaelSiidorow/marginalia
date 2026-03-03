export interface PageInfo {
  width: number;
  height: number;
}

/**
 * Creates a reactive Typst project that compiles via server API.
 * Returns page metadata; individual page SVGs are fetched lazily via URL.
 */
export function createTypstProject() {
  let pages = $state<PageInfo[]>([]);
  let compiling = $state(false);
  let diagnostics = $state<string[]>([]);
  let error = $state<string | null>(null);
  let compiledProjectId = $state<string | null>(null);
  let compiledTimestamp = $state<number>(0);

  async function compile(projectId: string): Promise<void> {
    // Prevent duplicate concurrent compilations
    if (compiling) return;
    if (compiledProjectId === projectId && pages.length > 0) return;

    compiling = true;
    error = null;

    try {
      const res = await fetch("/api/typst/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Compilation failed (${res.status})`);
      }

      const data = await res.json();
      pages = data.pages ?? [];
      diagnostics = data.diagnostics ?? [];
      compiledTimestamp = data.timestamp ?? Date.now();
      compiledProjectId = projectId;
    } catch (e) {
      error = e instanceof Error ? e.message : "Compilation failed";
      pages = [];
      diagnostics = [];
      compiledTimestamp = 0;
    } finally {
      compiling = false;
    }
  }

  function getPageUrl(page: number): string {
    return `/api/typst/page/${page}?projectId=${compiledProjectId}&t=${compiledTimestamp}`;
  }

  return {
    get pages() {
      return pages;
    },
    get compiling() {
      return compiling;
    },
    get diagnostics() {
      return diagnostics;
    },
    get error() {
      return error;
    },
    get compiledProjectId() {
      return compiledProjectId;
    },
    compile,
    getPageUrl,
  };
}
