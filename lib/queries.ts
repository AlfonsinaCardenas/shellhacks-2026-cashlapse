import "server-only";
import { buildDashboardPoints } from "@/lib/dashboard-series";
import {
  accountLabel,
  buildPnl,
  monthlyDashboardSpend,
  type AccountBalance,
  type MonthlyTotals,
  type PnlInputRow,
} from "@/lib/financial-statements";
import { CpiNotSyncedError, loadCpiTable } from "@/lib/inflation/cpi-store";
import type { AccountType, StatementStatus } from "@/lib/statement-types";
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

// Dashboard data: per-month P&L headline numbers, plus chart points that put
// income and spending (operating + personal, same as monthlyDashboardSpend)
// next to CPI from macro_cpi, kept fresh by the daily /api/cron/sync-cpi job.
// If CPI hasn't been synced yet the dashboard still works, just without
// inflation-adjusted values.
export async function getDashboardData(userId: string, from: string, to: string) {
  const [rows, cpi] = await Promise.all([
    getPnlRows(userId, from, to),
    loadCpiTable().catch((err) => {
      if (err instanceof CpiNotSyncedError) return null;
      throw err;
    }),
  ]);

  const months = [...new Set(rows.map((r) => r.month!))].sort();
  const spendByMonth = new Map(monthlyDashboardSpend(rows).map((s) => [s.month, s.nominal]));
  const monthly: MonthlyTotals[] = months.map((month) => {
    const pnl = buildPnl(rows.filter((r) => r.month === month));
    return {
      month,
      revenue: pnl.revenue.total,
      expenses: pnl.operating.total,
      spending: spendByMonth.get(month) ?? 0,
      netIncome: pnl.netIncome,
    };
  });

  // First to last month with statement data, gaps in between filled with 0.
  // Stopping at the last data month (not today) matters: months after the
  // latest uploaded statement aren't "$0 income", they're just not uploaded.
  const points = months.length ? buildDashboardPoints(monthly, cpi, months[0], months[months.length - 1]) : [];

  return { monthly, points, cpiTargetMonth: cpi?.latest?.month ?? null };
}

export type StatementListItem = {
  id: string;
  file_name: string;
  bank_name: string | null;
  account_identifier: string | null;
  account_type: AccountType | null;
  start_date: string | null;
  end_date: string | null;
  transaction_count: number | null;
  status: StatementStatus;
  uploaded_at: string;
};

// Everything the user has uploaded, newest first. Account and period come
// from the stored extraction so this works before the balance migration runs.
export async function getStatements(userId: string): Promise<StatementListItem[]> {
  const { rows } = await pool.query<StatementListItem>(
    `SELECT id, file_name, bank_name,
            NULLIF(extraction_payload #>> '{extraction,account_identifier}', '') AS account_identifier,
            NULLIF(extraction_payload #>> '{extraction,account_type}', '') AS account_type,
            NULLIF(extraction_payload #>> '{extraction,start_date}', '') AS start_date,
            NULLIF(extraction_payload #>> '{extraction,end_date}', '') AS end_date,
            jsonb_array_length(COALESCE(extraction_payload #> '{extraction,transactions}', '[]'::jsonb)) AS transaction_count,
            status, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS uploaded_at
     FROM statements WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

// P&L inputs for a single statement. Reads the ledger directly because the
// monthly_pnl aggregate has no statement column.
export async function getStatementPnlRows(userId: string, statementId: string): Promise<PnlInputRow[]> {
  const { rows } = await pool.query<PnlInputRow>(
    `SELECT category, transaction_type, is_ai_tool, SUM(nominal_amount)::float8 AS total
     FROM financial_ledger
     WHERE user_id = $1 AND statement_id = $2
     GROUP BY 1, 2, 3`,
    [userId, statementId],
  );
  return rows;
}
