<script lang="ts">
  import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
  import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
  import LockIcon from "phosphor-svelte/lib/LockIcon";
  import Button from "$lib/components/ui/Button";
  import FormField from "$lib/components/ui/FormField";
  import Input from "$lib/components/ui/Input";
  import { createForm } from "@mikstack/form";
  import * as v from "valibot";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { get_z } from "$lib/z.svelte";
  import { mutators } from "$lib/zero/mutators";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  type Repo = {
    id: number;
    fullName: string;
    name: string;
    owner: string;
    ownerAvatar: string;
    defaultBranch: string;
    private: boolean;
    description: string | null;
  };

  const z = get_z();

  let repos = $state<Repo[]>([]);
  let loading = $state(true);
  let search = $state("");
  let selectedRepo = $state<Repo | null>(null);

  const filteredRepos = $derived(
    search ? repos.filter((r) => r.fullName.toLowerCase().includes(search.toLowerCase())) : repos,
  );

  const form = createForm({
    schema: v.object({
      entryFile: v.pipe(v.string(), v.minLength(1, t`Required`)),
    }),
    initialValues: { entryFile: "main.typ" },
    async onSubmit(data) {
      if (!selectedRepo) return;
      const id = crypto.randomUUID();
      z.mutate(
        mutators.project.create({
          id,
          repoFullName: selectedRepo.fullName,
          defaultBranch: selectedRepo.defaultBranch,
          entryFile: data.entryFile,
        }),
      );
      await goto(resolve(`/projects/${id}`));
    },
  });

  const entryFileField = form.fields.entryFile;

  $effect(() => {
    void loadRepos();
  });

  async function loadRepos() {
    try {
      const res = await fetch("/api/github/repos");
      if (res.ok) {
        repos = await res.json();
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="container">
  <a href={resolve("/")} class="back-link">
    <ArrowLeftIcon size={16} />
    {t`Back to projects`}
  </a>

  <h1>{t`New project`}</h1>

  {#if loading}
    <p class="loading">{t`Loading repositories...`}</p>
  {:else if selectedRepo}
    <div class="selected-repo">
      <div class="repo-info">
        <strong>{selectedRepo.fullName}</strong>
        <Button variant="ghost" onclick={() => (selectedRepo = null)}>
          {t`Change`}
        </Button>
      </div>

      <form id={form.id} onsubmit={form.onsubmit} class="create-form">
        <FormField for={entryFileField.as("text").id}>
          {#snippet label(attrs)}
            <label {...attrs}>{t`Entry file`}</label>
          {/snippet}
          <Input {...entryFileField.as("text")} placeholder="main.typ" />
          {#snippet error(attrs)}
            {#each entryFileField.issues() as issue (issue.message)}
              <p {...attrs}>{issue.message}</p>
            {/each}
          {/snippet}
        </FormField>

        {#if form.error}
          <p class="form-error">{form.error}</p>
        {/if}

        <Button type="submit" disabled={form.pending}>
          {form.pending ? t`Creating...` : t`Create project`}
        </Button>
      </form>
    </div>
  {:else}
    <div class="search-box">
      <MagnifyingGlassIcon size={16} />
      <input
        type="text"
        class="search-input"
        placeholder={t`Search repositories...`}
        bind:value={search}
        autofocus
      />
    </div>

    <ul class="repo-list">
      {#each filteredRepos as repo (repo.id)}
        <li>
          <button class="repo-item" onclick={() => (selectedRepo = repo)}>
            <div class="repo-name">
              <img src={repo.ownerAvatar} alt="" class="avatar" />
              <span>{repo.fullName}</span>
              {#if repo.private}
                <LockIcon size={14} />
              {/if}
            </div>
            {#if repo.description}
              <p class="repo-desc">{repo.description}</p>
            {/if}
          </button>
        </li>
      {/each}
      {#if filteredRepos.length === 0}
        <li class="empty">{t`No repositories found`}</li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .container {
    max-width: 40rem;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-2);
    text-decoration: none;

    &:hover {
      color: var(--text-1);
    }
  }

  h1 {
    font-size: var(--text-2xl);
  }

  .loading {
    color: var(--text-2);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-2);
  }

  .repo-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    max-height: 28rem;
    overflow-y: auto;
  }

  .repo-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    text-align: left;
    width: 100%;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: var(--surface-2);
    }
  }

  .repo-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 500;
  }

  .avatar {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
  }

  .repo-desc {
    font-size: var(--text-sm);
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-repo {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .repo-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background-color: var(--surface-2);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-error {
    font-size: var(--text-sm);
    color: var(--danger);
  }

  .search-input {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background-color: var(--surface-1);
    font-size: var(--text-base);
    width: 100%;

    &:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
  }

  .empty {
    padding: var(--space-4);
    color: var(--text-2);
    text-align: center;
  }
</style>
