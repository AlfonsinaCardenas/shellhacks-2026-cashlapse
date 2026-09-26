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

export const mockUser = {
  name: "Jane Doe",
  email: "jane@example.com",
};

export const mockStatements: Statement[] = [
  { id: "1", fileName: "Chase_Business_Jan_2026.pdf", bankName: "Chase", uploadedAt: "2026-01-31", status: "COMPLETED" },
  { id: "2", fileName: "BofA_Savings_Jan_2026.csv", bankName: "Bank of America", uploadedAt: "2026-01-31", status: "PROCESSING" },
  { id: "3", fileName: "Amex_December_2025.pdf", bankName: "American Express", uploadedAt: "2026-01-02", status: "NEEDS_VERIFICATION" },
  { id: "4", fileName: "WellsFargo_Nov_2025.pdf", bankName: "Wells Fargo", uploadedAt: "2025-12-03", status: "FAILED" },
];
