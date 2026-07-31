import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Bundles the card and all of its CSS, JS and the font into one HTML file, which
// the remote MCP endpoint serves as the ui:// resource. Inlining everything keeps
// it working under the iframe's deny by default CSP.
export default defineConfig({
  plugins: [viteSingleFile()],
  // Inline (empty) PostCSS config so Vite does not walk up and pick the parent
  // Next app's Tailwind PostCSS setup, which is unrelated to this card.
  css: { postcss: { plugins: [] } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssMinify: true,
    minify: true,
    rollupOptions: {
      input: process.env.INPUT || "confirm-send.html",
    },
  },
});
