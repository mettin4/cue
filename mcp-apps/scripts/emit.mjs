// Reads the built single-file card and writes it as a string constant the Next
// app can import and serve from the MCP resources/read handler. Committing the
// generated file means Vercel never has to run this card build.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "dist", "confirm-send.html"), "utf8");

const outDir = join(here, "..", "..", "src", "lib", "mcp", "ui");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "confirm-send.generated.ts");

writeFileSync(
  out,
  `// Generated from mcp-apps/confirm-send.html by mcp-apps/scripts/emit.mjs.\n` +
    `// Do not edit by hand. Rebuild with: cd mcp-apps && npm run build\n` +
    `export const CONFIRM_SEND_HTML = ${JSON.stringify(html)};\n`,
);

console.log(`emitted ${html.length} chars to ${out}`);
