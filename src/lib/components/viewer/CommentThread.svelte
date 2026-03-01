<script lang="ts">
  import CheckIcon from "phosphor-svelte/lib/CheckIcon";
  import TrashIcon from "phosphor-svelte/lib/TrashIcon";
  import Button from "$lib/components/ui/Button";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  export type CommentData = {
    readonly id: string;
    readonly authorId: string;
    readonly author:
      | { readonly id: string; readonly name: string; readonly image: string | null }
      | undefined;
    readonly anchorFile: string | null;
    readonly anchorLine: number | null;
    readonly body: string;
    readonly resolved: boolean | null;
    readonly createdAt: number | null;
  };

  interface Props {
    comment: CommentData;
    currentUserId: string;
    onresolve: (id: string) => void;
    ondelete: (id: string) => void;
    onclick?: () => void;
  }

  let { comment, currentUserId, onresolve, ondelete, onclick }: Props = $props();

  const authorName = $derived(comment.author?.name ?? "Unknown");
  const isAuthor = $derived(comment.authorId === currentUserId);
  const timeAgo = $derived(
    comment.createdAt ? formatTimeAgo(comment.createdAt) : "",
  );

  function formatTimeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t`just now`;
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
</script>

<div
  class="comment"
  class:resolved={comment.resolved}
  role="button"
  tabindex="0"
  onclick={() => onclick?.()}
  onkeydown={(e) => e.key === "Enter" && onclick?.()}
>
  <div class="comment-header">
    <strong class="author">{authorName}</strong>
    {#if comment.anchorFile && comment.anchorLine}
      <span class="anchor">
        {comment.anchorFile}:{comment.anchorLine}
      </span>
    {/if}
    <span class="time">{timeAgo}</span>
  </div>
  <p class="body">{comment.body}</p>
  <div class="actions">
    {#if !comment.resolved}
      <Button variant="ghost" onclick={() => onresolve(comment.id)}>
        <CheckIcon size={14} />
        {t`Resolve`}
      </Button>
    {/if}
    {#if isAuthor}
      <Button variant="ghost" onclick={() => ondelete(comment.id)}>
        <TrashIcon size={14} />
      </Button>
    {/if}
  </div>
</div>

<style>
  .comment {
    padding: var(--space-3);
    border-bottom: 1px solid var(--border);
    cursor: pointer;

    &:hover {
      background-color: var(--surface-2);
    }

    &.resolved {
      opacity: 0.6;
    }
  }

  .comment-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .author {
    font-size: var(--text-sm);
  }

  .anchor {
    font-size: var(--text-xs);
    color: var(--accent);
    font-family: monospace;
  }

  .time {
    font-size: var(--text-xs);
    color: var(--text-2);
    margin-left: auto;
  }

  .body {
    font-size: var(--text-sm);
    color: var(--text-1);
    white-space: pre-wrap;
  }

  .actions {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }
</style>
