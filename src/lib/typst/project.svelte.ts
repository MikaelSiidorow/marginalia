export interface PageInfo {
  width: number;
  height: number;
}

/**
 * Creates a reactive Typst project that compiles via server API.
 * Returns page info and inline SVGs for virtualized rendering.
 */
export function createTypstProject() {
  let pages = $state<PageInfo[]>([]);
  let pageSvgs = $state<string[]>([]);
  let compiling = $state(false);
  let diagnostics = $state<string[]>([]);
  let error = $state<string | null>(null);
  let compiledProjectId = $state<string | null>(null);
  let compilePromise: Promise<void> | null = null;

  async function compile(projectId: string): Promise<void> {
    // Prevent duplicate concurrent compilations
    if (compiling) return;
    if (compiledProjectId === projectId && pages.length > 0) return;

    compiling = true;
    error = null;

    const promise = (async () => {
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
        pageSvgs = data.pageSvgs ?? [];
        diagnostics = data.diagnostics ?? [];
        compiledProjectId = projectId;
      } catch (e) {
        error = e instanceof Error ? e.message : "Compilation failed";
        pages = [];
        pageSvgs = [];
        diagnostics = [];
      } finally {
        compiling = false;
        compilePromise = null;
      }
    })();

    compilePromise = promise;
    return promise;
  }

  function getPageSvg(page: number): string | undefined {
    return pageSvgs[page];
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
    getPageSvg,
  };
}
