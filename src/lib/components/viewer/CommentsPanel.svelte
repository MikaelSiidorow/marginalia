<script lang="ts">
  import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
  import Button from "$lib/components/ui/Button";
  import Textarea from "$lib/components/ui/Textarea";
  import CommentThread, { type CommentData } from "./CommentThread.svelte";
  import { createForm } from "@mikstack/form";
  import * as v from "valibot";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  interface Props {
    comments: readonly CommentData[];
    currentUserId: string;
    /** Currently pending comment (from gutter click) */
    pendingAnchor: { file: string; line: number } | null;
    onsubmit: (body: string) => void;
    oncancelpending: () => void;
    onresolve: (id: string) => void;
    ondelete: (id: string) => void;
    oncommentclick?: (comment: CommentData) => void;
  }

  let {
    comments,
    currentUserId,
    pendingAnchor,
    onsubmit,
    oncancelpending,
    onresolve,
    ondelete,
    oncommentclick,
  }: Props = $props();

  const form = createForm({
    schema: v.object({
      body: v.pipe(v.string(), v.minLength(1)),
    }),
    initialValues: { body: "" },
    async onSubmit(data) {
      onsubmit(data.body.trim());
      form.reset();
    },
  });

  const bodyProps = $derived(form.fields.body.as("text"));

  const unresolvedComments = $derived(comments.filter((c) => !c.resolved));
  const resolvedComments = $derived(comments.filter((c) => c.resolved));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      (document.getElementById(form.id) as HTMLFormElement | null)?.requestSubmit();
    }
  }
</script>

<div class="panel">
  <div class="panel-header">
    <ChatCircleIcon size={16} />
    <h3>{t`Comments`}</h3>
    <span class="count">{unresolvedComments.length}</span>
  </div>

  {#if pendingAnchor}
    <div class="new-comment">
      <div class="anchor-info">
        {pendingAnchor.file}:{pendingAnchor.line}
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <form id={form.id} onsubmit={form.onsubmit} onkeydown={handleKeydown}>
        <Textarea
          name={bodyProps.name}
          id={bodyProps.id}
          value={String(bodyProps.value ?? "")}
          oninput={bodyProps.oninput}
          onblur={bodyProps.onblur}
          placeholder={t`Write a comment...`}
          autofocus
        />
        <div class="form-actions">
          <Button type="submit" disabled={form.pending}>
            {t`Comment`}
          </Button>
          <Button variant="ghost" type="button" onclick={oncancelpending}>
            {t`Cancel`}
          </Button>
        </div>
      </form>
    </div>
  {/if}

  <div class="comment-list">
    {#each unresolvedComments as comment (comment.id)}
      <CommentThread
        {comment}
        {currentUserId}
        {onresolve}
        {ondelete}
        onclick={() => oncommentclick?.(comment)}
      />
    {/each}

    {#if resolvedComments.length > 0}
      <details class="resolved-section">
        <summary>{t`Resolved`} ({resolvedComments.length})</summary>
        {#each resolvedComments as comment (comment.id)}
          <CommentThread
            {comment}
            {currentUserId}
            {onresolve}
            {ondelete}
            onclick={() => oncommentclick?.(comment)}
          />
        {/each}
      </details>
    {/if}

    {#if comments.length === 0 && !pendingAnchor}
      <p class="empty">{t`No comments yet. Click a line number to add one.`}</p>
    {/if}
  </div>
</div>

<style>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;

    & h3 {
      font-size: var(--text-sm);
      font-weight: 600;
    }
  }

  .count {
    font-size: var(--text-xs);
    background-color: var(--surface-3);
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
  }

  .new-comment {
    padding: var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--surface-2);
    flex-shrink: 0;
  }

  .anchor-info {
    font-size: var(--text-xs);
    color: var(--accent);
    font-family: monospace;
    margin-bottom: var(--space-2);
  }

  .new-comment form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-actions {
    display: flex;
    gap: var(--space-2);
  }

  .comment-list {
    overflow-y: auto;
    flex: 1;
  }

  .resolved-section {
    border-top: 1px solid var(--border);
  }

  .resolved-section summary {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    color: var(--text-2);
    cursor: pointer;
  }

  .empty {
    padding: var(--space-4);
    color: var(--text-2);
    font-size: var(--text-sm);
    text-align: center;
  }
</style>
