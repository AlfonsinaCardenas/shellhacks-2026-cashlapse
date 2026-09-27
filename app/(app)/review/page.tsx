import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, FileText, ListChecks, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { getStatements, type StatementListItem } from "@/lib/queries";
import { getSessionUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

// The Review tab: every parsed statement, with the ones still waiting for a
// "Save to Ledger" first. Each row opens the review screen at /review/[id].
export default async function ReviewIndexPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const statements = await getStatements(userId);
  const waiting = statements.filter((s) => s.status === "NEEDS_REVIEW");
  const reviewed = statements.filter((s) => s.status === "COMPLETED" || s.status === "NEEDS_VERIFICATION");

  return (
    <>
      <PageHeader eyebrow="Review" title="Review statements">
        <Link
          href="/upload"
          className={cn(buttonVariants(), "h-11 gap-2 rounded-xl px-5 text-[15px] shadow-lg shadow-primary/25")}
        >
          <Upload className="size-4" />
          Upload statements
        </Link>
      </PageHeader>

      {statements.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-20 text-center">
          <ListChecks className="size-8 text-muted-foreground" />
          <p className="font-medium">Nothing to review yet</p>
          <p className="text-sm text-muted-foreground">
            Upload a statement and its transactions will show up here for review.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          <ReviewList
            title="Waiting for review"
            description="Check the extracted transactions, then save them to your ledger."
            items={waiting}
            empty={
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" />
                You&apos;re all caught up.
              </span>
            }
            action="Review"
          />
          {reviewed.length > 0 && (
            <ReviewList
              title="Saved to ledger"
              description="Already reviewed. Open one to see its transactions."
              items={reviewed}
              action="View"
            />
          )}
        </div>
      )}
    </>
  );
}

function ReviewList({
  title,
  description,
  items,
  empty,
  action,
}: {
  title: string;
  description: string;
  items: StatementListItem[];
  empty?: React.ReactNode;
  action: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-7 py-5">
        <h2 className="text-lg font-semibold">
          {title}
          {items.length > 0 && <span className="ml-2 text-muted-foreground">({items.length})</span>}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="px-7 py-8 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/review/${s.id}`}
                className="flex items-center gap-4 px-7 py-5 transition-colors hover:bg-white/[0.03]"
              >
                <FileText className="size-5 shrink-0 text-info" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.file_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {s.bank_name ?? "Unknown bank"}
                    {s.account_identifier && ` ${s.account_identifier}`}
                    {s.start_date && s.end_date && ` · ${formatDate(s.start_date)} – ${formatDate(s.end_date)}`}
                    {s.transaction_count !== null && ` · ${s.transaction_count} transactions`}
                  </span>
                </span>
                <span className="hidden text-sm whitespace-nowrap text-muted-foreground tabular-nums md:block">
                  Uploaded {formatDate(s.uploaded_at)}
                </span>
                <StatusBadge status={s.status} />
                <span className="inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap text-info">
                  {action}
                  <ChevronRight className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
