<script lang="ts">
  import type { PageInfo } from "$lib/typst/project.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import SpinnerIcon from "phosphor-svelte/lib/SpinnerIcon";
  import WarningIcon from "phosphor-svelte/lib/WarningIcon";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  export interface SourceLocation {
    file: string;
    line: number;
    col: number;
  }

  interface Props {
    projectId: string;
    pages: PageInfo[];
    compiling: boolean;
    error: string | null;
    diagnostics: string[];
    getPageSvg: (page: number) => string | undefined;
    scrollTarget: { page: number; y: number } | null;
    onsourceloc?: (loc: SourceLocation) => void;
  }

  let {
    projectId,
    pages,
    compiling,
    error,
    diagnostics,
    getPageSvg,
    scrollTarget,
    onsourceloc,
  }: Props = $props();

  let previewEl: HTMLDivElement | undefined = $state();

  // Not reactive — only used internally for IntersectionObserver management
  let observer: IntersectionObserver | undefined;

  // Track which pages have their SVG injected into the DOM
  let renderedPages = new SvelteSet<number>();

  function observeSlots() {
    if (!previewEl || !observer) return;
    observer.disconnect();
    const slots = previewEl.querySelectorAll<HTMLElement>(".page-slot");
    for (const slot of slots) {
      observer.observe(slot);
    }
  }

  // Set up IntersectionObserver once when previewEl is available
  $effect(() => {
    if (!previewEl) return;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageIndex = parseInt(
            (entry.target as HTMLElement).dataset.page!,
            10,
          );
          if (entry.isIntersecting) {
            renderPage(pageIndex, entry.target as HTMLElement);
          } else {
            unrenderPage(pageIndex, entry.target as HTMLElement);
          }
        }
      },
      {
        root: previewEl,
        rootMargin: "100% 0px",
      },
    );

    observeSlots();

    return () => {
      observer?.disconnect();
      observer = undefined;
    };
  });

  // Re-observe when pages change
  $effect(() => {
    const _pages = pages;
    renderedPages.clear();
    queueMicrotask(() => observeSlots());
  });

  function renderPage(pageIndex: number, slot: HTMLElement) {
    if (renderedPages.has(pageIndex)) return;

    const svg = getPageSvg(pageIndex);
    if (!svg) return;

    const container = slot.querySelector(".page-content") as HTMLElement;
    if (container) {
      // Use Shadow DOM to isolate SVG styles from the rest of the page
      let shadow = container.shadowRoot;
      if (!shadow) {
        shadow = container.attachShadow({ mode: "open" });
      }
      shadow.innerHTML = `<style>svg { display: block; width: 100%; height: auto; }</style>${svg}`;
      renderedPages.add(pageIndex);
    }
  }

  function unrenderPage(pageIndex: number, slot: HTMLElement) {
    const container = slot.querySelector(".page-content") as HTMLElement;
    if (container && renderedPages.has(pageIndex)) {
      const shadow = container.shadowRoot;
      if (shadow) shadow.innerHTML = "";
      renderedPages.delete(pageIndex);
    }
  }

  // Scroll to a specific page + y position (triggered by source→preview jumps)
  $effect(() => {
    if (scrollTarget == null || !previewEl || pages.length === 0) return;
    const { page: targetPage, y: targetY } = scrollTarget;

    requestAnimationFrame(() => {
      if (!previewEl) return;
      const slots = previewEl.querySelectorAll<HTMLElement>(".page-slot");
      const slot = slots[targetPage];
      if (!slot) return;

      const pageInfo = pages[targetPage];
      if (!pageInfo) return;

      const scale = slot.clientWidth / pageInfo.width;
      const slotRect = slot.getBoundingClientRect();
      const containerRect = previewEl.getBoundingClientRect();

      const scrollY =
        slotRect.top - containerRect.top + previewEl.scrollTop + targetY * scale;
      previewEl.scrollTo({
        top: Math.max(0, scrollY - 80),
        behavior: "smooth",
      });
    });
  });

  // Handle clicks on preview pages to resolve source location (preview → source)
  function handlePreviewClick(event: MouseEvent) {
    if (!onsourceloc || !previewEl) return;

    // Check the real target inside shadow DOM via composedPath
    const realTarget = event.composedPath()[0] as Element | undefined;
    // Don't intercept internal link clicks (handleTypstLocation)
    if (realTarget?.closest?.("[onclick]")) return;

    // Find which page-slot was clicked (event.target is retargeted outside shadow DOM)
    const target = event.target as Element;
    const slot = target.closest<HTMLElement>(".page-slot");
    if (!slot) return;

    const pageIndex = parseInt(slot.dataset.page!, 10);
    const pageInfo = pages[pageIndex];
    if (!pageInfo) return;

    // Convert pixel coordinates to Typst pt coordinates (SVG is inside Shadow DOM)
    const content = slot.querySelector(".page-content") as HTMLElement;
    const svg = content?.shadowRoot?.querySelector("svg");
    if (!svg) return;

    const svgRect = svg.getBoundingClientRect();
    const scale = pageInfo.width / svgRect.width;

    const xPt = (event.clientX - svgRect.left) * scale;
    const yPt = (event.clientY - svgRect.top) * scale;

    // Call the jump API
    fetch("/api/typst/jump", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        direction: "toSource",
        page: pageIndex,
        x: xPt,
        y: yPt,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.file && data?.line) {
          onsourceloc!({ file: data.file, line: data.line, col: data.col ?? 0 });
        }
      })
      .catch(() => {
        // silently ignore jump failures
      });
  }

  // Register global handler for SVG internal links (TOC, cross-references).
  // The renderer bakes onclick="handleTypstLocation(this, page, x, y)" into SVG elements.
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).handleTypstLocation = (
      _elem: Element,
      pageNo: number,
      _x: number,
      y: number,
    ) => {
      if (!previewEl) return;
      const slots = previewEl.querySelectorAll<HTMLElement>(".page-slot");
      const slot = slots[pageNo - 1];
      if (!slot) return;

      const slotRect = slot.getBoundingClientRect();
      const containerRect = previewEl.getBoundingClientRect();

      const pageInfo = pages[pageNo - 1];
      if (!pageInfo) return;
      const scale = slot.clientWidth / pageInfo.width;

      const scrollY =
        slotRect.top - containerRect.top + previewEl.scrollTop + y * scale;
      previewEl.scrollTo({
        top: Math.max(0, scrollY - 50),
        behavior: "smooth",
      });
    };
  }
