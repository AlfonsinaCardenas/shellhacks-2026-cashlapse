import "server-only";
import { fetchCpiObservations } from "../fred/client.ts";
import type { FredClientOptions } from "../fred/client.ts";
import { adjustMonthlySpending } from "./adjustments.ts";
import { CPI_SERIES } from "./series.ts";
import type { AdjustedSpendingAnalytics, MonthlySpending } from "./types.ts";

/**
 * Backend handoff: pass user-filtered monthly USD totals and an explicit target.
 * Only the date range is sent to FRED; spending amounts stay inside the app.
 * This service does not decide which transactions belong in operating spending.
 */
export async function getAdjustedMonthlySpending(
  spending: readonly MonthlySpending[],
  targetMonth: string,
  options: FredClientOptions = {},
): Promise<AdjustedSpendingAnalytics> {
  // Validate and snapshot before the network call, avoiding changes during await.
  const validated = adjustMonthlySpending(spending, [], targetMonth);
  const snapshot = validated.spending.map(({ month, nominal }) => ({ month, nominal }));
  let startMonth = targetMonth;
  let endMonth = targetMonth;
  for (const { month } of snapshot) {
    if (month < startMonth) startMonth = month;
    if (month > endMonth) endMonth = month;
  }
  // Retains the existing client's prior-year lookback; dates and metadata stay
  // consistent with /api/inflation. Years before 0002 are rejected by that client.
  const { observations, fetchedAt } = await fetchCpiObservations({ startMonth, endMonth }, options);
  return { ...CPI_SERIES, ...adjustMonthlySpending(snapshot, observations, targetMonth), fetchedAt };
}
