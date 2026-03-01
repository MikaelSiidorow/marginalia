<script lang="ts">
  import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
  import GitBranchIcon from "phosphor-svelte/lib/GitBranchIcon";
  import ShareNetworkIcon from "phosphor-svelte/lib/ShareNetworkIcon";
  import UsersIcon from "phosphor-svelte/lib/UsersIcon";
  import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
  import Button from "$lib/components/ui/Button";
  import { resolve } from "$app/paths";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  interface Props {
    repoFullName: string;
    branch: string;
    memberCount: number;
    commentCount?: number;
    onshare: () => void;
    oncomments?: () => void;
  }

  let { repoFullName, branch, memberCount, commentCount = 0, onshare, oncomments }: Props = $props();
</script>

<header class="topbar">
  <div class="left">
    <a href={resolve("/")} class="back" aria-label={t`Back to projects`}>
      <ArrowLeftIcon size={16} />
    </a>
    <span class="project-name">{repoFullName}</span>
    <span class="badge">
      <GitBranchIcon size={12} />
      {branch}
    </span>
  </div>
  <div class="right">
    <Button variant="secondary" onclick={oncomments}>
      <ChatCircleIcon size={14} />
      {t`Comments`}
      {#if commentCount > 0}
        <span class="comment-count">{commentCount}</span>
      {/if}
    </Button>
    <span class="badge">
      <UsersIcon size={12} />
      {memberCount}
    </span>
    <Button variant="secondary" onclick={onshare}>
      <ShareNetworkIcon size={14} />
      {t`Share`}
    </Button>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--surface-1);
    flex-shrink: 0;
    gap: var(--space-3);
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .back {
    display: flex;
    align-items: center;
    color: var(--text-2);

    &:hover {
      color: var(--text-1);
    }
  }

  .project-name {
    font-weight: 600;
    font-size: var(--text-sm);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-2);
    padding: var(--space-1) var(--space-2);
    background-color: var(--surface-2);
    border-radius: var(--radius-sm);
  }

  .comment-count {
    font-size: var(--text-xs);
    font-weight: 600;
    background-color: var(--accent);
    color: white;
    padding: 0 var(--space-1);
    border-radius: var(--radius-full, 9999px);
    min-width: 1.25rem;
    text-align: center;
    line-height: 1.25rem;
  }
</style>
