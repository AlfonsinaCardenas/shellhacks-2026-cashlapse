import { loadCpiTable } from "@/lib/inflation/cpi-store";
import { getBudgetRecommendation, getInflationTrends } from "@/lib/inflation/metrics";
import { runReport } from "@/lib/inflation/report-http";
import type { MonthlyTrend } from "@/lib/inflation/real-spending";

export type BudgetComparisonResponse = {
  months: MonthlyTrend[];
  summary: {
    avg_monthly_nominal: number;
    avg_monthly_real: number | null;
    total_inflation_impact: number | null; // Σ real − Σ nominal over the range
    suggested_budget_increase_pct: number | null;
    highest_inflation_category: string | null;
    yoy_spending_change_real: number | null;
  };
  target_cpi_month: string | null;
};

// GET /api/reports/budget-comparison?from=YYYY-MM&to=YYYY-MM
export async function GET(request: Request) {
  return runReport(request, "budget-comparison", async (userId, { from, to }) => {
    const cpi = await loadCpiTable(); // load once, share with both computations
    const [trends, budget] = await Promise.all([
      getInflationTrends(userId, from, to, { cpi }),
      getBudgetRecommendation(userId, cpi),
    ]);

    const body: BudgetComparisonResponse = {
      months: trends.months,
      summary: {
        ...trends.summary,
        // The recommendation always looks at the last 12 complete months,
        // independent of the requested range.
        suggested_budget_increase_pct: budget.suggested_budget_increase_pct,
        highest_inflation_category: budget.highest_inflation_category,
        yoy_spending_change_real: budget.yoy_spending_change_real,
      },
      target_cpi_month: trends.target_cpi_month,
    };
    return body;
  });
}
