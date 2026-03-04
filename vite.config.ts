import devtoolsJson from "vite-plugin-devtools-json";
import { sveltekit } from "@sveltejs/kit/vite";
import { linguiPo } from "@mikstack/svelte-lingui/vite";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [devtoolsJson(), linguiPo(), wasm(), sveltekit()],
  define: {
    __BUILD_VERSION__: JSON.stringify(Date.now().toString(36)),
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    // Ensure WASM packages are pre-bundled correctly
    include: ["codemirror-lang-typst"],
  },
});
