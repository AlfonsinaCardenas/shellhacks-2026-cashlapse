import { getInflationAnalytics } from "../lib/inflation/service.ts";
import { FredError } from "../lib/fred/client.ts";

// Run explicitly with --env-file=.env; never prints credentials or raw errors.
try {
  const result = await getInflationAnalytics({ startMonth: "2024-01", endMonth: "2025-01" });
  console.log(JSON.stringify({
    seriesId: result.seriesId,
    startMonth: result.startMonth,
    endMonth: result.endMonth,
    observationCount: result.observations.length,
    latestAvailableMonth: result.latestAvailableMonth,
    cumulativeInflationPercent: result.cumulativeInflationPercent,
  }, null, 2));
  if (result.cumulativeInflationPercent === null) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof FredError ? `${error.code}: ${error.message}` : "Inflation check failed.");
  process.exitCode = 1;
}
