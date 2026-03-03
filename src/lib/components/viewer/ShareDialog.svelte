<script lang="ts">
  import Dialog from "$lib/components/ui/Dialog";
  import Button from "$lib/components/ui/Button";
  import Input from "$lib/components/ui/Input";
  import FormField from "$lib/components/ui/FormField";
  import { createForm } from "@mikstack/form";
  import * as v from "valibot";
  import { useLingui } from "@mikstack/svelte-lingui";
  const { t } = useLingui();

  interface Props {
    open: boolean;
    projectId: string;
    onclose: () => void;
  }

  let { open = $bindable(), projectId, onclose }: Props = $props();

  const form = createForm({
    schema: v.object({
      email: v.pipe(v.string(), v.email(t`Please enter a valid email`)),
    }),
    initialValues: { email: "" },
    async onSubmit(data) {
      const res = await fetch("/api/projects/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, email: data.email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t`Failed to send invitation`);
      return { sent: true };
    },
  });

  const emailField = form.fields.email;
</script>

<Dialog bind:open {onclose}>
  <h2>{t`Share project`}</h2>
  <p class="desc">
    {t`Invite a reviewer by email. They'll receive a magic link to access this project.`}
  </p>

  {#if form.result}
    <div class="success">
      <p>{t`Invitation sent!`}</p>
    </div>
  {:else}
    <form id={form.id} onsubmit={form.onsubmit}>
      <FormField for={emailField.as("email").id}>
        {#snippet label(attrs)}
          <label {...attrs}>{t`Email`}</label>
        {/snippet}
        <Input {...emailField.as("email")} placeholder={t`reviewer@example.com`} />
        {#snippet error(attrs)}
          {#each emailField.issues() as issue (issue.message)}
            <p {...attrs}>{issue.message}</p>
          {/each}
        {/snippet}
      </FormField>

      {#if form.error}
        <p class="error">{form.error}</p>
      {/if}

      <div class="actions">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? t`Sending...` : t`Send invitation`}
        </Button>
        <Button variant="ghost" type="button" onclick={onclose}>
          {t`Close`}
        </Button>
      </div>
    </form>
  {/if}
</Dialog>

<style>
  h2 {
    font-size: var(--text-lg);
  }

  .desc {
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  .success {
    font-size: var(--text-sm);
    color: var(--accent);
  }

  .error {
    font-size: var(--text-sm);
    color: var(--danger);
  }
</style>
