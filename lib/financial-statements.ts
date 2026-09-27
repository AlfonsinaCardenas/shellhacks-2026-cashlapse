// Turns ledger totals into a cash-basis P&L and statement balances into a
// balance sheet. Pure and client-safe. Relative .ts imports so
// `node --test` can run it directly, like lib/inflation.
import type { AccountType, Category, TransactionType } from "./statement-types.ts";

export type PnlSection = "REVENUE" | "OPERATING" | "OTHER" | "TAXES" | "PERSONAL" | "EXCLUDED";

export const SECTION_BY_CATEGORY: Record<Category, PnlSection> = {
  Revenue: "REVENUE",
  Payroll: "OPERATING",
  "Software & SaaS": "OPERATING",
  "AI Tools": "OPERATING",
  "Advertising & Marketing": "OPERATING",
  "Office & Supplies": "OPERATING",
  "Rent & Utilities": "OPERATING",
  "Professional Services": "OPERATING",
  Travel: "OPERATING",
  "Meals & Entertainment": "OPERATING",
  Transportation: "OPERATING",
  Insurance: "OPERATING",
  Other: "OPERATING",
  "Bank Fees & Interest": "OTHER",
  Taxes: "TAXES",
  Groceries: "PERSONAL",
  Shopping: "PERSONAL",
  Healthcare: "PERSONAL",
  "Owner Draws & Contributions": "PERSONAL",
  // Money moving between the owner's accounts, or loan principal. Neither is
  // income or expense; counting them would double up card payments.
  Transfers: "EXCLUDED",
  "Loan Payments": "EXCLUDED",
};

export const SECTION_LABELS: Record<PnlSection, string> = {
  REVENUE: "Revenue",
  OPERATING: "Operating expenses",
  OTHER: "Other expense (income), net",
  TAXES: "Taxes",
  PERSONAL: "Personal spending & owner draws",
  EXCLUDED: "Excluded from P&L",
};

// Categories no longer in CATEGORIES (older rows) land in operating expenses.
export function sectionFor(category: string): PnlSection {
  return SECTION_BY_CATEGORY[category as Category] ?? "OPERATING";
}

// ---- P&L -------------------------------------------------------------------

export type PnlInputRow = {
  month?: string; // YYYY-MM, only needed for the monthly spend helpers
  category: string;
  transaction_type: TransactionType;
  is_ai_tool?: boolean;
  total: number; // positive sum of nominal_amount
};

export type PnlLine = { category: string; amount: number };

export type PnlSectionResult = {
  section: PnlSection;
  label: string;
  lines: PnlLine[];
  total: number;
};

export type Pnl = {
  revenue: PnlSectionResult;
  operating: PnlSectionResult;
  other: PnlSectionResult;
  taxes: PnlSectionResult;
  personal: PnlSectionResult;
  // Memo only: shown so the user can see what was left out and why.
  excluded: { category: string; moneyIn: number; moneyOut: number }[];
  operatingIncome: number; // revenue - operating
  netIncome: number; // business net income: operating income - other - taxes
  netAfterPersonal: number; // net income - personal spending & draws
  aiToolSpend: number; // every is_ai_tool charge, whatever its category
};

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

// Every line is netted in the section's natural direction: revenue lines are
// money in minus money out (chargebacks lower revenue), expense lines are money
// out minus money in (a refund lowers the expense it came from).
export function buildPnl(rows: readonly PnlInputRow[]): Pnl {
  const bySection = new Map<PnlSection, Map<string, number>>();
  const excluded = new Map<string, { in: number; out: number }>();
  let aiCents = 0;

  for (const row of rows) {
    const cents = toCents(row.total);
    const section = sectionFor(row.category);

    if (row.is_ai_tool) aiCents += row.transaction_type === "EXPENSE" ? cents : -cents;

    if (section === "EXCLUDED") {
      const e = excluded.get(row.category) ?? { in: 0, out: 0 };
      if (row.transaction_type === "INCOME") e.in += cents;
      else e.out += cents;
      excluded.set(row.category, e);
      continue;
    }

    const sign = (section === "REVENUE") === (row.transaction_type === "INCOME") ? 1 : -1;
    const lines = bySection.get(section) ?? new Map<string, number>();
    lines.set(row.category, (lines.get(row.category) ?? 0) + sign * cents);
    bySection.set(section, lines);
  }

  const build = (section: PnlSection): PnlSectionResult & { cents: number } => {
    const entries = [...(bySection.get(section) ?? new Map<string, number>())].filter(([, c]) => c !== 0);
    entries.sort((a, b) => b[1] - a[1]);
    const cents = entries.reduce((sum, [, c]) => sum + c, 0);
    return {
      section,
      label: SECTION_LABELS[section],
      lines: entries.map(([category, c]) => ({ category, amount: fromCents(c) })),
      total: fromCents(cents),
      cents,
    };
  };

  const revenue = build("REVENUE");
  const operating = build("OPERATING");
  const other = build("OTHER");
  const taxes = build("TAXES");
  const personal = build("PERSONAL");

  const operatingIncome = revenue.cents - operating.cents;
  const netIncome = operatingIncome - other.cents - taxes.cents;
  const strip = ({ cents: _cents, ...rest }: PnlSectionResult & { cents: number }) => rest; // eslint-disable-line @typescript-eslint/no-unused-vars

  return {
    revenue: strip(revenue),
    operating: strip(operating),
    other: strip(other),
    taxes: strip(taxes),
    personal: strip(personal),
    excluded: [...excluded].map(([category, e]) => ({
      category,
      moneyIn: fromCents(e.in),
      moneyOut: fromCents(e.out),
    })),
    operatingIncome: fromCents(operatingIncome),
    netIncome: fromCents(netIncome),
    netAfterPersonal: fromCents(netIncome - personal.cents),
    aiToolSpend: fromCents(aiCents),
  };
}

