"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useState } from "react";

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "cue": {
      "command": "node",
      "args": ["/path/to/cue/packages/mcp/dist/index.js"],
      "env": {
        "CUE_API_URL": "https://cue-navy-psi.vercel.app",
        "CUE_API_KEY": "your-cue-secret",
        "CUE_USER": "you@example.com"
      }
    }
  }
}`;

/**
 * Connects Cue to Claude Desktop. The server is real and works. It runs from
 * this repo since it is not published to npm yet, so the config points at the
 * built server. Build steps are in the README.
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

      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Connect Cue to Claude Desktop and you can ask Claude in plain language
          to send money to an email address, and it handles the rest.
        </p>
        <p>
          Claude can see your balance and recent activity and prepare a send for
          you. It cannot move money on its own. Every transfer shows you the
          amount and the recipient and waits for your approval before anything
          leaves your account.
        </p>
      </div>

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
        {open ? "Hide config" : "Show config"}
      </button>

      {open ? (
        <>
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

          <p className="mt-3 text-xs text-subtle-foreground">
            The server runs from this repo. Build it from packages/mcp first, see
            the README for the steps.
          </p>
        </>
      ) : null}
    </section>
  );
}