</script>

<div class="preview" bind:this={previewEl}>
  {#if compiling}
    <div class="status">
      <SpinnerIcon size={20} class="spinner" />
      <span>{t`Compiling...`}</span>
    </div>
  {/if}

  {#if error}
    <div class="status error">
      <WarningIcon size={20} />
      <span>{error}</span>
    </div>
  {/if}

  {#if diagnostics.length > 0}
    <details class="diagnostics" open={pages.length === 0}>
      <summary>{t`Diagnostics`} ({diagnostics.length})</summary>
      <pre>{diagnostics.join("\n")}</pre>
    </details>
  {/if}

  {#if pages.length === 0 && !compiling && !error}
    <div class="status">
      <span>{t`No preview available`}</span>
    </div>
  {/if}

  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="pages" onclick={handlePreviewClick}>
    {#each pages as page, i (i)}
      <div
        class="page-slot"
        data-page={i}
        style:aspect-ratio="{page.width} / {page.height}"
      >
        <div class="page-content"></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .preview {
    height: 100%;
    overflow-y: auto;
    background-color: var(--surface-2);
    display: flex;
    flex-direction: column;
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    color: var(--text-2);
    font-size: var(--text-sm);
  }

  .status.error {
    color: var(--danger);
  }

  .status :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .diagnostics {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    background-color: var(--surface-3);
    border-bottom: 1px solid var(--border);
  }

  .diagnostics summary {
    cursor: pointer;
    color: var(--text-2);
  }

  .diagnostics pre {
    margin-top: var(--space-2);
    white-space: pre-wrap;
    color: var(--danger);
  }

  .pages {
    flex: 1;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .page-slot {
    width: 100%;
    background: white;
    box-shadow:
      0 1px 3px rgb(0 0 0 / 10%),
      0 1px 2px rgb(0 0 0 / 6%);
    border-radius: 2px;
  }

  .page-content {
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

  /* SVG styles are injected into Shadow DOM via renderPage */
</style>
