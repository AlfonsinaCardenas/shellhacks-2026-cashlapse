import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BalanceSheet } from "@/components/reports/balance-sheet";
import { PnlStatement } from "@/components/reports/pnl-statement";
import { StatementPicker, type StatementOption } from "@/components/reports/statement-picker";
import { accountLabel, buildBalanceSheet, buildPnl } from "@/lib/financial-statements";
import { formatDate, formatMonth } from "@/lib/format";
import { getAccountBalances, getStatementPnlRows, getStatements, type StatementListItem } from "@/lib/queries";
import { getSessionUserId } from "@/lib/session";

// The month a statement "comes from" is its closing month; fall back to the
// upload date if the period wasn't extracted.
const closingDate = (s: StatementListItem) => s.end_date ?? s.uploaded_at.slice(0, 10);

const account = (s: StatementListItem) =>
  accountLabel({
    bank_name: s.bank_name ?? "Unknown bank",
    account_identifier: s.account_identifier ?? "",
    account_type: s.account_type ?? "DEPOSIT",
  });

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  // Per-user data: never prerender.
  await connection();
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const all = await getStatements(userId);
  // Only saved statements have transactions in the ledger. Newest closing month first.
  const saved = all
    .filter((s) => s.status === "COMPLETED" || s.status === "NEEDS_VERIFICATION")
    .sort((a, b) => closingDate(b).localeCompare(closingDate(a)));
  const unsaved = all.length - saved.length;

  if (!saved.length) {
    return (
      <>
        <PageHeader eyebrow="Reports" title="Financial statements" />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-20 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="font-medium">No saved statements yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Reports are built from statements you&apos;ve saved to your ledger.
            {unsaved > 0 &&
              ` You have ${unsaved} uploaded ${unsaved === 1 ? "statement" : "statements"} waiting to be reviewed and saved.`}
          </p>
          <Link href={unsaved > 0 ? "/statements" : "/upload"} className="text-sm font-medium text-info hover:underline">
            {unsaved > 0 ? "Go to statements" : "Upload a statement"}
          </Link>
        </div>
      </>
    );
  }

  // An unknown, unsaved, or someone else's id falls back to the newest statement.
  const { statement: requested } = await searchParams;
  const selected = saved.find((s) => s.id === requested) ?? saved[0];

  const baseLabel = (s: StatementListItem) => `${formatMonth(closingDate(s))} · ${account(s)}`;
  const labelCounts = new Map<string, number>();
  for (const s of saved) labelCounts.set(baseLabel(s), (labelCounts.get(baseLabel(s)) ?? 0) + 1);
  const options: StatementOption[] = saved.map((s) => ({
    id: s.id,
    // Two statements for the same account and month (e.g. a re-downloaded
    // PDF) would read identically, so tell them apart by file name.
    label: labelCounts.get(baseLabel(s))! > 1 ? `${baseLabel(s)} · ${s.file_name}` : baseLabel(s),
    account: account(s),
  }));

  // Balance sheet as of the statement's closing date, across all accounts.
  const asOf = closingDate(selected);
  const [rows, balances] = await Promise.all([
    getStatementPnlRows(userId, selected.id),
    getAccountBalances(userId, asOf),
  ]);

  const period =
    selected.start_date && selected.end_date
      ? `${formatDate(selected.start_date)} – ${formatDate(selected.end_date)}`
      : `Uploaded ${formatDate(selected.uploaded_at)}`;

  return (
    <>
      <PageHeader eyebrow="Reports" title="Financial statements">
        <StatementPicker statements={options} selectedId={selected.id} />
      </PageHeader>

      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          {account(selected)} · {period}
        </span>
        <a
          href={`/api/statements/${selected.id}/file`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 font-medium text-info hover:underline"
        >
          <ExternalLink className="size-3.5" />
          View PDF
        </a>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
        {/* not keyed by statement, so section filters carry over when switching */}
        <PnlStatement pnl={buildPnl(rows)} periodLabel={period} />
        <BalanceSheet sheet={buildBalanceSheet(balances, asOf)} />
      </div>
    </>
  );
}
