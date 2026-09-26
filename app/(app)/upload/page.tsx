import { PageHeader } from "@/components/page-header";
import { StatementUploader } from "@/components/statement-parser/StatementUploader";

const STEPS = ["Uploading statements", "Removing personal info", "Reading transactions", "Review and confirm"];

export default function UploadPage() {
  return (
    <>
      <PageHeader eyebrow="Import" title="Upload statements">
        <p className="text-muted-foreground">Add checking, credit card, or savings statements as PDFs.</p>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <StatementUploader />

        <aside className="rounded-2xl border border-border bg-card p-8">
          <h2 className="mb-6 text-lg font-semibold">What happens next</h2>
          <ol>
            {STEPS.map((step, i) => (
              <li key={step} className="relative flex gap-4 pb-10 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span className="absolute top-9 left-[17px] h-[calc(100%-36px)] w-px bg-border" aria-hidden />
                )}
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-sm text-muted-foreground">
                  {i + 1}
                </span>
                <span className="pt-1.5 text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-8 rounded-xl border border-primary/25 bg-accent p-5">
            <p className="mb-1.5 text-sm font-semibold text-indigo-200">Multiple accounts supported</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Combine business checking, personal cards, and savings into one P&amp;L view.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
