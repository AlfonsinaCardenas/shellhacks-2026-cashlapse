import assert from "node:assert/strict";
import { test } from "node:test";
import { FredError, fetchCpiObservations } from "./client.ts";

const range = { startMonth: "2025-01", endMonth: "2025-02" };
const apiKey = "test-key-not-a-real-secret";
function response(observations: unknown[]) {
  return Response.json({ count: observations.length, offset: 0, observations });
}
function hasCode(code: string) {
  return (error: unknown) => error instanceof FredError && error.code === code &&
    !String(error).includes(apiKey) && error.cause === undefined;
}

test("requests fixed CPI levels with lookback and normalizes missing values", async () => {
  const result = await fetchCpiObservations(range, { apiKey, fetchImpl: async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.stlouisfed.org");
    assert.equal(url.searchParams.get("series_id"), "CPIAUCNS");
    assert.equal(url.searchParams.get("observation_start"), "2024-01-01");
    assert.equal(url.searchParams.get("observation_end"), "2025-02-28");
    assert.equal(url.searchParams.get("api_key"), apiKey);
    assert.equal(url.searchParams.get("units"), "lin");
    assert.equal(url.searchParams.get("file_type"), "json");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    return response([{ date: "2025-02-01", value: "." }, { date: "2024-01-01", value: "200.125" }]);
  } });
  assert.deepEqual(result.observations, [{ month: "2024-01", cpi: 200.125 }, { month: "2025-02", cpi: null }]);
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test("handles leap-year and century end dates", async () => {
  for (const [month, end] of [["2024-02", "2024-02-29"], ["2000-02", "2000-02-29"], ["1900-02", "1900-02-28"], ["2025-04", "2025-04-30"], ["2025-12", "2025-12-31"]]) {
    await fetchCpiObservations({ startMonth: month, endMonth: month }, { apiKey, fetchImpl: async input => {
      assert.equal(new URL(String(input)).searchParams.get("observation_end"), end);
      return response([]);
    } });
  }
});

test("rejects missing configuration and invalid ranges before network access", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls++; return response([]); };
  await assert.rejects(fetchCpiObservations(range, { apiKey: " ", fetchImpl }), hasCode("FRED_CONFIG"));
  await assert.rejects(fetchCpiObservations({ startMonth: "2025-13", endMonth: "2025-02" }, { apiKey, fetchImpl }), RangeError);
  await assert.rejects(fetchCpiObservations({ startMonth: "2025-03", endMonth: "2025-02" }, { apiKey, fetchImpl }), RangeError);
  await assert.rejects(fetchCpiObservations(range, { apiKey, fetchImpl, timeoutMs: 0 }), hasCode("FRED_CONFIG"));
  assert.equal(calls, 0);
});

test("rejects malformed, truncated, duplicate, and out-of-range provider data", async () => {
  const badPayloads = [null, {}, { observations: [] },
    { count: 2, offset: 0, observations: [{ date: "2025-01-01", value: "200" }] },
    { count: 0, offset: 1, observations: [] },
    ...["", "abc", "0", "-1", "NaN", "Infinity", "200junk"].map(value => ({
      count: 1, offset: 0, observations: [{ date: "2025-01-01", value }],
    })),
    ...["2025-13-01", "2025-01-02", "2023-12-01", "2025-03-01"].map(date => ({
      count: 1, offset: 0, observations: [{ date, value: "200" }],
    })),
    { count: 2, offset: 0, observations: Array(2).fill({ date: "2025-01-01", value: "200" }) },
  ];
  for (const payload of badPayloads) {
    await assert.rejects(fetchCpiObservations(range, { apiKey, fetchImpl: async () => Response.json(payload) }), hasCode("FRED_RESPONSE"));
  }
  await assert.rejects(fetchCpiObservations(range, { apiKey, fetchImpl: async () => new Response("not JSON") }), hasCode("FRED_RESPONSE"));
});

test("sanitizes HTTP and network errors without returning keys or response bodies", async () => {
  for (const status of [400, 403, 429, 500]) {
    await assert.rejects(fetchCpiObservations(range, { apiKey, fetchImpl: async () => new Response(apiKey, { status }) }), hasCode("FRED_REQUEST"));
  }
  await assert.rejects(fetchCpiObservations(range, { apiKey, fetchImpl: async () => { throw new Error(`URL contains ${apiKey}`); } }), hasCode("FRED_REQUEST"));
});

test("times out a stalled request", async () => {
  await assert.rejects(fetchCpiObservations(range, { apiKey, timeoutMs: 10,
    fetchImpl: async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error(apiKey)), { once: true });
    }),
  }), hasCode("FRED_TIMEOUT"));
});

test("timeout also covers reading the response body", async () => {
  await assert.rejects(fetchCpiObservations(range, { apiKey, timeoutMs: 10,
    fetchImpl: async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new Error(apiKey)), { once: true });
      },
    })),
  }), hasCode("FRED_TIMEOUT"));
});

test("dates before FRED coverage return no data without an invalid API request", async () => {
  const result = await fetchCpiObservations({ startMonth: "0002-01", endMonth: "0002-02" }, {
    apiKey, fetchImpl: async () => { throw new Error("Should not fetch"); },
  });
  assert.deepEqual(result.observations, []);
  await fetchCpiObservations({ startMonth: "1776-01", endMonth: "1777-01" }, {
    apiKey, fetchImpl: async input => {
      assert.equal(new URL(String(input)).searchParams.get("observation_start"), "1776-07-04");
      return response([]);
    },
  });
});
