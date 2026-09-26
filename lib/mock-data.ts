// TEMPORARY placeholder data so the UI has something to render.
// Replace each export with real data (session, `lib/queries.ts`, `statements` table)
// as those features get built. Delete this file once nothing imports it.

export type StatementStatus =
  | "PROCESSING"
  | "NEEDS_REVIEW"
  | "NEEDS_VERIFICATION"
  | "COMPLETED"
  | "FAILED";

export type Statement = {
  id: string;
  fileName: string;
  bankName: string;
  uploadedAt: string; // ISO date
  status: StatementStatus;
};

export const mockAccounts = [
  "Chase Business Checking",
  "Bank of America Savings",
  "American Express",
  "Wells Fargo",
];

export const mockStatements: Statement[] = [
  { id: "1", fileName: "Chase_Business_Jan_2026.pdf", bankName: "Chase", uploadedAt: "2026-01-31", status: "COMPLETED" },
  { id: "2", fileName: "BofA_Savings_Jan_2026.csv", bankName: "Bank of America", uploadedAt: "2026-01-31", status: "PROCESSING" },
  { id: "3", fileName: "Amex_December_2025.pdf", bankName: "American Express", uploadedAt: "2026-01-02", status: "NEEDS_VERIFICATION" },
  { id: "4", fileName: "WellsFargo_Nov_2025.pdf", bankName: "Wells Fargo", uploadedAt: "2025-12-03", status: "FAILED" },
];

export const mockTotals = {
  revenue: { value: 74820.0, change: 8.4 },
  expenses: { value: 51246.32, change: 3.2 },
  netIncome: { value: 23573.68, change: 21.7 },
};

// Monthly operating spend, Jan 2023 → Jan 2026.
// Real values use a flat ~3%/yr stand-in for CPI; the real version comes from
// `monthly_pnl` joined to `macro_cpi` (see cashlapse-tdd.md §6.2).
export const mockSpending = Array.from({ length: 37 }, (_, i) => {
  const month = new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10);
  const nominal = Math.round(2000 + i * 120 + Math.sin(i / 1.9) * 700);
  const yearsAgo = (36 - i) / 12;
  const real = Math.round(nominal * Math.pow(1.03, yearsAgo));
  return { month, nominal, real, provisional: false };
});
