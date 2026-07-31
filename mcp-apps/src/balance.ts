/**
 * Cue balance panel. Read only: it renders whatever the get_balance result
 * carries, in the same card language as the confirmation card.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import "./font.generated.css";
import "./confirm-send.css";
import "./balance.css";
import { renderBalance, type Balance } from "./balance-render.js";

const root = document.getElementById("root")!;

const app = new App({ name: "Cue balance", version: "1.0.0" });

app.ontoolresult = (result) => {
  const data = result.structuredContent as Balance | undefined;
  if (data && data.kind === "balance") renderBalance(root, data);
};

app.onerror = (error) => console.error(error);

root.innerHTML = `<div class="card"><div class="brand"></div></div>`;
app.connect();
