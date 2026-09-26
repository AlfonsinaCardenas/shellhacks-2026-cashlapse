import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBalanceSheet, buildPnl, monthlyOperatingSpend, type AccountBalance } from "./financial-statements.ts";

test("a card payment (both sides Transfers) doesn't change net income", () => {
  const base = [
    { category: "Revenue", transaction_type: "INCOME" as const, total: 3000 },
    { category: "Software & SaaS", transaction_type: "EXPENSE" as const, total: 500 },
  ];
  const withPayment = [
    ...base,
    { category: "Transfers", transaction_type: "EXPENSE" as const, total: 500 }, // out of checking
    { category: "Transfers", transaction_type: "INCOME" as const, total: 500 }, // into the card
  ];
  const a = buildPnl(base);
  const b = buildPnl(withPayment);
  assert.equal(b.netIncome, a.netIncome);
  assert.equal(b.revenue.total, 3000);
  assert.equal(b.operating.total, 500);
  assert.deepEqual(b.excluded, [{ category: "Transfers", moneyIn: 500, moneyOut: 500 }]);
});

test("a refund lowers its expense category instead of counting as revenue", () => {
  const pnl = buildPnl([
    { category: "Revenue", transaction_type: "INCOME", total: 1000 },
    { category: "Travel", transaction_type: "EXPENSE", total: 400 },
    { category: "Travel", transaction_type: "INCOME", total: 150 },
  ]);
  assert.equal(pnl.revenue.total, 1000);
  assert.deepEqual(pnl.operating.lines, [{ category: "Travel", amount: 250 }]);
  assert.equal(pnl.netIncome, 750);
});

test("personal spending sits below business net income", () => {
  const pnl = buildPnl([
    { category: "Revenue", transaction_type: "INCOME", total: 5000 },
    { category: "Payroll", transaction_type: "EXPENSE", total: 2000 },
    { category: "Bank Fees & Interest", transaction_type: "EXPENSE", total: 25 },
    { category: "Taxes", transaction_type: "EXPENSE", total: 475 },
    { category: "Groceries", transaction_type: "EXPENSE", total: 300 },
    { category: "Owner Draws & Contributions", transaction_type: "EXPENSE", total: 1000 },
  ]);
  assert.equal(pnl.operatingIncome, 3000);
  assert.equal(pnl.netIncome, 2500);
  assert.equal(pnl.personal.total, 1300);
  assert.equal(pnl.netAfterPersonal, 1200);
});

test("sums in cents, tracks AI tool spend, and files unknown categories as operating", () => {
  const pnl = buildPnl([
    { category: "Revenue", transaction_type: "INCOME", total: 0.1 },
    { category: "Revenue", transaction_type: "INCOME", total: 0.2 },
    { category: "AI Tools", transaction_type: "EXPENSE", total: 20, is_ai_tool: true },
    { category: "Software & SaaS", transaction_type: "EXPENSE", total: 10, is_ai_tool: true },
    { category: "Retired Category", transaction_type: "EXPENSE", total: 1 },
  ]);
  assert.equal(pnl.revenue.total, 0.3);
  assert.equal(pnl.aiToolSpend, 30);
  assert.equal(pnl.operating.total, 31);
});

test("monthly operating spend nets refunds and skips other sections", () => {
  const spend = monthlyOperatingSpend([
    { month: "2026-02", category: "Travel", transaction_type: "EXPENSE", total: 100 },
    { month: "2026-01", category: "Travel", transaction_type: "EXPENSE", total: 100 },
    { month: "2026-01", category: "Travel", transaction_type: "INCOME", total: 40 },
    { month: "2026-01", category: "Groceries", transaction_type: "EXPENSE", total: 999 },
    { month: "2026-01", category: "Transfers", transaction_type: "EXPENSE", total: 999 },
  ]);
  assert.deepEqual(spend, [
    { month: "2026-01", nominal: 60 },
    { month: "2026-02", nominal: 100 },
  ]);
});

test("balance sheet: deposits are assets, cards are liabilities, equity is the difference", () => {
  const accounts: AccountBalance[] = [
    { bank_name: "Chase", account_identifier: "••1234", account_type: "DEPOSIT", ending_balance: 6339.01, as_of: "2026-01-31", needs_verification: false },
    { bank_name: "Ally", account_identifier: "••9999", account_type: "DEPOSIT", ending_balance: 10000.1, as_of: "2025-10-31", needs_verification: false },
    { bank_name: "Amex", account_identifier: "••1001", account_type: "CREDIT_CARD", ending_balance: 1200.2, as_of: "2026-01-28", needs_verification: true },
  ];
  const sheet = buildBalanceSheet(accounts, "2026-01-31");
  assert.equal(sheet.totalAssets, 16339.11);
  assert.equal(sheet.totalLiabilities, 1200.2);
  assert.equal(sheet.equity, 15138.91);
  assert.equal(sheet.assets.find((a) => a.bank_name === "Ally")?.stale, true);
  assert.equal(sheet.assets.find((a) => a.bank_name === "Chase")?.stale, false);
  assert.equal(sheet.liabilities[0].label, "Amex Card ••1001");
});
