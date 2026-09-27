import type { AdjustedSpending, CpiObservation, MonthlySpending } from "./types.ts";

function validCpi(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateMonth(month: string): void {
  if (typeof month !== "string" || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError("Months must use YYYY-MM with a year from 0001 to 9999.");
  }
}

/** Express an amount in target-period dollars; preserve signs and full precision. */
export function adjustAmountForInflation(
  amount: number | null | undefined,
  sourceCpi: number | null | undefined,
  targetCpi: number | null | undefined,
): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) ||
      !validCpi(sourceCpi) || !validCpi(targetCpi)) return null;
  const ratio = targetCpi / sourceCpi;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const adjusted = amount * ratio;
  return Number.isFinite(adjusted) ? adjusted : null;
}

/**
 * Pure conversion of monthly totals using one consistent CPI series.
 * No fetching, aggregation, interpolation, rounding, or target-month fallback.
 */
export function adjustMonthlySpending(
  spending: readonly MonthlySpending[],
  observations: readonly CpiObservation[],
  targetMonth: string,
): AdjustedSpending {
  validateMonth(targetMonth);
  const levels = new Map<string, number | null>();
  for (const observation of observations) {
    validateMonth(observation.month);
    if (levels.has(observation.month)) throw new RangeError(`Duplicate CPI month: ${observation.month}.`);
    levels.set(observation.month, validCpi(observation.cpi) ? observation.cpi : null);
  }
  const targetCpi = levels.get(targetMonth) ?? null;
  const seen = new Set<string>();
  const adjusted = spending.map(({ month, nominal }) => {
    validateMonth(month);
    if (seen.has(month)) throw new RangeError(`Duplicate spending month: ${month}. Aggregate monthly amounts first.`);
    seen.add(month);
    if (typeof nominal !== "number" || !Number.isFinite(nominal)) {
      throw new RangeError("Monthly spending must contain finite numeric amounts.");
    }
    const sourceCpi = levels.get(month) ?? null;
    return { month, nominal, sourceCpi, adjusted: adjustAmountForInflation(nominal, sourceCpi, targetCpi) };
  });
  adjusted.sort((a, b) => a.month.localeCompare(b.month));
  return { targetMonth, targetCpi, spending: adjusted };
}
