"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
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

/**
 * Demoted to a compact block below activity. It describes a feature that is not
 * live yet, so it stays quiet: one line, three condensed steps, and the config
 * hidden behind a toggle. No card container, matching the editorial page.
 */
export function ConnectCard() {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

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
    <section className="border-t border-border/60 pt-8">
      <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Connect to Claude
      </h2>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        You move money by asking Claude, once Cue is connected as a tool.
        <span className="text-subtle-foreground">
          {" "}
          Open Claude Desktop, add the snippet under Settings and Developer, then
          restart and ask it to send money to any email.
        </span>
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ring-focus mt-4 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-foreground transition-colors duration-150 hover:text-primary"
      >
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
        {open ? "Hide setup" : "Show setup"}
      </button>

      {open ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-background-sunken">
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
      ) : null}

      <p className="mt-4 text-xs text-subtle-foreground">
        The Cue tool for Claude goes live in the next release.
      </p>
    </section>
  );
}
