import { notFound, redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RedactionInspector } from "@/components/statement-parser/RedactionInspector";
import { TransactionReviewTable } from "@/components/statement-parser/TransactionReviewTable";
import { formatDate } from "@/lib/format";
import type { StatementStatus } from "@/lib/mock-data";
import { getSessionUserId } from "@/lib/session";
import { isUuid, type StoredPayload } from "@/lib/statement-types";
import { pool } from "@/lib/tigerdata";

type StatementRow = {
  id: string;
  file_name: string;
  status: StatementStatus;
  sent_to_gemini: string | null;
  extraction_payload: StoredPayload | null;
};

export default async function ReviewPage({ params }: PageProps<"/review/[id]">) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  if (!isUuid(id)) notFound();

  const { rows } = await pool.query<StatementRow>(
    `SELECT id, file_name, status, sent_to_gemini, extraction_payload
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
      <PageHeader eyebrow="Review" title={statement.file_name}>
        <StatusBadge status={statement.status} />
      </PageHeader>

      {!payload || !extraction || !current || !statement.sent_to_gemini ? (
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
            // remount with fresh state after a confirm refreshes the page
            key={payload.confirmed?.confirmed_at ?? "initial"}
            statementId={statement.id}
            accountType={extraction.account_type}
            startingBalance={current.starting_balance}
            endingBalance={current.ending_balance}
            transactions={current.transactions}
          />

          <RedactionInspector
            sentToGemini={statement.sent_to_gemini}
            extraction={extraction}
            redactions={payload.meta.redactions}
            model={payload.meta.model}
          />
        </div>
      )}
    </>
  );
}
