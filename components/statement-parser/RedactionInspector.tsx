"use client";

import { useState } from "react";
import { Braces, Columns2, FileText, ShieldCheck } from "lucide-react";
import type { RedactionKind, RedactionSummary, StatementExtraction } from "@/lib/statement-types";
import { cn } from "@/lib/utils";

type Props = {
  sentToGemini: string;
  extraction: StatementExtraction;
  redactions: RedactionSummary;
  model: string;
};

type View = "split" | "text" | "json";

const VIEWS: { value: View; label: string; icon: typeof Columns2 }[] = [
  { value: "split", label: "Side by side", icon: Columns2 },
  { value: "text", label: "Sent to AI", icon: FileText },
  { value: "json", label: "AI output", icon: Braces },
];

const LABELS: Record<RedactionKind, [string, string]> = {
  NAME: ["name", "names"],
  ADDRESS: ["address", "addresses"],
  ACCOUNT_NUMBER: ["account number", "account numbers"],
  ROUTING_NUMBER: ["routing number", "routing numbers"],
  CARD_NUMBER: ["card number", "card numbers"],
  SSN: ["SSN", "SSNs"],
  TAX_ID: ["tax ID", "tax IDs"],
  PHONE: ["phone number", "phone numbers"],
  EMAIL: ["email", "emails"],
};

// Matches the placeholders lib/pdf-parser.ts writes, e.g. [NAME], [ACCOUNT ••1234]
const PLACEHOLDER = /(\[(?:NAME|ADDRESS|PHONE|EMAIL|SSN|TAX ID|ROUTING #|ACCOUNT ••\d{0,4}|CARD ••\d{0,4})\])/;

// Privacy view: the exact text Gemini received next to what it returned,
// so anyone can check that personal details never reached the model.
export function RedactionInspector({ sentToGemini, extraction, redactions, model }: Props) {
  const [view, setView] = useState<View>("split");

  const counts = (Object.entries(redactions) as [RedactionKind, number][]).filter(([, n]) => n > 0);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);

  return (
    <section className="rounded-2xl border border-border bg-card p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="size-5 text-success" />
            What we sent to AI
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Personal details were stripped on our server before the text went to {model}. This is exactly what the
            model saw, character for character.
          </p>
        </div>

        <div role="tablist" aria-label="Privacy view" className="flex rounded-lg border border-border p-0.5">
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                view === value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        {total === 0 ? (
          <span className="text-muted-foreground">No personal details were detected in this statement.</span>
        ) : (
          <>
            <span className="text-muted-foreground">Removed {total} items:</span>
            {counts.map(([kind, n]) => (
              <span key={kind} className="rounded-full bg-success/10 px-2.5 py-0.5 text-[13px] font-medium text-success">
                {n} {LABELS[kind][n === 1 ? 0 : 1]}
              </span>
            ))}
          </>
        )}
      </div>

      <div className={cn("grid gap-4", view === "split" && "xl:grid-cols-2")}>
        {view !== "json" && (
          <Pane title="Redacted statement text" subtitle="Input">
            <HighlightedText text={sentToGemini} />
          </Pane>
        )}
        {view !== "text" && (
          <Pane title="Structured output" subtitle="Gemini response">
            {JSON.stringify(extraction, null, 2)}
          </Pane>
        )}
      </div>
    </section>
  );
}

function Pane({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-background/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs tracking-[0.15em] text-muted-foreground uppercase">{subtitle}</span>
      </div>
      <pre className="max-h-[480px] overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre text-muted-foreground">
        {children}
      </pre>
    </div>
  );
}

function HighlightedText({ text }: { text: string }) {
  // split() with a capture group keeps the placeholders at odd indexes
  return text.split(PLACEHOLDER).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-success/15 px-0.5 font-semibold text-success">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
