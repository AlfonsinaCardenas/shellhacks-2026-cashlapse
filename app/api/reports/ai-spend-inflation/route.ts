import { getAiSpendInflation } from "@/lib/inflation/metrics";
import { runReport } from "@/lib/inflation/report-http";
import type { MonthlyTrend } from "@/lib/inflation/real-spending";

export type AiSpendInflationResponse = {
  months: MonthlyTrend[]; // AI tool spend only (is_ai_tool = true)
  summary: {
    avg_monthly_nominal: number;
    avg_monthly_real: number | null;
    total_inflation_impact: number | null;
    ai_spend_growth_pct: number | null;
    cpi_growth_pct: number | null;
    ai_inflation_vs_cpi: number | null; // percentage points; > 0 = AI costs outpaced CPI
  };
  target_cpi_month: string | null;
};

// GET /api/reports/ai-spend-inflation?from=YYYY-MM&to=YYYY-MM
export async function GET(request: Request) {
  return runReport(request, "ai-spend-inflation", async (userId, { from, to }) => {
    const r = await getAiSpendInflation(userId, from, to);
    const body: AiSpendInflationResponse = {
      months: r.months,
      summary: {
        ...r.summary,
        ai_spend_growth_pct: r.ai_spend_growth_pct,
        cpi_growth_pct: r.cpi_growth_pct,
        ai_inflation_vs_cpi: r.ai_inflation_vs_cpi,
      },
      target_cpi_month: r.target_cpi_month,
    };
    return body;
  });
}
