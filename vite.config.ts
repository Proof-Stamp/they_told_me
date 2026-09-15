import { defineConfig } from "vite";

const buildSha = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? "local";

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  build: {
    target: "es2022",
  },
});
