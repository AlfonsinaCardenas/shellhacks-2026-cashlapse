import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMonths,
  buildMonthlyTrends,
  CpiTable,
  edgeGrowthPct,
  highestRealGrowthCategory,
  monthRange,
  purchasingPowerChange,
  round2OrNull,
  summarizeTrends,
  toRealAmount,
  yoyInflation,
} from "./real-spending.ts";

const table = new CpiTable([
  { month: "2025-08", cpi: 300, provisional: false },
  { month: "2025-09", cpi: 301, provisional: false },
  { month: "2026-07", cpi: 312, provisional: false },
  { month: "2026-08", cpi: 315, provisional: false },
  { month: "2026-09", cpi: 315, provisional: true }, // placeholder until mid-October
]);

test("month helpers cross year boundaries", () => {
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2025-12", 1), "2026-01");
  assert.deepEqual(monthRange("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("real = nominal × latest / month CPI, targeting the latest released month", () => {
  assert.equal(table.latest?.month, "2026-08"); // provisional Sept doesn't count as "today"
  assert.equal(toRealAmount(100, 300, 315), 105);
});

test("missing months borrow the latest earlier CPI and are flagged provisional", () => {
  assert.deepEqual(table.resolve("2026-08"), { cpi: 315, provisional: false });
  assert.deepEqual(table.resolve("2026-01"), { cpi: 301, provisional: true }); // gap
  assert.deepEqual(table.resolve("2026-12"), { cpi: 315, provisional: true }); // future
  assert.equal(table.resolve("2025-01"), null); // before any history
});

test("YoY inflation uses exact year-ago levels", () => {
  assert.equal(round2OrNull(yoyInflation(table, "2026-08").rate), 5); // (315 - 300) / 300
  assert.equal(yoyInflation(table, "2026-06").rate, null); // no 2025-06 level
});

test("purchasing power change is (real − nominal) / nominal", () => {
  assert.equal(purchasingPowerChange(100, 105), 5);
  assert.equal(purchasingPowerChange(0, 0), null);
  assert.equal(purchasingPowerChange(100, null), null);
});

test("monthly trends fill empty months and round to cents", () => {
  const spend = new Map([["2025-08", 100], ["2026-08", 33.333]]);
  const rows = buildMonthlyTrends(spend, table, "2025-08", "2025-09");
  assert.deepEqual(rows[0], {
    month: "2025-08",
    nominal_spend: 100,
    real_spend: 105,
    cpi_index: 300,
    inflation_rate_yoy: null,
    purchasing_power_change_pct: 5,
    cpi_provisional: false,
  });
  assert.equal(rows[1].nominal_spend, 0);
  assert.equal(rows[1].purchasing_power_change_pct, null);

  const summary = summarizeTrends(spend, table, "2025-08", "2026-08");
  assert.equal(summary.avg_monthly_nominal, 10.26); // 133.333 / 13
  assert.equal(summary.total_inflation_impact, 5);
});

test("edge growth averages up to 3 months on each end", () => {
  assert.equal(edgeGrowthPct([20, 20, 20, 25, 25, 25]), 25);
  assert.equal(edgeGrowthPct([20, 30]), 50);
  assert.equal(edgeGrowthPct([0, 0, 10]), null); // zero baseline
  assert.equal(edgeGrowthPct([5]), null);
});

test("highest real growth category ignores tiny baselines", () => {
  const top = highestRealGrowthCategory(
    new Map([
      ["Groceries", { prior: 4000, recent: 4600 }], // +15%
      ["Travel", { prior: 1000, recent: 1100 }], // +10%
      ["Snacks", { prior: 2, recent: 40 }], // below baseline
    ]),
  );
  assert.deepEqual(top, { category: "Groceries", growth_pct: 15 });
});
