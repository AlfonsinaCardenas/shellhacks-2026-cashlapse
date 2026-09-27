// Server-only: inflation reports over a user's ledger. Spend comes from the
// monthly_pnl continuous aggregate; CPI from macro_cpi (synced from FRED).
import "server-only";
import { sectionFor, type PnlInputRow } from "../financial-statements.ts";
import { getPnlRows } from "../queries.ts";
import { loadCpiTable } from "./cpi-store.ts";
import {
  addMonths,
  buildMonthlyTrends,
  edgeGrowthPct,
  growthPct,
  highestRealGrowthCategory,
  isYearMonth,
  monthRange,
  round2,
  round2OrNull,
  summarizeTrends,
  toRealAmount,
  yoyInflation,
  type CpiTable,
  type MonthlyTrend,
  type TrendSummary,
} from "./real-spending.ts";

// ---- Spend definition ------------------------------------------------------

// "Spend" is money out net of refunds, excluding revenue, transfers, and loan
// principal (none of those are consumption). Taxes are excluded too: they
// don't track consumer prices, so restating them with CPI would mislead.
function isSpend(row: PnlInputRow): boolean {
  const section = sectionFor(row.category);
  return section === "OPERATING" || section === "OTHER" || section === "PERSONAL";
}

function netSpend(row: PnlInputRow): number {
  return row.transaction_type === "EXPENSE" ? row.total : -row.total;
}

async function loadSpendRows(userId: string, from: string, to: string, aiOnly: boolean) {
  // monthly_pnl buckets are month starts; `to` is inclusive, so query to the next month.
  const rows = await getPnlRows(userId, `${from}-01`, `${addMonths(to, 1)}-01`);
  return rows.filter((r) => isSpend(r) && (!aiOnly || r.is_ai_tool));
}

function spendByMonth(rows: readonly PnlInputRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.month!, (map.get(r.month!) ?? 0) + netSpend(r));
  return map;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

// ---- getInflationTrends ----------------------------------------------------

export type InflationTrends = {
  months: MonthlyTrend[];
  summary: TrendSummary;
  target_cpi_month: string | null; // the "today" whose dollars real_spend is in
};

export async function getInflationTrends(
  userId: string,
  fromMonth: string,
  toMonth: string,
  options: { aiOnly?: boolean; cpi?: CpiTable } = {},
): Promise<InflationTrends> {
  const [table, rows] = await Promise.all([
    options.cpi ?? loadCpiTable(),
    loadSpendRows(userId, fromMonth, toMonth, options.aiOnly ?? false),
  ]);
  const byMonth = spendByMonth(rows);
  return {
    months: buildMonthlyTrends(byMonth, table, fromMonth, toMonth),
    summary: summarizeTrends(byMonth, table, fromMonth, toMonth),
    target_cpi_month: table.latest?.month ?? null,
  };
}

// ---- calculateRealAmount ---------------------------------------------------

export type RealAmount = {
  nominal: number;
  real: number | null;
  from_cpi: number | null;
  to_cpi: number | null;
  provisional: boolean; // either side used a borrowed or placeholder CPI
};

/**
 * Restates an amount from one month's dollars into another's:
 *   real = nominal × (cpi_to / cpi_from)
 * `toYearMonth` defaults to the latest released CPI month ("today's dollars").
 */
export async function calculateRealAmount(
  nominalAmount: number,
  fromYearMonth: string,
  toYearMonth?: string,
  cpi?: CpiTable,
): Promise<RealAmount> {
  if (!Number.isFinite(nominalAmount)) throw new RangeError("nominalAmount must be a finite number");
  if (!isYearMonth(fromYearMonth) || (toYearMonth !== undefined && !isYearMonth(toYearMonth))) {
    throw new RangeError("Months must use YYYY-MM");
  }
  const table = cpi ?? (await loadCpiTable());
  const from = table.resolve(fromYearMonth);
  const to = toYearMonth ? table.resolve(toYearMonth) : table.latest;
  const real = from && to ? toRealAmount(nominalAmount, from.cpi, to.cpi) : null;
  return {
    nominal: round2(nominalAmount),
    real: round2OrNull(real),
    from_cpi: from?.cpi ?? null,
    to_cpi: to?.cpi ?? null,
    provisional: !from || !to || from.provisional || to.provisional,
  };
}

// ---- getBudgetRecommendation -----------------------------------------------

export type BudgetRecommendation = {
  window: { from: string; to: string }; // last 12 complete months
  nominal_monthly_avg: number;
  inflation_adjusted_monthly_avg: number | null;
  suggested_budget_increase_pct: number | null;
  highest_inflation_category: string | null;
  highest_inflation_category_growth_pct: number | null;
  yoy_spending_change_real: number | null;
};

