/**
 * Compiles contracts/CueEscrow.sol with evmVersion "paris" so the bytecode
 * carries no PUSH0 opcode, which Arc testnet rejects with ESTIMATION_ERROR.
 * Writes ABI + 0x-prefixed bytecode to scripts/escrow/CueEscrow.build.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import solc from "solc";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const source = readFileSync(join(root, "contracts", "CueEscrow.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: { "CueEscrow.sol": { content: source } },
  settings: {
    evmVersion: "paris", // no PUSH0; required by Arc testnet
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of output.errors ?? []) console.warn(w.formattedMessage);

const c = output.contracts["CueEscrow.sol"].CueEscrow;
const bytecode = "0x" + c.evm.bytecode.object;

writeFileSync(
  join(here, "CueEscrow.build.json"),
  JSON.stringify({ abi: c.abi, bytecode }, null, 2),
);

console.log("compiled CueEscrow");
console.log("  bytecode bytes:", (bytecode.length - 2) / 2);
console.log("  abi entries:", c.abi.length);
console.log("  solc:", solc.version());
