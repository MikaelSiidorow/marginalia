<script lang="ts">
  import type { Snippet } from "svelte";
  import "../app.css";
  import { initI18n } from "$lib/i18n";

  let { children, data }: { children: Snippet; data: { locale: string } } = $props();
  $effect(() => {
    initI18n(data.locale);
  });
</script>

{@render children()}
