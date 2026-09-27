import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TransactionReviewTable } from "@/components/statement-parser/TransactionReviewTable";
import { formatDate } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { isUuid, type StatementStatus, type StoredPayload } from "@/lib/statement-types";
import { pool } from "@/lib/tigerdata";

type StatementRow = {
  id: string;
  file_name: string;
  status: StatementStatus;
  extraction_payload: StoredPayload | null;
};

export default async function ReviewPage({ params }: PageProps<"/review/[id]">) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  if (!isUuid(id)) notFound();

  const { rows } = await pool.query<StatementRow>(
    `SELECT id, file_name, status, extraction_payload
     FROM statements WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const statement = rows[0];
  if (!statement) notFound();

  const payload = statement.extraction_payload;
  const { extraction } = payload ?? {};
  // After a confirm, show what the user saved rather than the raw AI output.
  const current = payload?.confirmed ?? extraction;

  return (
    <>
      <Link
        href="/review"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All statements to review
      </Link>
      <PageHeader eyebrow="Review" title={statement.file_name}>
        <a
          href={`/api/statements/${statement.id}/file`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 text-sm font-medium text-info hover:underline"
        >
          <ExternalLink className="size-4" />
          View original PDF
        </a>
        <StatusBadge status={statement.status} />
      </PageHeader>

      {!payload || !extraction || !current ? (
        <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>This statement has no extracted data to review. Try uploading it again.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          <p className="-mt-4 text-sm text-muted-foreground">
            {extraction.bank_name}
            {extraction.account_identifier && ` ${extraction.account_identifier}`} ·{" "}
            {extraction.account_type === "CREDIT_CARD" ? "Credit card" : "Deposit account"}
            {extraction.start_date && extraction.end_date && (
              <>
                {" "}
                · {formatDate(extraction.start_date)} – {formatDate(extraction.end_date)}
              </>
            )}
          </p>

          <TransactionReviewTable
            statementId={statement.id}
            accountType={extraction.account_type}
            startingBalance={current.starting_balance}
            endingBalance={current.ending_balance}
            transactions={current.transactions}
            saved={!!payload.confirmed}
          />
        </div>
      )}
    </>
  );
}
