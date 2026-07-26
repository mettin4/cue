"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "cue": {
      "command": "npx",
      "args": ["-y", "@cue/mcp"],
      "env": { "CUE_API_KEY": "your-key" }
    }
  }
}`;

const STEPS = [
  "Open Claude Desktop, then Settings and Developer.",
  "Add the snippet below to your MCP configuration.",
  "Restart Claude, then ask it to send money to any email.",
];

export function ConnectCard() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(CONFIG_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked. Selecting the block by hand still works.
    }
  }

  return (
    <div className="surface-gradient rounded-2xl border border-border-strong/70 bg-elevated p-6 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.95)]">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-2 rounded-full bg-primary shadow-[0_0_10px_rgb(56_211_137/0.8)]"
        />
        <h2 className="font-display text-[15px] font-semibold">
          Connect to Claude
        </h2>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Cue has no send form on purpose. You move money by asking Claude, once
        Cue is connected as a tool.
      </p>

      <ol className="mt-5 space-y-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden="true"
              className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-primary"
            >
              {index + 1}
            </span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              {step}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-background-sunken">
        <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2">
          <span className="text-[11px] font-medium tracking-[0.1em] text-subtle-foreground uppercase">
            claude_desktop_config.json
          </span>
          <button
            type="button"
            onClick={copy}
            className="ring-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-raised hover:text-foreground"
          >
            {copied ? (
              <>
                <Check aria-hidden="true" className="size-3.5 text-primary" />
                Copied
              </>
            ) : (
              <>
                <Copy aria-hidden="true" className="size-3.5" />
                Copy
              </>
            )}
          </button>
        </div>

        <pre className="overflow-x-auto px-3.5 py-3 text-[12.5px] leading-relaxed">
          <code className="font-mono text-foreground/90">{CONFIG_SNIPPET}</code>
        </pre>
      </div>

      <p className="mt-3 text-xs text-subtle-foreground">
        The Cue tool for Claude goes live in the next release. This is the setup
        it will use.
      </p>
    </div>
  );
}
