import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateInflation, calculatePercentChange } from "./calculations.ts";

function closeTo(actual: number | null, expected: number): void {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-10,
    `Expected ${actual} to be close to ${expected}`);
}

test("calculates growth and deflation in percentage units without rounding", () => {
  closeTo(calculatePercentChange(200, 210), 5);
  closeTo(calculatePercentChange(200, 220), 10);
  closeTo(calculatePercentChange(200, 190), -5);
  closeTo(calculatePercentChange(300, 301), 1 / 3);
  assert.equal(calculatePercentChange(200, 200), 0);
});

test("invalid CPI levels and numeric overflow return null", () => {
  for (const invalid of [null, undefined, 0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(calculatePercentChange(invalid, 200), null);
    assert.equal(calculatePercentChange(200, invalid), null);
  }
  assert.equal(calculatePercentChange(Number.MIN_VALUE, Number.MAX_VALUE), null);
});

test("uses calendar matches, accepts unsorted input, and preserves the input", () => {
  const input = Object.freeze([
    Object.freeze({ month: "2025-03", cpi: 220 }),
    Object.freeze({ month: "2024-01", cpi: 200 }),
    Object.freeze({ month: "2025-01", cpi: 210 }),
    Object.freeze({ month: "2024-03", cpi: 200 }),
    Object.freeze({ month: "2026-01", cpi: 250 }),
  ]);
  const result = calculateInflation(input, { startMonth: "2025-01", endMonth: "2025-03" });
  assert.deepEqual(result.observations.map(row => row.month), ["2025-01", "2025-02", "2025-03"]);
  closeTo(result.observations[0].yearOverYearPercent, 5);
  closeTo(result.observations[2].yearOverYearPercent, 10);
  assert.deepEqual(result.observations[1], { month: "2025-02", cpi: null, yearOverYearPercent: null });
  closeTo(result.cumulativeInflationPercent, (220 / 210 - 1) * 100);
  assert.equal(result.latestAvailableMonth, "2025-03");
  assert.equal(input[0].month, "2025-03");
});

test("twelve unrelated rows do not substitute for a missing year-ago month", () => {
  const input = Array.from({ length: 12 }, (_, index) => ({
    month: `2023-${String(index + 1).padStart(2, "0")}`, cpi: 200,
  }));
  input.push({ month: "2025-01", cpi: 210 });
  const result = calculateInflation(input, { startMonth: "2025-01", endMonth: "2025-01" });
  assert.equal(result.observations[0].yearOverYearPercent, null);
});

test("missing endpoints are not replaced by neighboring observations", () => {
  const input = [{ month: "2025-02", cpi: 210 }];
  for (const range of [
    { startMonth: "2025-01", endMonth: "2025-02" },
    { startMonth: "2025-02", endMonth: "2025-03" },
  ]) {
    const result = calculateInflation(input, range);
    assert.equal(result.cumulativeInflationPercent, null);
    assert.equal(result.latestAvailableMonth, "2025-02");
    assert.equal(result.endMonth, range.endMonth);
  }
});

test("same-month periods return zero only with valid data", () => {
  const range = { startMonth: "2025-01", endMonth: "2025-01" };
  assert.equal(calculateInflation([{ month: "2025-01", cpi: 200 }], range).cumulativeInflationPercent, 0);
  for (const cpi of [null, 0, -1, NaN, Infinity]) {
    const result = calculateInflation([{ month: "2025-01", cpi }], range);
    assert.equal(result.cumulativeInflationPercent, null);
    assert.equal(result.observations[0].cpi, null);
    assert.equal(result.latestAvailableMonth, null);
  }
});

test("empty data produces an explicit missing row for every requested month", () => {
  const result = calculateInflation([], { startMonth: "2024-12", endMonth: "2025-02" });
  assert.deepEqual(result.observations, ["2024-12", "2025-01", "2025-02"].map(month => ({
    month, cpi: null, yearOverYearPercent: null,
  })));
  assert.equal(result.latestAvailableMonth, null);
  assert.equal(result.cumulativeInflationPercent, null);
});

test("rejects malformed dates and reversed ranges", () => {
  for (const month of ["2025-1", "2025-00", "2025-13", "0000-01", "10000-01", "2025-01-01", " 2025-01", ""]) {
    assert.throws(() => calculateInflation([], { startMonth: month, endMonth: "2025-01" }), RangeError);
    assert.throws(() => calculateInflation([], { startMonth: "2025-01", endMonth: month }), RangeError);
  }
  assert.throws(() => calculateInflation([], { startMonth: "2025-02", endMonth: "2025-01" }), RangeError);
  assert.throws(() => calculateInflation([], { startMonth: "0001-12", endMonth: "0002-01" }), RangeError);
});

test("handles supported boundary years without JavaScript Date normalization", () => {
  const result = calculateInflation([
    { month: "0001-01", cpi: 200 }, { month: "0002-01", cpi: 210 },
  ], { startMonth: "0002-01", endMonth: "0002-01" });
  closeTo(result.observations[0].yearOverYearPercent, 5);
  const last = calculateInflation([], { startMonth: "9999-12", endMonth: "9999-12" });
  assert.equal(last.observations[0].month, "9999-12");
});

test("rejects malformed observation months and duplicate months", () => {
  const range = { startMonth: "2025-01", endMonth: "2025-01" };
  assert.throws(() => calculateInflation([{ month: "2025-13", cpi: 200 }], range), RangeError);
  assert.throws(() => calculateInflation([
    { month: "2025-01", cpi: 200 }, { month: "2025-01", cpi: 210 },
  ], range), /Duplicate CPI month/);
});
