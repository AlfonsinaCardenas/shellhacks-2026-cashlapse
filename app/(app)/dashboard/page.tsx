import { DashboardView } from "@/components/dashboard/dashboard-view";
import { mockAccounts, mockSpending, mockTotals } from "@/lib/mock-data";

// TODO: replace mock data with lib/queries.ts (P&L + inflation queries).
export default function DashboardPage() {
  return <DashboardView totals={mockTotals} spending={mockSpending} accounts={mockAccounts} />;
}
