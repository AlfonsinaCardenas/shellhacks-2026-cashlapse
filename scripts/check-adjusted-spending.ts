import { getAdjustedMonthlySpending } from "../lib/inflation/spending-service.ts";
import { FredError } from "../lib/fred/client.ts";

// Synthetic spending with real CPI; does not access statements or the database.
try {
  const result = await getAdjustedMonthlySpending([{ month: "2024-01", nominal: 100 }], "2025-01");
  console.log(JSON.stringify({ spendingIsSynthetic: true, ...result }, null, 2));
  if (result.spending[0].adjusted === null) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof FredError ? `${error.code}: ${error.message}` : "Adjusted spending check failed.");
  process.exitCode = 1;
}
