import { linguiPreprocess } from "@mikstack/svelte-lingui/preprocessor";
import adapter from "@sveltejs/adapter-node";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [linguiPreprocess()],
  kit: {
    adapter: adapter(),
    experimental: {
      remoteFunctions: true,
    },
  },
};

export default config;
