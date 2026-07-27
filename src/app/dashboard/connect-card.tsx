"use client";

import { ChevronDown } from "lucide-react";
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
 * Describes a feature that is not live yet, so it leads with that status and
 * shows the config only as a dimmed, non-interactive preview. No copy button:
 * nothing here is usable, so offering to copy it would mislead. No card
 * container, matching the editorial page.
 */
export function ConnectCard() {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-t border-border/60 pt-8">
      <h2 className="text-[11px] font-medium tracking-[0.2em] text-subtle-foreground uppercase">
        Connect to Claude
      </h2>

      <p className="mt-3 text-sm font-medium text-primary">
        Preview. This setup ships in the next release.
      </p>

      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          Soon you will connect Cue to Claude as a tool. Once connected, you can
          ask Claude in plain language to send money to an email address, and it
          handles the rest.
        </p>
        <p>
          Claude will be able to see your balance and recent activity and prepare
          a send for you. It cannot move money on its own. Every transfer asks you
          to confirm the amount and the recipient before anything leaves your
          account.
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
        {open ? "Hide setup preview" : "Show setup preview"}
      </button>

      {open ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border/70 bg-background-sunken/60">
          <div className="border-b border-border/50 px-3.5 py-2 text-[11px] font-medium tracking-[0.1em] text-subtle-foreground uppercase">
            claude_desktop_config.json · preview
          </div>
          <pre className="overflow-x-auto px-3.5 py-3 text-[12.5px] leading-relaxed opacity-45 select-none">
            <code className="font-mono text-foreground">{CONFIG_SNIPPET}</code>
          </pre>
        </div>
      ) : null}
    </section>
  );
}
