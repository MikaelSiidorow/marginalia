<script lang="ts">
  import NotePencilIcon from "phosphor-svelte/lib/NotePencilIcon";
  import PencilSimpleIcon from "phosphor-svelte/lib/PencilSimpleIcon";
  import PlusIcon from "phosphor-svelte/lib/PlusIcon";
  import SignOutIcon from "phosphor-svelte/lib/SignOutIcon";
  import TrashIcon from "phosphor-svelte/lib/TrashIcon";
  import XIcon from "phosphor-svelte/lib/XIcon";
  import Button from "$lib/components/ui/Button";
  import FormField from "$lib/components/ui/FormField";
  import Input from "$lib/components/ui/Input";
  import Separator from "$lib/components/ui/Separator";
  import Textarea from "$lib/components/ui/Textarea";
  import { createForm } from "@mikstack/form";
  import { dropAllDatabases } from "@rocicorp/zero";
  import * as v from "valibot";
  import { resolve } from "$app/paths";
  import { authClient } from "$lib/auth-client";
  import { get_z } from "$lib/z.svelte";
  import { queries } from "$lib/zero/queries";
  import { mutators } from "$lib/zero/mutators";
  import { useLingui } from "@mikstack/svelte-lingui";
  import LocaleSwitcher from "$lib/LocaleSwitcher.svelte";
  const { t } = useLingui();

  let { data } = $props();

  const z = get_z();
  const notesQuery = z.q(queries.note.mine());
  const notes = $derived(notesQuery.data);

  const isMac = $derived(navigator.platform.startsWith("Mac") || navigator.platform === "iPhone");
  const isMobile = $derived(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  const modLabel = $derived(isMac ? "⌘" : "Ctrl");

  function submitOnModEnter(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLFormElement).requestSubmit();
    }
  }

  let editingId = $state<string | null>(null);

  const noteSchema = v.object({
    title: v.pipe(v.string(), v.minLength(1, t`Title is required`)),
    content: v.string(),
  });

  const createNoteForm = createForm({
    schema: noteSchema,
    initialValues: { title: "", content: "" },
    onSubmit(data) {
      z.mutate(
        mutators.note.create({
          id: crypto.randomUUID(),
          title: data.title,
          content: data.content,
        }),
      );
      createNoteForm.reset();
    },
  });

  function startEdit(note: { id: string; title: string; content: string | null }) {
    editingId = note.id;
    editForm.fields.set({
      title: note.title,
      content: note.content ?? "",
    });
  }

  function cancelEdit() {
    editingId = null;
    editForm.reset();
  }

  const editForm = createForm({
    schema: noteSchema,
    initialValues: { title: "", content: "" },
    onSubmit(data) {
      if (!editingId) return;
      z.mutate(
        mutators.note.update({
          id: editingId,
          title: data.title,
          content: data.content,
        }),
      );
      editingId = null;
      editForm.reset();
    },
  });

  function deleteNote(id: string) {
    z.mutate(mutators.note.delete({ id }));
    if (editingId === id) cancelEdit();
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
      <NotePencilIcon size={24} weight="duotone" />
      <h1>{t`Notes`}</h1>
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

  <section>
    <h2>{t`New note`}</h2>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form
      id={createNoteForm.id}
      onsubmit={createNoteForm.onsubmit}
      onkeydown={submitOnModEnter}
      class="note-form"
    >
      <FormField for={createNoteForm.fields.title.as("text").id}>
        {#snippet label(attrs)}
          <label {...attrs}>{t`Title`}</label>
        {/snippet}
        <Input {...createNoteForm.fields.title.as("text")} placeholder={t`Note title`} />
        {#snippet error(attrs)}
          {#each createNoteForm.fields.title.issues() as issue (issue.message)}
            <p {...attrs}>{issue.message}</p>
          {/each}
        {/snippet}
      </FormField>

      <FormField for={`${createNoteForm.id}-content`}>
        {#snippet label(attrs)}
          <label {...attrs}>{t`Content`}</label>
        {/snippet}
        <Textarea
          name={createNoteForm.fields.content.name()}
          id="{createNoteForm.id}-content"
          oninput={(e) =>
            createNoteForm.fields.content.set((e.target as HTMLTextAreaElement).value)}
          value={createNoteForm.fields.content.value() as string}
          placeholder={t`Write something...`}
        />
      </FormField>

      {#if createNoteForm.error}
        <p class="form-error">{createNoteForm.error}</p>
      {/if}

      <Button type="submit" disabled={createNoteForm.pending}>
        <PlusIcon size={16} weight="bold" />
        {createNoteForm.pending ? t`Creating...` : t`Create note`}
        {#if !isMobile}<kbd>{modLabel}+Enter</kbd>{/if}
      </Button>
    </form>
  </section>

  <Separator />

  <section>
    <h2>{t`Your notes`}</h2>
    {#if notes.length === 0}
      <p class="empty">{t`No notes yet. Create one above!`}</p>
    {:else}
      <ul class="note-list">
        {#each notes as note (note.id)}
          <li class="note-card">
            {#if editingId === note.id}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <form
                id={editForm.id}
                onsubmit={editForm.onsubmit}
                onkeydown={submitOnModEnter}
                class="note-form"
              >
                <FormField for={editForm.fields.title.as("text").id}>
                  {#snippet label(attrs)}
                    <label {...attrs}>{t`Title`}</label>
                  {/snippet}
                  <Input {...editForm.fields.title.as("text")} />
                  {#snippet error(attrs)}
                    {#each editForm.fields.title.issues() as issue (issue.message)}
                      <p {...attrs}>{issue.message}</p>
                    {/each}
                  {/snippet}
                </FormField>

                <FormField for={`${editForm.id}-content`}>
                  {#snippet label(attrs)}
                    <label {...attrs}>{t`Content`}</label>
                  {/snippet}
                  <Textarea
                    name={editForm.fields.content.name()}
                    id="{editForm.id}-content"
                    oninput={(e) =>
                      editForm.fields.content.set((e.target as HTMLTextAreaElement).value)}
                    value={editForm.fields.content.value() as string}
                    autofocus
                  />
                </FormField>

                {#if editForm.error}
                  <p class="form-error">{editForm.error}</p>
                {/if}

                <div class="actions">
                  <Button type="submit" disabled={editForm.pending}>
                    {editForm.pending ? t`Saving...` : t`Save`}
                    {#if !isMobile}<kbd>{modLabel}+Enter</kbd>{/if}
                  </Button>
                  <Button variant="ghost" type="button" onclick={cancelEdit}>
                    <XIcon size={16} weight="bold" />
                    {t`Cancel`}
                  </Button>
                </div>
              </form>
            {:else}
              <div class="note-body">
                <strong>{note.title}</strong>
                {#if note.content}
                  <p class="note-text">{note.content}</p>
                {/if}
              </div>
              <div class="actions">
                <Button variant="ghost" onclick={() => startEdit(note)}>
                  <PencilSimpleIcon size={16} />
                  {t`Edit`}
                </Button>
                <Button variant="danger" onclick={() => deleteNote(note.id)}>
                  <TrashIcon size={16} />
                  {t`Delete`}
                </Button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .container {
    max-width: 40rem;
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

  .header-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);

    & h1 {
      font-size: var(--text-2xl);
    }
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

  h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-3);
  }

  .note-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .form-error {
    font-size: var(--text-sm);
    color: var(--danger);
  }

  .note-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .note-card {
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background-color: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .note-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .note-text {
    color: var(--text-2);
    font-size: var(--text-sm);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  .empty {
    color: var(--text-2);
    font-size: var(--text-sm);
  }
</style>
