<script lang="ts">
  import type { Snippet } from "svelte";
  import "../app.css";
  import { initI18n } from "$lib/i18n";
  import { initClientTracing } from "$lib/instrumentation.client";

  let { children, data }: { children: Snippet; data: { locale: string } } = $props();
  initI18n(data.locale);

  $effect(() => {
    initClientTracing();
  });
</script>

{@render children()}
