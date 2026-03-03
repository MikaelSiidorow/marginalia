<script lang="ts">
  import XIcon from "phosphor-svelte/lib/XIcon";
  import CommentsPanel from "./CommentsPanel.svelte";
  import type { CommentData } from "./CommentThread.svelte";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  interface Props {
    open: boolean;
    comments: readonly CommentData[];
    currentUserId: string;
    onresolve: (id: string) => void;
    ondelete: (id: string) => void;
    oncommentclick?: (comment: CommentData) => void;
    onclose: () => void;
  }

  let { open, comments, currentUserId, onresolve, ondelete, oncommentclick, onclose }: Props =
    $props();

  let sheetEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!sheetEl) return;
    try {
      if (open) {
        sheetEl.showPopover();
      } else if (sheetEl.matches(":popover-open")) {
        sheetEl.hidePopover();
      }
    } catch {
      // Popover may already be in the desired state
    }
  });

  function handleToggle(e: ToggleEvent) {
    if (e.newState === "closed" && open) onclose();
  }
</script>

<div class="sheet" popover="auto" bind:this={sheetEl} ontoggle={handleToggle}>
  <button class="close" onclick={onclose} aria-label={t`Close`}>
    <XIcon size={16} />
  </button>
  <CommentsPanel
    {comments}
    {currentUserId}
    pendingAnchor={null}
    onsubmit={() => {}}
    oncancelpending={() => {}}
    {onresolve}
    {ondelete}
    {oncommentclick}
  />
</div>

<style>
  .sheet {
    /* Reset popover defaults */
    margin: 0;
    padding: 0;
    border: none;
    overflow: hidden;

    /* Position as right-side sheet in top layer */
    position: fixed;
    inset: 0 0 0 auto;
    width: min(24rem, 100vw);
    height: 100dvh;
    max-height: 100dvh;

    background-color: var(--surface-1);
    border-left: 1px solid var(--border);
    box-shadow: -4px 0 24px oklch(0% 0 0deg / 15%);
  }

  .sheet:popover-open {
    display: flex;
    flex-direction: column;
    animation: slide-in 150ms ease-out;
  }

  .sheet::backdrop {
    background: oklch(0% 0 0deg / 10%);
  }

  @keyframes slide-in {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .close {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-2);

    &:hover {
      background: var(--surface-3);
      color: var(--text-1);
    }
  }
</style>
