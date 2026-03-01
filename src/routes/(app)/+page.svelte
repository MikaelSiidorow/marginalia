<script lang="ts">
  import GithubLogoIcon from "phosphor-svelte/lib/GithubLogoIcon";
  import PlusIcon from "phosphor-svelte/lib/PlusIcon";
  import SignOutIcon from "phosphor-svelte/lib/SignOutIcon";
  import UsersIcon from "phosphor-svelte/lib/UsersIcon";
  import GitBranchIcon from "phosphor-svelte/lib/GitBranchIcon";
  import Button from "$lib/components/ui/Button";
  import Separator from "$lib/components/ui/Separator";
  import { dropAllDatabases } from "@rocicorp/zero";
  import { resolve } from "$app/paths";
  import { authClient } from "$lib/auth-client";
  import { get_z } from "$lib/z.svelte";
  import { queries } from "$lib/zero/queries";
  import { useLingui } from "@mikstack/svelte-lingui";
  import LocaleSwitcher from "$lib/LocaleSwitcher.svelte";
  const { t } = useLingui();

  let { data } = $props();

  const z = get_z();
  const membershipsQuery = z.q(queries.project.mine());
  const memberships = $derived(membershipsQuery.data);

  let githubConnected = $state<boolean | null>(null);

  $effect(() => {
    checkGitHub();
  });

  async function checkGitHub() {
    try {
      const res = await fetch("/api/github/repos");
      githubConnected = res.ok;
    } catch {
      githubConnected = false;
    }
  }

  async function connectGitHub() {
    await authClient.linkSocial({ provider: "github", callbackURL: window.location.href });
  }

  async function signOut() {
    await authClient.signOut();
    await dropAllDatabases();
    window.location.href = resolve("/sign-in");
  }
</script>

<div class="container">
  <header class="header">
    <div class="header-title">
      <h1>{t`Projects`}</h1>
    </div>
    <div class="header-actions">
      <LocaleSwitcher />
      <span class="email">{data.user.email}</span>
      <Button variant="ghost" onclick={signOut}>
        <SignOutIcon size={16} weight="bold" />
        {t`Sign out`}
      </Button>
    </div>
  </header>

  <Separator />

  <section class="actions-bar">
    {#if githubConnected === false}
      <Button onclick={connectGitHub}>
        <GithubLogoIcon size={16} weight="bold" />
        {t`Connect GitHub`}
      </Button>
    {:else if githubConnected === true}
      <a href={resolve("/projects/new")} class="new-project-link">
        <Button>
          <PlusIcon size={16} weight="bold" />
          {t`New project`}
        </Button>
      </a>
    {/if}
  </section>

  <section>
    {#if memberships.length === 0}
      <p class="empty">{t`No projects yet. Create one to get started!`}</p>
    {:else}
      <div class="project-grid">
        {#each memberships as membership (membership.id)}
          {#if membership.project}
            {@const project = membership.project}
            <a href={resolve(`/projects/${project.id}`)} class="project-card">
              <div class="project-header">
                <strong class="project-name">{project.repoFullName}</strong>
                <span class="role-badge" data-role={membership.role}>{membership.role}</span>
              </div>
              <div class="project-meta">
                <span class="meta-item">
                  <GitBranchIcon size={14} />
                  {project.defaultBranch}
                </span>
                <span class="meta-item">
                  <UsersIcon size={14} />
                  {project.members.length}
                </span>
              </div>
            </a>
          {/if}
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .container {
    max-width: 56rem;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .header-title h1 {
    font-size: var(--text-2xl);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .email {
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .actions-bar {
    display: flex;
    gap: var(--space-3);
  }

  .new-project-link {
    text-decoration: none;
  }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: var(--space-4);
  }

  .project-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background-color: var(--surface-2);
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s;

    &:hover {
      border-color: var(--accent);
    }
  }

  .project-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .project-name {
    font-size: var(--text-base);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-badge {
    font-size: var(--text-xs);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background-color: var(--surface-3);
    white-space: nowrap;

    &[data-role="owner"] {
      color: var(--accent);
    }
  }

  .project-meta {
    display: flex;
    gap: var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .empty {
    color: var(--text-2);
    font-size: var(--text-sm);
  }
</style>
