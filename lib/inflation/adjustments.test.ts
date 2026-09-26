import assert from "node:assert/strict";
import { test } from "node:test";
import { adjustAmountForInflation, adjustMonthlySpending } from "./adjustments.ts";

function closeTo(actual: number | null, expected: number): void {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-10,
    `Expected ${actual} to be close to ${expected}`);
}

test("adjusts dollars using the target/source ratio without rounding", () => {
  closeTo(adjustAmountForInflation(100, 200, 220), 110);
  closeTo(adjustAmountForInflation(150, 210, 220), 157.14285714285714);
});

test("handles deflation, unchanged prices, zero, and negative refunds", () => {
  closeTo(adjustAmountForInflation(100, 220, 200), 90.9090909090909);
  assert.equal(adjustAmountForInflation(123.45, 200, 200), 123.45);
  assert.equal(adjustAmountForInflation(0, 200, 220), 0);
  closeTo(adjustAmountForInflation(-100, 200, 220), -110);
});

test("invalid amounts or CPI produce unavailable adjustments, including zero with missing CPI", () => {
  for (const cpi of [null, undefined, 0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(adjustAmountForInflation(100, cpi, 220), null);
    assert.equal(adjustAmountForInflation(100, 200, cpi), null);
    assert.equal(adjustAmountForInflation(0, cpi, 220), null);
  }
  for (const amount of [null, undefined, NaN, Infinity, -Infinity]) {
    assert.equal(adjustAmountForInflation(amount, 200, 220), null);
  }
  assert.equal(adjustAmountForInflation(Number.MAX_VALUE, 1, 2), null);
  assert.equal(adjustAmountForInflation(1, Number.MIN_VALUE, Number.MAX_VALUE), null);
  assert.equal(adjustAmountForInflation(1, Number.MAX_VALUE, Number.MIN_VALUE), null);
});

test("matches by month, sorts output, and does not mutate inputs", () => {
  const spending = Object.freeze([
    Object.freeze({ month: "2024-02", nominal: 150 }),
    Object.freeze({ month: "2024-01", nominal: 100 }),
  ]);
  const cpi = Object.freeze([
    Object.freeze({ month: "2025-01", cpi: 220 }),
    Object.freeze({ month: "2024-01", cpi: 200 }),
    Object.freeze({ month: "2024-02", cpi: 210 }),
  ]);
  const result = adjustMonthlySpending(spending, cpi, "2025-01");
  assert.equal(result.targetMonth, "2025-01");
  assert.equal(result.targetCpi, 220);
  assert.deepEqual(result.spending.map(row => row.month), ["2024-01", "2024-02"]);
  assert.deepEqual(result.spending.map(row => row.nominal), [100, 150]);
  assert.deepEqual(result.spending.map(row => row.sourceCpi), [200, 210]);
  closeTo(result.spending[0].adjusted, 110);
  closeTo(result.spending[1].adjusted, 157.14285714285714);
  assert.equal(spending[0].month, "2024-02");
});

test("missing source CPI affects only that month and does not invent spending rows", () => {
  const result = adjustMonthlySpending([
    { month: "2024-01", nominal: 100 }, { month: "2024-03", nominal: 200 },
  ], [{ month: "2024-03", cpi: 200 }, { month: "2025-01", cpi: 220 }], "2025-01");
  assert.equal(result.spending.length, 2);
  assert.equal(result.spending[0].sourceCpi, null);
  assert.equal(result.spending[0].adjusted, null);
  closeTo(result.spending[1].adjusted, 220);
});

test("missing or invalid target CPI never falls back to a neighboring month", () => {
  for (const target of [[], [{ month: "2025-01", cpi: null }], [{ month: "2025-01", cpi: 0 }]]) {
    const result = adjustMonthlySpending([{ month: "2024-01", nominal: 100 }], [
      { month: "2024-01", cpi: 200 }, { month: "2024-12", cpi: 220 }, ...target,
    ], "2025-01");
    assert.equal(result.targetMonth, "2025-01");
    assert.equal(result.targetCpi, null);
    assert.equal(result.spending[0].adjusted, null);
  }
});

test("supports same-month and earlier target conversions without a year-ago requirement", () => {
  const cpi = [{ month: "0001-01", cpi: 200 }, { month: "0002-01", cpi: 220 }];
  const result = adjustMonthlySpending([
    { month: "0001-01", nominal: 100 }, { month: "0002-01", nominal: 110 },
  ], cpi, "0001-01");
  closeTo(result.spending[0].adjusted, 100);
  closeTo(result.spending[1].adjusted, 100);
});

test("empty spending still returns the explicit target metadata", () => {
  assert.deepEqual(adjustMonthlySpending([], [{ month: "2025-01", cpi: 220 }], "2025-01"), {
    targetMonth: "2025-01", targetCpi: 220, spending: [],
  });
});

test("rejects malformed months, duplicate rows, and non-finite spending", () => {
  for (const month of ["2024-1", "2024-13", "2024-01-01", "0000-01", "10000-01", ""]) {
    assert.throws(() => adjustMonthlySpending([], [], month), RangeError);
    assert.throws(() => adjustMonthlySpending([{ month, nominal: 1 }], [], "2025-01"), RangeError);
    assert.throws(() => adjustMonthlySpending([], [{ month, cpi: 200 }], "2025-01"), RangeError);
  }
  assert.throws(() => adjustMonthlySpending([
    { month: "2024-01", nominal: 100 }, { month: "2024-01", nominal: 200 },
  ], [], "2025-01"), /Duplicate spending month/);
  assert.throws(() => adjustMonthlySpending([], [
    { month: "2024-01", cpi: 200 }, { month: "2024-01", cpi: 210 },
  ], "2025-01"), /Duplicate CPI month/);
  for (const nominal of [NaN, Infinity, -Infinity]) {
    assert.throws(() => adjustMonthlySpending([{ month: "2024-01", nominal }], [], "2025-01"), RangeError);
  }
});
