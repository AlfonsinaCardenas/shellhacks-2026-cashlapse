import "server-only";
import { fetchCpiObservations } from "../fred/client.ts";
import type { FredClientOptions } from "../fred/client.ts";
import { calculateInflation } from "./calculations.ts";
import { CPI_SERIES } from "./series.ts";
import type { InflationAnalytics, InflationRange } from "./types.ts";

/** Server-only entry point for a Next.js route or Server Component. */
export async function getInflationAnalytics(
  range: InflationRange,
  options: FredClientOptions = {},
): Promise<InflationAnalytics> {
  const { observations, fetchedAt } = await fetchCpiObservations(range, options);
  return { ...CPI_SERIES, ...calculateInflation(observations, range), fetchedAt };
}