// Sections the Reports tab lets the user hide. "Excluded" is always a memo.
export const FILTERABLE_SECTIONS = ["REVENUE", "OPERATING", "OTHER", "TAXES", "PERSONAL"] as const;

// Hides sections and recomputes every subtotal from what's left, so the
// totals always describe exactly what's on screen. In cents, like buildPnl.
export function filterPnlSections(pnl: Pnl, visible: ReadonlySet<PnlSection>): Pnl {
  const keep = (s: PnlSectionResult): PnlSectionResult => (visible.has(s.section) ? s : { ...s, lines: [], total: 0 });
  const revenue = keep(pnl.revenue);
  const operating = keep(pnl.operating);
  const other = keep(pnl.other);
  const taxes = keep(pnl.taxes);
  const personal = keep(pnl.personal);

  const operatingIncome = toCents(revenue.total) - toCents(operating.total);
  const netIncome = operatingIncome - toCents(other.total) - toCents(taxes.total);

  return {
    ...pnl,
    revenue,
    operating,
    other,
    taxes,
    personal,
    operatingIncome: fromCents(operatingIncome),
    netIncome: fromCents(netIncome),
    netAfterPersonal: fromCents(netIncome - toCents(personal.total)),
  };
}

// Headline numbers for one month. `expenses` is the P&L's operating expenses
// (the "Operating Expenses" stat card); `spending` is the dashboard charts'
// broader spend: operating + personal, from monthlyDashboardSpend.
export type MonthlyTotals = { month: string; revenue: number; expenses: number; spending: number; netIncome: number };

// Operating expenses per month, the "spend" the inflation chart adjusts.
// Shape matches MonthlySpending in lib/inflation/types.ts.
export function monthlyOperatingSpend(rows: readonly PnlInputRow[]): { month: string; nominal: number }[] {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    if (!row.month || sectionFor(row.category) !== "OPERATING") continue;
    const cents = toCents(row.total) * (row.transaction_type === "EXPENSE" ? 1 : -1);
    byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + cents);
  }
  return [...byMonth]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cents]) => ({ month, nominal: fromCents(cents) }));
}

// Dashboard chart: operating expenses plus personal spending (groceries, shopping,
// healthcare). Transfers and loan payments stay out so card payments aren't spend.
export function monthlyDashboardSpend(rows: readonly PnlInputRow[]): { month: string; nominal: number }[] {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const section = sectionFor(row.category);
    if (!row.month || (section !== "OPERATING" && section !== "PERSONAL")) continue;
    const cents = toCents(row.total) * (row.transaction_type === "EXPENSE" ? 1 : -1);
    byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + cents);
  }
  return [...byMonth]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cents]) => ({ month, nominal: fromCents(cents) }));
}

// ---- Balance sheet ---------------------------------------------------------

export type AccountBalance = {
  bank_name: string;
  account_identifier: string;
  account_type: AccountType;
  ending_balance: number;
  as_of: string; // YYYY-MM-DD, the statement's period end
  needs_verification: boolean;
};

export type BalanceSheetLine = AccountBalance & { label: string; stale: boolean };

export type BalanceSheet = {
  asOf: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  totalAssets: number;
  totalLiabilities: number;
  equity: number; // assets - liabilities
};

// A statement closing more than this long before the report date is flagged:
// the balance is probably missing a newer statement.
const STALE_DAYS = 45;

export function accountLabel(a: Pick<AccountBalance, "bank_name" | "account_identifier" | "account_type">) {
  const kind = a.account_type === "CREDIT_CARD" ? "Card" : "Account";
  return `${a.bank_name} ${kind}${a.account_identifier ? ` ${a.account_identifier}` : ""}`;
}

// Deposit balances are assets. Card balances are what's owed, so liabilities
// (a negative card balance, i.e. a credit, stays there and reduces the total).
export function buildBalanceSheet(accounts: readonly AccountBalance[], asOf: string): BalanceSheet {
  const cutoff = new Date(`${asOf}T00:00:00Z`).getTime() - STALE_DAYS * 86_400_000;
  const lines = accounts.map((a) => ({
    ...a,
    label: accountLabel(a),
    stale: new Date(`${a.as_of}T00:00:00Z`).getTime() < cutoff,
  }));

  const assets = lines.filter((l) => l.account_type === "DEPOSIT");
  const liabilities = lines.filter((l) => l.account_type === "CREDIT_CARD");
  const sum = (ls: BalanceSheetLine[]) => ls.reduce((c, l) => c + toCents(l.ending_balance), 0);
  const assetCents = sum(assets);
  const liabilityCents = sum(liabilities);

  return {
    asOf,
    assets,
    liabilities,
    totalAssets: fromCents(assetCents),
    totalLiabilities: fromCents(liabilityCents),
    equity: fromCents(assetCents - liabilityCents),
  };
}
