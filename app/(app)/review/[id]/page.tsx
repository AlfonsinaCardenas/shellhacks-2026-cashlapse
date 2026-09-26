import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { mockStatements } from "@/lib/mock-data";

// Placeholder. The full review screen (redacted text, editable transactions,
// balance check, confirm) is described in CLAUDE.md "Upload pipeline" step 7.
export default async function ReviewPage({ params }: PageProps<"/review/[id]">) {
  const { id } = await params;
  const statement = mockStatements.find((s) => s.id === id);
  if (!statement) notFound();

  return (
    <>
      <PageHeader eyebrow="Review" title={statement.fileName}>
        <StatusBadge status={statement.status} />
      </PageHeader>

      {statement.status === "NEEDS_VERIFICATION" && (
        <div className="mb-6 flex gap-3 rounded-xl border border-warning/30 bg-warning/10 px-5 py-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            The transactions we found don&apos;t add up to the statement&apos;s ending balance. Check the rows below
            before confirming.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-7">
          <h2 className="mb-1 text-lg font-semibold">What we sent to AI</h2>
          <p className="text-sm text-muted-foreground">
            The redacted statement text will appear here, with personal info replaced by placeholders.
          </p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-7">
          <h2 className="mb-1 text-lg font-semibold">Extracted transactions</h2>
          <p className="text-sm text-muted-foreground">
            An editable table of transactions will appear here, with a button to confirm.
          </p>
        </section>
      </div>
    </>
  );
}
