import "server-only";
import { fetchCpiObservations } from "@/lib/fred/client";
import { adjustMonthlySpending } from "@/lib/inflation/adjustments";
import {
  accountLabel,
  buildPnl,
  monthlyDashboardSpend,
  type AccountBalance,
  type MonthlyTotals,
  type PnlInputRow,
} from "@/lib/financial-statements";
import { pool } from "@/lib/tigerdata";

// Statements whose transactions are in the ledger.
const CONFIRMED = "status IN ('COMPLETED', 'NEEDS_VERIFICATION')";

// P&L inputs from the monthly_pnl continuous aggregate. `from` is inclusive,
// `to` exclusive; both should be the 1st of a month since buckets are monthly.
export async function getPnlRows(userId: string, from: string, to: string): Promise<PnlInputRow[]> {
  const { rows } = await pool.query<PnlInputRow>(
    `SELECT to_char(month AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
            category, transaction_type, is_ai_tool,
            SUM(total_nominal)::float8 AS total
     FROM monthly_pnl
     WHERE user_id = $1 AND month >= $2::timestamptz AND month < $3::timestamptz
     GROUP BY 1, 2, 3, 4`,
    [userId, `${from}T00:00:00Z`, `${to}T00:00:00Z`],
  );
  return rows;
}

// Latest confirmed statement balance per account, as of a date.
export async function getAccountBalances(userId: string, asOf: string): Promise<AccountBalance[]> {
  const { rows } = await pool.query<AccountBalance>(
    `SELECT DISTINCT ON (bank_name, account_identifier, account_type)
            COALESCE(bank_name, 'Unknown bank') AS bank_name,
            COALESCE(account_identifier, '') AS account_identifier,
            account_type,
            ending_balance::float8 AS ending_balance,
            to_char(period_end, 'YYYY-MM-DD') AS as_of,
            status = 'NEEDS_VERIFICATION' AS needs_verification
     FROM statements
     WHERE user_id = $1 AND ${CONFIRMED}
       AND period_end IS NOT NULL AND ending_balance IS NOT NULL AND account_type IS NOT NULL
       AND period_end <= $2::date
     ORDER BY bank_name, account_identifier, account_type, period_end DESC, created_at DESC`,
    [userId, asOf],
  );
  return rows;
}

export async function getAccountLabels(userId: string): Promise<string[]> {
  const { rows } = await pool.query<Pick<AccountBalance, "bank_name" | "account_identifier" | "account_type">>(
    `SELECT DISTINCT COALESCE(bank_name, 'Unknown bank') AS bank_name,
            COALESCE(account_identifier, '') AS account_identifier, account_type
     FROM statements WHERE user_id = $1 AND ${CONFIRMED} AND account_type IS NOT NULL`,
    [userId],
  );
  return rows.map(accountLabel).sort();
}

// Dashboard data: per-month P&L headline numbers plus operating and personal
// spend in nominal and today's dollars.
export async function getDashboardData(userId: string, from: string, to: string) {
  const rows = await getPnlRows(userId, from, to);

  const months = [...new Set(rows.map((r) => r.month!))].sort();
  const monthly: MonthlyTotals[] = months.map((month) => {
    const pnl = buildPnl(rows.filter((r) => r.month === month));
    return { month, revenue: pnl.revenue.total, expenses: pnl.operating.total, netIncome: pnl.netIncome };
  });

  const nominal = monthlyDashboardSpend(rows);
  const spending = await adjustToTodaysDollars(nominal);
  return { monthly, spending };
}

// Restates each month's spend in the dollars of the latest month FRED has CPI
// for. If CPI is unavailable (no FRED_API_KEY, outage), "real" falls back to
// nominal and the point is marked provisional.
async function adjustToTodaysDollars(spending: { month: string; nominal: number }[]) {
  const fallback = spending.map((s) => ({ month: `${s.month}-01`, nominal: s.nominal, real: s.nominal, provisional: true }));
  if (!spending.length) return [];

  const thisMonth = new Date().toISOString().slice(0, 7);
  try {
    const { observations } = await fetchCpiObservations({ startMonth: spending[0].month, endMonth: thisMonth });
    const target = observations.filter((o) => o.cpi !== null).at(-1)?.month;
    if (!target) return fallback;

    const adjusted = adjustMonthlySpending(spending, observations, target);
    return adjusted.spending.map((s) => ({
      month: `${s.month}-01`,
      nominal: s.nominal,
      real: s.adjusted ?? s.nominal,
      provisional: s.adjusted === null, // CPI for this month isn't published yet
    }));
  } catch (err) {
    console.warn("[dashboard] CPI adjustment unavailable:", err instanceof Error ? err.message : err);
    return fallback;
  }
}
