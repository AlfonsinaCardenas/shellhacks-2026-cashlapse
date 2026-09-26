import type {
  CpiObservation,
  InflationCalculation,
  InflationObservation,
  InflationRange,
} from "./types.ts";

function monthIndex(month: string): number {
  if (typeof month !== "string" || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError("Months must use YYYY-MM with a year from 0001 to 9999.");
  }
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}

function formatMonth(index: number): string {
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}

/** Shared validation for calculations and provider requests. */
export function validateInflationRange(range: InflationRange): void {
  const start = monthIndex(range.startMonth);
  const end = monthIndex(range.endMonth);
  if (start > end) throw new RangeError("startMonth must not be after endMonth.");
  if (start < 24) throw new RangeError("startMonth must allow a twelve-month lookback within years 0001-9999.");
}

function validCpi(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Unrounded percent change. Missing/invalid levels never become zero. */
export function calculatePercentChange(
  baseline: number | null | undefined,
  current: number | null | undefined,
): number | null {
  if (!validCpi(baseline) || !validCpi(current)) return null;
  const result = (current / baseline - 1) * 100;
  return Number.isFinite(result) ? result : null;
}

/**
 * Calculate by calendar month, using any supplied prior-year observations.
 * Input order is irrelevant. Duplicate months are rejected as ambiguous data.
 * No network access, date/timezone dependence, or mutation of the input.
 */
export function calculateInflation(
  input: readonly CpiObservation[],
  range: InflationRange,
): InflationCalculation {
  validateInflationRange(range);
  const start = monthIndex(range.startMonth);
  const end = monthIndex(range.endMonth);

  const levels = new Map<number, number | null>();
  for (const observation of input) {
    const index = monthIndex(observation.month);
    if (levels.has(index)) throw new RangeError(`Duplicate CPI month: ${observation.month}.`);
    levels.set(index, validCpi(observation.cpi) ? observation.cpi : null);
  }

  const observations: InflationObservation[] = [];
  let latestAvailableMonth: string | null = null;
  for (let index = start; index <= end; index++) {
    const month = formatMonth(index);
    const cpi = levels.get(index) ?? null;
    if (cpi !== null) latestAvailableMonth = month;
    observations.push({
      month,
      cpi,
      yearOverYearPercent: calculatePercentChange(levels.get(index - 12), cpi),
    });
  }

  return {
    startMonth: range.startMonth,
    endMonth: range.endMonth,
    latestAvailableMonth,
    observations,
    cumulativeInflationPercent: calculatePercentChange(levels.get(start), levels.get(end)),
  };
}
