// Pure inflation math for spending reports. No I/O, so node --test runs it
// directly. DB access lives in metrics.ts; FRED access in ../fred/client.ts.
import { adjustAmountForInflation } from "./adjustments.ts";
import { calculatePercentChange } from "./calculations.ts";

/** One stored CPI level (a macro_cpi row). */
export type CpiLevel = { month: string; cpi: number; provisional: boolean };

/** A CPI level resolved for a given month, possibly borrowed from a later/earlier month. */
export type ResolvedCpi = { cpi: number; provisional: boolean };

export type MonthlyTrend = {
  month: string; // YYYY-MM
  nominal_spend: number;
  real_spend: number | null; // null when no CPI covers this month
  cpi_index: number | null;
  inflation_rate_yoy: number | null; // % change in CPI vs the same month last year
  purchasing_power_change_pct: number | null; // (real - nominal) / nominal * 100
  cpi_provisional: boolean;
};

// ---- Month helpers ---------------------------------------------------------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isYearMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

/** Inclusive list of months from `from` to `to`. */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);
  return months;
}

// ---- Rounding --------------------------------------------------------------

// Money and percentages are rounded to 2 decimals only at the output edge;
// every intermediate step keeps full precision so rounding never compounds.
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round2OrNull = (n: number | null) => (n === null ? null : round2(n));

// ---- CPI lookup ------------------------------------------------------------

export class CpiTable {
  private readonly byMonth = new Map<string, CpiLevel>();
  private readonly sorted: CpiLevel[];
  readonly latest: CpiLevel | null;

