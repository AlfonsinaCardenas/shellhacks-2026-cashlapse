"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, FileText, KeyRound, Loader2, Upload, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PdfPasswordModal } from "./PdfPasswordModal";
import { uploadStatement } from "./upload-request";

const MAX_BYTES = 20 * 1024 * 1024;

type ItemStatus =
  | { kind: "queued" }
  | { kind: "uploading"; progress: number }
  | { kind: "processing" } // bytes sent; server is redacting + calling Gemini
  | { kind: "needs-password"; incorrect: boolean }
  | { kind: "done"; statementId: string; transactions: number }
  | { kind: "duplicate"; statementId?: string }
  | { kind: "error"; message: string };

type Item = { key: string; file: File; password?: string; status: ItemStatus };

const ACTIVE = new Set<ItemStatus["kind"]>(["uploading", "processing"]);

// Files upload one at a time so each gets its own progress bar and a
// password prompt can't collide with another file's.
export function StatementUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [items, setItemsState] = useState<Item[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // The queue loop runs outside React's render cycle, so it reads the list
  // from a ref. Every change goes through setItems to keep the two in sync.
  const itemsRef = useRef<Item[]>([]);
  const setItems = (fn: (prev: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItemsState(itemsRef.current);
  };
  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function processOne(item: Item) {
    const name = item.file.name;
    update(item.key, { status: { kind: "uploading", progress: 0 } });

    const result = await uploadStatement(item.file, item.password, (fraction) =>
      update(item.key, {
        status: fraction >= 1 ? { kind: "processing" } : { kind: "uploading", progress: fraction },
      }),
    );

    if (result.ok) {
      const { statement_id, extraction } = result.data;
      const count = extraction.transactions.length;
      update(item.key, { status: { kind: "done", statementId: statement_id, transactions: count } });
      toast.success(`${name} is ready to review`, {
        description: `${count} transactions from ${extraction.bank_name}`,
        action: { label: "Review", onClick: () => router.push(`/review/${statement_id}`) },
      });
    } else if (result.status === 409) {
      update(item.key, { status: { kind: "duplicate", statementId: result.data.statement_id } });
      toast.warning(`${name} was already uploaded`, { description: "Duplicate statements are skipped." });
    } else if (result.data.needsPassword) {
      update(item.key, { status: { kind: "needs-password", incorrect: !!result.data.incorrectPassword } });
    } else {
      update(item.key, { status: { kind: "error", message: result.data.error } });
      toast.error(`Couldn't process ${name}`, { description: result.data.error });
    }
  }

  // Works through queued files until none are left. Safe to call any time;
  // a second call while running is a no-op and the loop picks up new files.
  async function runQueue() {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      let next: Item | undefined;
      while ((next = itemsRef.current.find((it) => it.status.kind === "queued"))) {
        await processOne(next);
      }
    } finally {
      runningRef.current = false;
    }
  }

  function enqueue(key: string, patch: Partial<Item> = {}) {
    update(key, { ...patch, status: { kind: "queued" } });
    void runQueue();
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const problems: string[] = [];
    const added: Item[] = [];

    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        problems.push(`${file.name} isn't a PDF.`);
      } else if (file.size > MAX_BYTES) {
        problems.push(`${file.name} is over 20 MB.`);
      } else if (itemsRef.current.some((it) => it.key === key) || added.some((it) => it.key === key)) {
        problems.push(`${file.name} is already in the list.`);
      } else {
        added.push({ key, file, status: { kind: "queued" } });
      }
    }
    setItems((prev) => [...prev, ...added]);
    setWarnings(problems);
    void runQueue();
  }

  const locked = items.find((it) => it.status.kind === "needs-password");

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-[320px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-primary bg-primary/10" : "border-primary/70 bg-background/40",
        )}
      >
        <span className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-accent">
          <Upload className="size-6 text-info" />
        </span>
        <p className="text-xl font-semibold">Drop your PDF statements here</p>
        <p className="mt-2 text-muted-foreground">
          or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-info hover:underline"
          >
            browse files
          </button>{" "}
          to select one or more
        </p>
        <p className="mt-5 text-sm text-muted-foreground/70">PDF only · Up to 20 MB per file</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {warnings.length > 0 && (
        <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-5 divide-y divide-border rounded-xl border border-border" aria-live="polite">
          {items.map((item) => (
            <UploadRow
              key={item.key}
              item={item}
              onRemove={() => setItems((prev) => prev.filter((it) => it.key !== item.key))}
              onRetry={() => enqueue(item.key)}
            />
          ))}
        </ul>
      )}

      <PdfPasswordModal
        fileName={locked?.file.name ?? null}
        incorrect={locked?.status.kind === "needs-password" && locked.status.incorrect}
        onSubmit={(password) => locked && enqueue(locked.key, { password })}
        onCancel={() =>
          locked && update(locked.key, { status: { kind: "error", message: "Skipped: password required" } })
        }
      />
    </section>
  );
}

function UploadRow({ item, onRemove, onRetry }: { item: Item; onRemove: () => void; onRetry: () => void }) {
  const { status, file } = item;
  const busy = ACTIVE.has(status.kind);

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-center gap-3">
        <StatusIcon status={status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{file.name}</span>
          <span
            className={cn(
              "block text-xs",
              status.kind === "error" ? "text-destructive" : status.kind === "duplicate" ? "text-warning" : "text-muted-foreground",
            )}
          >
            {describe(status, file)}
          </span>
        </span>

        {status.kind === "done" && (
          <Link href={`/review/${status.statementId}`} className={cn(buttonVariants({ size: "sm" }), "px-3")}>
            Review
          </Link>
        )}
        {status.kind === "duplicate" && status.statementId && (
          <Link
            href={`/review/${status.statementId}`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "px-3")}
          >
            View existing
          </Link>
        )}
        {status.kind === "error" && (
          <button type="button" onClick={onRetry} className="text-xs font-medium text-info hover:underline">
            Retry
          </button>
        )}
        {!busy && (
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={onRemove}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {busy && (
        <div
          className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${file.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={status.kind === "uploading" ? Math.round(status.progress * 100) : undefined}
        >
          {status.kind === "uploading" ? (
            <div className="h-full bg-primary transition-[width]" style={{ width: `${status.progress * 100}%` }} />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-info" />
          )}
        </div>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  switch (status.kind) {
    case "uploading":
    case "processing":
      return <Loader2 className="size-4 shrink-0 animate-spin text-info" />;
    case "done":
      return <CheckCircle2 className="size-4 shrink-0 text-success" />;
    case "duplicate":
      return <Copy className="size-4 shrink-0 text-warning" />;
    case "needs-password":
      return <KeyRound className="size-4 shrink-0 text-warning" />;
    case "error":
      return <AlertTriangle className="size-4 shrink-0 text-destructive" />;
    default:
      return <FileText className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function describe(status: ItemStatus, file: File) {
  switch (status.kind) {
    case "queued":
      return `${(file.size / 1024).toFixed(0)} KB · Waiting`;
    case "uploading":
      return `Uploading ${Math.round(status.progress * 100)}%`;
    case "processing":
      return "Redacting personal info and reading transactions…";
    case "needs-password":
      return "Waiting for password";
    case "done":
      return `${status.transactions} transactions found · Ready to review`;
    case "duplicate":
      return "Already uploaded";
    case "error":
      return status.message;
  }
}
