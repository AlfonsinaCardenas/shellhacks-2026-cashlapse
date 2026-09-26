import assert from "node:assert/strict";
import { test } from "node:test";
import { FredError } from "../fred/client.ts";
import { getAdjustedMonthlySpending } from "./spending-service.ts";

function provider(rows: Array<{ date: string; value: string }>) {
  return Response.json({ count: rows.length, offset: 0, observations: rows });
}

test("spending service fetches CPI once and adjusts monthly amounts with attribution", async () => {
  let calls = 0;
  const result = await getAdjustedMonthlySpending([
    { month: "2024-02", nominal: 150 }, { month: "2024-01", nominal: 100 },
  ], "2025-01", { apiKey: "fake", fetchImpl: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("observation_start"), "2023-01-01");
    assert.equal(url.searchParams.get("observation_end"), "2025-01-31");
    assert.equal(url.searchParams.has("nominal"), false);
    assert.equal(init?.body, undefined);
    return provider([
      { date: "2024-01-01", value: "200" }, { date: "2024-02-01", value: "210" },
      { date: "2025-01-01", value: "220" },
    ]);
  } });
  assert.equal(calls, 1);
  assert.equal(result.targetMonth, "2025-01");
  assert.equal(result.targetCpi, 220);
  assert.equal(result.seriesId, "CPIAUCNS");
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
  assert.ok(Math.abs(result.spending[0].adjusted! - 110) < 1e-10);
  assert.ok(Math.abs(result.spending[1].adjusted! - 157.14285714285714) < 1e-10);
});

test("spending service supports targets earlier than the spending period", async () => {
  const result = await getAdjustedMonthlySpending([{ month: "2025-01", nominal: 110 }], "2024-01", {
    apiKey: "fake", fetchImpl: async input => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("observation_start"), "2023-01-01");
      assert.equal(url.searchParams.get("observation_end"), "2025-01-31");
      return provider([{ date: "2024-01-01", value: "200" }, { date: "2025-01-01", value: "220" }]);
    },
  });
  assert.equal(result.spending[0].adjusted, 100);
});

test("spending service leaves unavailable source or target CPI explicit", async () => {
  const spending = [{ month: "2024-01", nominal: 100 }];
  const missingSource = await getAdjustedMonthlySpending(spending, "2025-01", {
    apiKey: "fake", fetchImpl: async () => provider([{ date: "2025-01-01", value: "220" }]),
  });
  assert.equal(missingSource.targetCpi, 220);
  assert.equal(missingSource.spending[0].adjusted, null);
  const missingTarget = await getAdjustedMonthlySpending(spending, "2025-01", {
    apiKey: "fake", fetchImpl: async () => provider([{ date: "2024-01-01", value: "200" }]),
  });
  assert.equal(missingTarget.targetMonth, "2025-01");
  assert.equal(missingTarget.targetCpi, null);
  assert.equal(missingTarget.spending[0].adjusted, null);
});

test("spending service rejects invalid monthly data before provider access", async () => {
  let calls = 0;
  const options = { apiKey: "fake", fetchImpl: async () => { calls++; return provider([]); } };
  for (const input of [
    [{ month: "2024-13", nominal: 100 }],
    [{ month: "2024-01", nominal: NaN }],
    [{ month: "2024-01", nominal: 1 }, { month: "2024-01", nominal: 2 }],
  ]) await assert.rejects(getAdjustedMonthlySpending(input, "2025-01", options), RangeError);
  await assert.rejects(getAdjustedMonthlySpending([], "bad", options), RangeError);
  assert.equal(calls, 0);
});

test("spending service propagates provider failures instead of returning fake adjustments", async () => {
  await assert.rejects(getAdjustedMonthlySpending([{ month: "2024-01", nominal: 100 }], "2025-01", {
    apiKey: "fake", fetchImpl: async () => new Response("offline", { status: 503 }),
  }), (error: unknown) => error instanceof FredError && error.code === "FRED_REQUEST");
});

test("spending service snapshots caller data and handles an empty spending list", async () => {
  const input = [{ month: "2024-01", nominal: 100 }];
  const result = await getAdjustedMonthlySpending(input, "2025-01", {
    apiKey: "fake", fetchImpl: async () => {
      input[0].nominal = 999;
      return provider([{ date: "2024-01-01", value: "200" }, { date: "2025-01-01", value: "220" }]);
    },
  });
  assert.equal(result.spending[0].nominal, 100);
  const empty = await getAdjustedMonthlySpending([], "2025-01", {
    apiKey: "fake", fetchImpl: async () => provider([{ date: "2025-01-01", value: "220" }]),
  });
  assert.deepEqual(empty.spending, []);
  assert.equal(empty.targetCpi, 220);
});
