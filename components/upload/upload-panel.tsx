"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileText, Lock, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.csv,application/pdf,text/csv";

type QueuedFile = { key: string; file: File };

// UI only for now: files are queued in the browser. The real pipeline
// (pdf.js → hash check → R2 → redact → Gemini) is in cashlapse-tdd.md §5.
export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = [...queue];
    const problems: string[] = [];

    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (!/\.(pdf|csv)$/i.test(file.name)) {
        problems.push(`${file.name} isn't a PDF or CSV.`);
      } else if (file.size > MAX_BYTES) {
        problems.push(`${file.name} is over 20 MB.`);
      } else if (next.some((q) => q.key === key)) {
        // The real duplicate check is a SHA-256 hash on the server (409).
        problems.push(`${file.name} was already added. Duplicate files are skipped.`);
      } else {
        next.push({ key, file });
      }
    }
    setQueue(next);
    setWarnings(problems);
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-8">
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
          "flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-primary bg-primary/10" : "border-primary/70 bg-background/40",
        )}
      >
        <span className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-accent">
          <Upload className="size-6 text-info" />
        </span>
        <p className="text-xl font-semibold">Drop your statements here</p>
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
        <p className="mt-5 text-sm text-muted-foreground/70">PDF or CSV · Up to 20 MB per file</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
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

      {queue.length > 0 && (
        <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
          {queue.map(({ key, file }) => (
            <li key={key} className="flex items-center gap-3 px-4 py-3 text-sm">
              <FileText className="size-4 shrink-0 text-info" />
              <span className="flex-1 truncate font-medium">{file.name}</span>
              <span className="text-muted-foreground tabular-nums">{(file.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setQueue((q) => q.filter((item) => item.key !== key))}
                className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4" />
        Encrypted in transit and at rest
      </p>
    </section>
  );
}
