// Dashboard chart data: monthly income and expenses from the ledger next to
// FRED CPI. Pure and client-safe; relative .ts imports so node --test runs it.
import type { MonthlyTotals } from "./financial-statements.ts";
import { monthRange, round2, round2OrNull, toRealAmount, type CpiTable } from "./inflation/real-spending.ts";

export type DashboardPoint = {
  month: string; // YYYY-MM-01, what the charts' time axis expects
  income: number;
  expenses: number;
  netIncome: number;
  // Same amounts restated in the latest released CPI month's dollars.
  // null when no CPI covers the month (before the stored history).
  incomeReal: number | null;
  expensesReal: number | null;
  netIncomeReal: number | null;
  cpi: number | null;
  cpiProvisional: boolean; // CPI borrowed from an earlier month (not published yet, or a gap)
};

export function buildDashboardPoints(
  monthly: readonly MonthlyTotals[],
  cpi: CpiTable | null,
  from: string, // YYYY-MM, inclusive
  to: string, // YYYY-MM, inclusive
): DashboardPoint[] {
  const byMonth = new Map(monthly.map((m) => [m.month, m]));
  const target = cpi?.latest ?? null;

  return monthRange(from, to).map((month) => {
    const m = byMonth.get(month);
    const income = m?.revenue ?? 0;
    // Charts use the team's dashboard spend (operating + personal), not the
    // operating-only P&L line.
    const expenses = m?.spending ?? 0;
    const netIncome = m?.netIncome ?? 0;
    const level = cpi?.resolve(month) ?? null;
    // real = nominal × (latest CPI / this month's CPI)
    const real = (n: number) => (level && target ? round2OrNull(toRealAmount(n, level.cpi, target.cpi)) : null);
    return {
      month: `${month}-01`,
      income: round2(income),
      expenses: round2(expenses),
      netIncome: round2(netIncome),
      incomeReal: real(income),
      expensesReal: real(expenses),
      netIncomeReal: real(netIncome),
      cpi: level?.cpi ?? null,
      cpiProvisional: level ? level.provisional : false,
    };
  });
}

export type IndexedPoint = {
  month: string;
  income: number | null; // % change vs the start of the range
  expenses: number | null;
  cpi: number | null;
  cpiProvisional: boolean;
};

// Six months is the least that leaves room for a 3-month average plus a
// meaningful trend after it; shorter ranges compare raw months.
const SMOOTH_FROM = 6;

/**
 * Puts income, expenses and CPI on one scale: % change since the start of the
 * range. All three get the same treatment so the comparison is fair:
 *   - 6+ months: trailing 3-month average, so one large invoice or a quiet
 *     month doesn't swing the line. Lines start (at 0%) on the third month,
 *     the first with a full window.
 *   - fewer months: each month is compared with the first month directly.
 * A zero or missing baseline gives null, never a fake 0%.
 */
export function indexSinceStart(points: readonly DashboardPoint[]): IndexedPoint[] {
  const window = points.length >= SMOOTH_FROM ? 3 : 1;

  const series = (values: readonly (number | null)[]) => {
    const smoothed = values.map((_, i) => {
      if (i < window - 1) return null;
      const slice = values.slice(i - window + 1, i + 1);
      return slice.every((v): v is number => v !== null) ? slice.reduce((s, v) => s + v, 0) / window : null;
    });
    const base = smoothed[window - 1];
    return smoothed.map((v) => (v === null || !base ? null : round2((v / base - 1) * 100)));
  };

  const income = series(points.map((p) => p.income));
  const expenses = series(points.map((p) => p.expenses));
  const cpi = series(points.map((p) => p.cpi));

  return points.map((p, i) => ({
    month: p.month,
    income: income[i],
    expenses: expenses[i],
    cpi: cpi[i],
    cpiProvisional: p.cpiProvisional,
  }));
}