/**
 * Looks at the last 12 complete months (the current month is partial and
 * would drag the average down), restates each month in today's dollars, and
 * compares against the 12 months before that.
 */
export async function getBudgetRecommendation(userId: string, cpi?: CpiTable): Promise<BudgetRecommendation> {
  const recentTo = addMonths(currentMonth(), -1);
  const recentFrom = addMonths(recentTo, -11);
  const priorFrom = addMonths(recentFrom, -12);

  const [table, rows] = await Promise.all([cpi ?? loadCpiTable(), loadSpendRows(userId, priorFrom, recentTo, false)]);
  const target = table.latest;

  // Restate every row in today's dollars once, then aggregate however needed.
  const realOf = (r: PnlInputRow) => {
    const c = table.resolve(r.month!);
    return c && target ? toRealAmount(netSpend(r), c.cpi, target.cpi) : null;
  };

  let recentNominal = 0;
  let recentReal = 0;
  let priorReal = 0;
  let realComplete = target !== null;
  let hasPrior = false;
  const byCategory = new Map<string, { prior: number; recent: number }>();

  for (const r of rows) {
    const real = realOf(r);
    if (real === null) realComplete = false;
    const recent = r.month! >= recentFrom;
    const entry = byCategory.get(r.category) ?? { prior: 0, recent: 0 };
    if (recent) {
      recentNominal += netSpend(r);
      recentReal += real ?? 0;
      entry.recent += real ?? 0;
    } else {
      hasPrior = true;
      priorReal += real ?? 0;
      entry.prior += real ?? 0;
    }
    byCategory.set(r.category, entry);
  }

  // To keep buying the same things next year, a budget has to grow by the
  // current annual inflation rate: latest CPI vs the same month a year earlier.
  const latestYoy = target ? yoyInflation(table, target.month).rate : null;
  const top = highestRealGrowthCategory(byCategory);

  return {
    window: { from: recentFrom, to: recentTo },
    nominal_monthly_avg: round2(recentNominal / 12),
    inflation_adjusted_monthly_avg: realComplete ? round2(recentReal / 12) : null,
    suggested_budget_increase_pct: round2OrNull(latestYoy),
    highest_inflation_category: top?.category ?? null,
    highest_inflation_category_growth_pct: top?.growth_pct ?? null,
    yoy_spending_change_real: hasPrior && realComplete ? round2OrNull(growthPct(priorReal, recentReal)) : null,
  };
}

// ---- AI spend vs CPI -------------------------------------------------------

export type AiSpendInflation = InflationTrends & {
  ai_spend_growth_pct: number | null; // nominal AI spend, start vs end of range
  cpi_growth_pct: number | null; // CPI over the same windows
  ai_inflation_vs_cpi: number | null; // percentage points: AI growth − CPI growth
};

/**
 * How AI tool costs moved compared with prices in general. Both growth rates
 * compare the average of the first and last (up to) three months of the range,
 * so they're measured over identical windows and a single annual invoice
 * doesn't dominate. Positive ai_inflation_vs_cpi = AI costs outpaced inflation.
 */
export async function getAiSpendInflation(userId: string, fromMonth: string, toMonth: string): Promise<AiSpendInflation> {
  const table = await loadCpiTable();
  const trends = await getInflationTrends(userId, fromMonth, toMonth, { aiOnly: true, cpi: table });

  const nominal = trends.months.map((m) => m.nominal_spend);
  const cpiLevels = monthRange(fromMonth, toMonth).map((m) => table.resolve(m)?.cpi ?? null);
  const aiGrowth = edgeGrowthPct(nominal);
  const cpiGrowth = cpiLevels.every((c): c is number => c !== null) ? edgeGrowthPct(cpiLevels) : null;

  return {
    ...trends,
    ai_spend_growth_pct: round2OrNull(aiGrowth),
    cpi_growth_pct: round2OrNull(cpiGrowth),
    ai_inflation_vs_cpi: aiGrowth !== null && cpiGrowth !== null ? round2(aiGrowth - cpiGrowth) : null,
  };
}

// ---- Request params --------------------------------------------------------

const MAX_MONTHS = 120;

/** ?from=YYYY-MM&to=YYYY-MM, defaulting to the trailing 12 months. */
export function parseMonthRange(url: string): { from: string; to: string } | { error: string } {
  const params = new URL(url).searchParams;
  const to = params.get("to") ?? currentMonth();
  const from = params.get("from") ?? addMonths(to, -11);
  if (!isYearMonth(from) || !isYearMonth(to)) return { error: "from and to must use YYYY-MM." };
  if (from > to) return { error: "from must not be after to." };
  const span = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5)) + 1;
  if (span > MAX_MONTHS) return { error: `Ranges are limited to ${MAX_MONTHS} months.` };
  return { from, to };
}
