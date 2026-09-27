import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getAccountLabels, getDashboardData } from "@/lib/queries";
import { getSessionUserId } from "@/lib/session";
import { statementCategoryPrices, type CategoryPrice } from "@/lib/bea/statement-prices";

// Earliest dashboard range is Jan 2023; load three more years so that range
// has an equally long previous period to compare against.
const FROM = "2020-01-01";

export default async function DashboardPage() {
  // Per-user data: never prerender, even while the dev session stub needs no cookies.
  await connection();
  const userId = await getSessionUserId();

  if (!userId) redirect("/");
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  const [{ monthly, spending }, accounts, categories] = await Promise.all([
    getDashboardData(userId, FROM, nextMonth),
    getAccountLabels(userId),
    statementCategoryPrices(userId).catch((err: unknown) => {
      console.error("[dashboard] category prices unavailable:", err instanceof Error ? err.message : err);
      return [] as CategoryPrice[];
    }),
  ]);
  
  return <DashboardView monthly={monthly} spending={spending} accounts={accounts} categories={categories} />;
}
