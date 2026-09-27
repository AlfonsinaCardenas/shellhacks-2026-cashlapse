import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDashboardPoints, indexSinceStart } from "./dashboard-series.ts";
import { CpiTable } from "./inflation/real-spending.ts";

const cpi = new CpiTable([
  { month: "2026-01", cpi: 300, provisional: false },
  { month: "2026-02", cpi: 303, provisional: false },
  { month: "2026-03", cpi: 306, provisional: false },
  { month: "2026-04", cpi: 306, provisional: true }, // placeholder until release
]);

const monthly = [
  { month: "2026-01", revenue: 1000, expenses: 600, spending: 600, netIncome: 400 },
  { month: "2026-03", revenue: 1300, expenses: 612, spending: 612, netIncome: 688 },
];

test("fills every month and restates amounts in the latest released month's dollars", () => {
  const points = buildDashboardPoints(monthly, cpi, "2025-12", "2026-04");
  assert.deepEqual(
    points.map((p) => p.month),
    ["2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"],
  );
  // Before stored history: nominal only.
  assert.equal(points[0].incomeReal, null);
  // Jan: 1000 × 306 / 300
  assert.equal(points[1].incomeReal, 1020);
  assert.equal(points[1].expensesReal, 612);
  // Feb had no transactions.
  assert.equal(points[2].income, 0);
  // Mar is the target month, so real = nominal.
  assert.equal(points[3].incomeReal, 1300);
  // Apr CPI isn't published yet.
  assert.equal(points[4].cpiProvisional, true);
  assert.equal(points[3].cpiProvisional, false);
});

test("without CPI the points are nominal only", () => {
  const points = buildDashboardPoints(monthly, null, "2026-01", "2026-01");
  assert.equal(points[0].income, 1000);
  assert.equal(points[0].incomeReal, null);
  assert.equal(points[0].cpi, null);
});

test("short ranges compare each month with the first, starting every line at 0%", () => {
  const points = buildDashboardPoints(
    [
      { month: "2026-01", revenue: 100, expenses: 50, spending: 50, netIncome: 50 },
      { month: "2026-02", revenue: 100, expenses: 50, spending: 50, netIncome: 50 },
      { month: "2026-03", revenue: 100, expenses: 50, spending: 50, netIncome: 50 },
      { month: "2026-04", revenue: 160, expenses: 40, spending: 40, netIncome: 120 },
    ],
    cpi,
    "2026-01",
    "2026-04",
  );
  const indexed = indexSinceStart(points);
  assert.deepEqual([indexed[0].income, indexed[0].expenses, indexed[0].cpi], [0, 0, 0]);
  assert.equal(indexed[3].income, 60);
  assert.equal(indexed[3].expenses, -20);
  assert.equal(indexed[3].cpi, 2); // 306 / 300 − 1
  assert.equal(indexed[3].cpiProvisional, true);
});

test("6+ months use a 3-month average for all three lines, starting at the first full window", () => {
  const long = new CpiTable(
    ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map((month, i) => ({
      month,
      cpi: 300 + i * 3,
      provisional: false,
    })),
  );
  const revenue = [90, 100, 110, 100, 130, 130];
  const points = buildDashboardPoints(
    revenue.map((r, i) => ({ month: `2026-0${i + 1}`, revenue: r, expenses: 50, spending: 50, netIncome: r - 50 })),
    long,
    "2026-01",
    "2026-06",
  );
  const indexed = indexSinceStart(points);
  assert.equal(indexed[0].income, null); // no full window yet
  assert.equal(indexed[1].cpi, null);
  assert.deepEqual([indexed[2].income, indexed[2].expenses, indexed[2].cpi], [0, 0, 0]);
  assert.equal(indexed[5].income, 20); // avg(100,130,130) = 120 vs avg(90,100,110) = 100
  assert.equal(indexed[5].cpi, 2.97); // avg(309,312,315) = 312 vs avg(300,303,306) = 303
});

test("a zero baseline gives null instead of a fake percentage", () => {
  const points = buildDashboardPoints(
    [{ month: "2026-03", revenue: 0, expenses: 80, spending: 80, netIncome: -80 }],
    cpi,
    "2026-03",
    "2026-03",
  );
  const [only] = indexSinceStart(points);
  assert.equal(only.income, null);
  assert.equal(only.expenses, 0);
  assert.deepEqual(indexSinceStart([]), []);
});

test("chart expenses use dashboard spend (operating + personal), not operating-only", () => {
  const [point] = buildDashboardPoints(
    [{ month: "2026-03", revenue: 500, expenses: 200, spending: 260, netIncome: 300 }],
    cpi,
    "2026-03",
    "2026-03",
  );
  assert.equal(point.expenses, 260);
  assert.equal(point.expensesReal, 260); // March is the CPI target month
});
