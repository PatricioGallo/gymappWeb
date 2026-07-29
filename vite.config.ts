import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const rootDir = dirname(fileURLToPath(import.meta.url));

const pageEntries = Object.fromEntries(
  globSync("pages/*.html").map((file) => [
    `pages/${file.replace(/^pages[\\/]/, "").replace(/\.html$/, "")}`,
    resolve(rootDir, file),
  ])
);

export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        ...pageEntries,
      },
    },
  },
});
