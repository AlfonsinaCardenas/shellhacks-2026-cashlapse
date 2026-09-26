import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { BalanceSheet } from "@/components/reports/balance-sheet";
import { PeriodPicker } from "@/components/reports/period-picker";
import { PnlStatement } from "@/components/reports/pnl-statement";
import { buildBalanceSheet, buildPnl } from "@/lib/financial-statements";
import { getAccountBalances, getPnlRows } from "@/lib/queries";
import { parsePeriod, periodOptions } from "@/lib/report-periods";
import { getSessionUserId } from "@/lib/session";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  // Per-user data: never prerender, even while the dev session stub needs no cookies.
  await connection();
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const { period: raw } = await searchParams;
  const period = parsePeriod(typeof raw === "string" ? raw : undefined);

  // Balance sheet is as of the last day of the period, or today if the
  // period isn't over yet.
  const lastDay = new Date(new Date(`${period.to}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const asOf = lastDay < today ? lastDay : today;

  const [rows, balances] = await Promise.all([
    getPnlRows(userId, period.from, period.to),
    getAccountBalances(userId, asOf),
  ]);

  return (
    <>
      <PageHeader eyebrow="Reports" title="Financial statements">
        <PeriodPicker value={period.value} groups={periodOptions()} />
      </PageHeader>

      <div className="grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
        <PnlStatement pnl={buildPnl(rows)} periodLabel={period.label} />
        <BalanceSheet sheet={buildBalanceSheet(balances, asOf)} />
      </div>
    </>
  );
}
