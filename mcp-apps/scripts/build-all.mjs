// Builds every card to a single self-contained HTML file and writes each as a
// string constant the Next app serves from resources/read. Committing the
// generated files means Vercel never runs this card build.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "..", "src", "lib", "mcp", "ui");
mkdirSync(outDir, { recursive: true });

// Entry html basename -> exported constant name.
const CARDS = [
  { input: "confirm-send", constName: "CONFIRM_SEND_HTML" },
  { input: "balance", constName: "BALANCE_HTML" },
];

for (const { input, constName } of CARDS) {
  execSync("npx vite build", { cwd: root, stdio: "inherit", env: { ...process.env, INPUT: `${input}.html` } });
  const html = readFileSync(join(root, "dist", `${input}.html`), "utf8");
  writeFileSync(
    join(outDir, `${input}.generated.ts`),
    `// Generated from mcp-apps/${input}.html by mcp-apps/scripts/build-all.mjs.\n` +
      `// Do not edit by hand. Rebuild with: cd mcp-apps && npm run build\n` +
      `export const ${constName} = ${JSON.stringify(html)};\n`,
  );
  console.log(`emitted ${input} (${html.length} chars)`);
}