  constructor(levels: readonly CpiLevel[]) {
    let latestReleased: CpiLevel | null = null;
    for (const level of levels) {
      this.byMonth.set(level.month, level);
      if (!level.provisional && (!latestReleased || level.month > latestReleased.month)) latestReleased = level;
    }
    this.sorted = [...this.byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    // "Today's dollars" means the newest officially released CPI. Provisional
    // placeholder rows carry that same value forward, so preferring the
    // released row only matters if nothing has been released yet.
    this.latest = latestReleased ?? this.sorted.at(-1) ?? null;
  }

  /**
   * CPI for a month. When BLS hasn't published it (not out yet, or a gap such
   * as Oct 2025 during the shutdown), borrow the latest level available as of
   * that month and flag it provisional. Months older than the stored history
   * resolve to null: there's no honest stand-in for missing history.
   */
  resolve(month: string): ResolvedCpi | null {
    const exact = this.byMonth.get(month);
    if (exact) return { cpi: exact.cpi, provisional: exact.provisional };
    let earlier: CpiLevel | null = null;
    for (const level of this.sorted) {
      if (level.month > month) break;
      earlier = level;
    }
    return earlier ? { cpi: earlier.cpi, provisional: true } : null;
  }

  /** Exact stored level only, for year-over-year comparisons. */
  exact(month: string): CpiLevel | null {
    return this.byMonth.get(month) ?? null;
  }
}

// ---- Core formulas ---------------------------------------------------------

/**
 * Restate a nominal amount in target-month dollars:
 *   real = nominal × (cpi_target / cpi_source)
 * If prices rose 10% since the source month, cpi_target / cpi_source = 1.10,
 * so $100 spent then is worth $110 of today's purchasing power.
 */
export function toRealAmount(nominal: number, sourceCpi: number, targetCpi: number): number | null {
  return adjustAmountForInflation(nominal, sourceCpi, targetCpi);
}

/**
 * Year-over-year CPI inflation for a month:
 *   ((cpi_month − cpi_same_month_last_year) / cpi_same_month_last_year) × 100
 * Uses exact stored levels on both ends, so a missing year-ago month gives null
 * instead of a misleading number.
 */
export function yoyInflation(table: CpiTable, month: string): { rate: number | null; provisional: boolean } {
  const current = table.resolve(month);
  const yearAgo = table.exact(addMonths(month, -12));
  if (!current || !yearAgo) return { rate: null, provisional: current?.provisional ?? true };
  return {
    rate: calculatePercentChange(yearAgo.cpi, current.cpi),
    provisional: current.provisional || yearAgo.provisional,
  };
}

/**
 * How much purchasing power the nominal amount has lost (or gained):
 *   ((real − nominal) / nominal) × 100
 * +5% means you'd need 5% more money today to buy what that spend bought then.
 */
export function purchasingPowerChange(nominal: number, real: number | null): number | null {
  if (real === null || nominal === 0) return null;
  return ((real - nominal) / nominal) * 100;
}

/** Percent growth from a baseline; null when the baseline is zero or missing. */
export function growthPct(baseline: number, current: number): number | null {
  if (!Number.isFinite(baseline) || !Number.isFinite(current) || baseline === 0) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

// ---- Report builders -------------------------------------------------------

/**
 * Month-by-month nominal vs real spend. Every month in the range appears,
 * with zero spend where there were no transactions, so charts stay continuous.
 */
export function buildMonthlyTrends(
  spendByMonth: ReadonlyMap<string, number>,
  table: CpiTable,
  from: string,
  to: string,
): MonthlyTrend[] {
  const target = table.latest;
  return monthRange(from, to).map((month) => {
    const nominal = spendByMonth.get(month) ?? 0;
    const cpi = table.resolve(month);
    const real = cpi && target ? toRealAmount(nominal, cpi.cpi, target.cpi) : null;
    const yoy = yoyInflation(table, month);
    return {
      month,
      nominal_spend: round2(nominal),
      real_spend: round2OrNull(real),
      cpi_index: cpi ? cpi.cpi : null,
      inflation_rate_yoy: round2OrNull(yoy.rate),
      purchasing_power_change_pct: round2OrNull(purchasingPowerChange(nominal, real)),
      cpi_provisional: !cpi || cpi.provisional,
    };
  });
}

export type TrendSummary = {
  avg_monthly_nominal: number;
  avg_monthly_real: number | null;
  total_inflation_impact: number | null; // Σ real − Σ nominal
};

// Summaries are computed from the unrounded inputs, not the rounded rows.
export function summarizeTrends(
  spendByMonth: ReadonlyMap<string, number>,
  table: CpiTable,
  from: string,
  to: string,
): TrendSummary {
  const months = monthRange(from, to);
  const target = table.latest;
  let nominal = 0;
  let real = 0;
  let realComplete = target !== null;
  for (const month of months) {
    const n = spendByMonth.get(month) ?? 0;
    nominal += n;
    const cpi = table.resolve(month);
    const r = cpi && target ? toRealAmount(n, cpi.cpi, target.cpi) : null;
    if (r === null) realComplete = false;
    else real += r;
  }
  const count = months.length || 1;
  return {
    avg_monthly_nominal: round2(nominal / count),
    avg_monthly_real: realComplete ? round2(real / count) : null,
    total_inflation_impact: realComplete ? round2(real - nominal) : null,
  };
}

/**
 * Compares average spend at the start and end of a range. Uses up to three
 * months on each side so an annual bill or one odd month doesn't dominate.
 */
export function edgeGrowthPct(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const window = Math.max(1, Math.min(3, Math.floor(values.length / 2)));
  const avg = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return growthPct(avg(values.slice(0, window)), avg(values.slice(-window)));
}

/**
 * Category whose spend grew the most in real (inflation-adjusted) terms,
 * comparing the latest 12 months against the 12 before. Categories with a
 * tiny baseline are skipped so $2 → $20 doesn't read as "+900%".
 */
export function highestRealGrowthCategory(
  realByCategory: ReadonlyMap<string, { prior: number; recent: number }>,
  minBaseline = 50,
): { category: string; growth_pct: number } | null {
  let best: { category: string; growth_pct: number } | null = null;
  for (const [category, { prior, recent }] of realByCategory) {
    if (prior < minBaseline) continue;
    const g = growthPct(prior, recent);
    if (g !== null && g > 0 && (!best || g > best.growth_pct)) best = { category, growth_pct: g };
  }
  return best && { category: best.category, growth_pct: round2(best.growth_pct) };
}
