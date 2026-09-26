// Shared between the API routes and the client components, so nothing here
// may import server-only code.

export const CATEGORIES = [
  "Revenue",
  "Payroll",
  "Software & SaaS",
  "AI Tools",
  "Advertising & Marketing",
  "Office & Supplies",
  "Rent & Utilities",
  "Professional Services",
  "Travel",
  "Meals & Entertainment",
  "Transportation",
  "Groceries",
  "Shopping",
  "Healthcare",
  "Insurance",
  "Bank Fees & Interest",
  "Taxes",
  "Owner Draws & Contributions",
  "Loan Payments",
  "Transfers",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type TransactionType = "INCOME" | "EXPENSE";

// DEPOSIT = checking/savings (balance is money you have).
// CREDIT_CARD = balance is money you owe, so the math runs the other way.
export type AccountType = "DEPOSIT" | "CREDIT_CARD";

export type ExtractedTransaction = {
  transaction_time: string; // YYYY-MM-DD
  raw_description: string;
  clean_description: string;
  category: Category;
  is_ai_tool: boolean;
  transaction_type: TransactionType; // INCOME = money into the account
  nominal_amount: number; // always positive
};

export type StatementExtraction = {
  bank_name: string;
  account_identifier: string; // last 4 only, e.g. "••1234"
  account_type: AccountType;
  start_date: string;
  end_date: string;
  starting_balance: number;
  ending_balance: number;
  transactions: ExtractedTransaction[];
};

export type RedactionKind =
  | "ACCOUNT_NUMBER"
  | "ROUTING_NUMBER"
  | "CARD_NUMBER"
  | "SSN"
  | "TAX_ID"
  | "PHONE"
  | "EMAIL"
  | "ADDRESS"
  | "NAME";

export type RedactionSummary = Partial<Record<RedactionKind, number>>;

// Shape of `statements.extraction_payload`.
export type StoredPayload = {
  extraction: StatementExtraction; // exactly what Gemini returned
  meta: { model: string; page_count: number; redactions: RedactionSummary };
  confirmed?: {
    starting_balance: number;
    ending_balance: number;
    transactions: ExtractedTransaction[];
    confirmed_at: string;
  };
};

export type UploadResponse = {
  statement_id: string;
  status: "NEEDS_REVIEW";
  extraction: StatementExtraction;
  sent_to_gemini: string;
  redactions: RedactionSummary;
};

export type ConfirmResponse = {
  statement_id: string;
  status: "COMPLETED" | "NEEDS_VERIFICATION";
  inserted: number;
  balance: BalanceCheck;
};

export type ApiError = {
  error: string;
  needsPassword?: boolean;
  incorrectPassword?: boolean;
  statement_id?: string; // set on 409 so the client can link to the existing upload
};

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// ---- Validation ------------------------------------------------------------
// Used on both Gemini's output and user-edited rows from the review screen.

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

// Accepts 12.5, "12.50", "$1,234.56", "(12.00)". Returns null if it isn't a number.
export function toAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const negative = /^\s*\(.*\)\s*$/.test(value) || value.includes("-");
  const n = Number(value.replace(/[^0-9.]/g, ""));
  if (value.trim() === "" || !Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function parseTransaction(input: unknown): Result<ExtractedTransaction> {
  if (!input || typeof input !== "object") return { ok: false, error: "not an object" };
  const t = input as Record<string, unknown>;

  if (!isValidDate(t.transaction_time)) return { ok: false, error: "date must be YYYY-MM-DD" };

  const amount = toAmount(t.nominal_amount);
  if (amount === null || amount === 0) return { ok: false, error: "amount must be a non-zero number" };
  if (Math.abs(amount) >= 1e10) return { ok: false, error: "amount is too large" };

  const raw = typeof t.raw_description === "string" ? t.raw_description.trim() : "";
  const clean = typeof t.clean_description === "string" ? t.clean_description.trim() : "";
  if (!raw && !clean) return { ok: false, error: "description is required" };

  const type = t.transaction_type === "INCOME" || t.transaction_type === "EXPENSE" ? t.transaction_type : null;
  if (!type) return { ok: false, error: "type must be INCOME or EXPENSE" };

  const category = (CATEGORIES as readonly string[]).includes(t.category as string) ? (t.category as Category) : "Other";

  return {
    ok: true,
    value: {
      transaction_time: t.transaction_time,
      raw_description: (raw || clean).slice(0, 500),
      clean_description: (clean || raw).slice(0, 200),
      category,
      is_ai_tool: t.is_ai_tool === true,
      transaction_type: type,
      nominal_amount: Math.round(Math.abs(amount) * 100) / 100,
    },
  };
}

// ---- Balance check ---------------------------------------------------------

export type BalanceCheck = {
  starting: number;
  credits: number; // sum of INCOME
  debits: number; // sum of EXPENSE
  expectedEnding: number;
  ending: number;
  difference: number; // ending - expectedEnding
  matches: boolean;
};

const toCents = (n: number) => Math.round(n * 100);

// Deposit:     starting + credits - debits == ending
// Credit card: starting + debits - credits == ending (charges raise what you owe)
// Done in integer cents so float drift never causes a false mismatch.
export function checkBalance(
  accountType: AccountType,
  starting: number,
  ending: number,
  transactions: Pick<ExtractedTransaction, "transaction_type" | "nominal_amount">[],
): BalanceCheck {
  let credits = 0;
  let debits = 0;
  for (const t of transactions) {
    if (t.transaction_type === "INCOME") credits += toCents(t.nominal_amount);
    else debits += toCents(t.nominal_amount);
  }
  const start = toCents(starting);
  const end = toCents(ending);
  const expected = accountType === "CREDIT_CARD" ? start + debits - credits : start + credits - debits;

  return {
    starting: start / 100,
    credits: credits / 100,
    debits: debits / 100,
    expectedEnding: expected / 100,
    ending: end / 100,
    difference: (end - expected) / 100,
    matches: end === expected,
  };
}
