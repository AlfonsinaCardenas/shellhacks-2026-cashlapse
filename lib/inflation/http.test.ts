import assert from "node:assert/strict";
import { test } from "node:test";
import { handleInflationRequest } from "./http.ts";
import { FredError } from "../fred/client.ts";
import { CPI_SERIES } from "./series.ts";
import { GET, runtime } from "../../app/api/inflation/route.ts";

const request = (query: string) => new Request(`http://localhost/api/inflation${query}`);
const valid = "?startMonth=2024-01&endMonth=2025-01";

test("HTTP returns the service result as uncached JSON", async () => {
  const data = { ...CPI_SERIES, startMonth: "2024-01", endMonth: "2025-01",
    observations: [], latestAvailableMonth: null, cumulativeInflationPercent: null,
    fetchedAt: "2026-09-26T00:00:00.000Z",
  };
  const response = await handleInflationRequest(request(valid), async range => {
    assert.deepEqual(range, { startMonth: "2024-01", endMonth: "2025-01" });
    return data;
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(response.headers.get("Content-Type")!, /application\/json/);
  assert.deepEqual(await response.json(), data);
});

test("HTTP rejects missing, repeated, malformed, and reversed dates before fetching", async () => {
  let calls = 0;
  for (const query of ["", "?startMonth=2024-01", "?endMonth=2025-01",
    "?startMonth=&endMonth=2025-01", "?startMonth=2024-13&endMonth=2025-01",
    "?startMonth=2026-01&endMonth=2025-01", "?startMonth=0001-01&endMonth=2025-01",
    `${valid}&startMonth=2024-01`, `${valid}&endMonth=2025-01`,
  ]) {
    const response = await handleInflationRequest(request(query), async () => { calls++; throw new Error("unexpected fetch"); });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_RANGE");
  }
  assert.equal(calls, 0);
});

test("HTTP maps failures to stable statuses without exposing internal messages", async () => {
  const secret = "private-provider-url-and-key";
  const cases = [
    [new FredError("FRED_CONFIG", secret), 500, "FRED_CONFIG"],
    [new FredError("FRED_REQUEST", secret), 502, "FRED_REQUEST"],
    [new FredError("FRED_RESPONSE", secret), 502, "FRED_RESPONSE"],
    [new FredError("FRED_TIMEOUT", secret), 504, "FRED_TIMEOUT"],
    [new Error(secret), 500, "INTERNAL_ERROR"],
  ] as const;
  for (const [error, status, code] of cases) {
    const response = await handleInflationRequest(request(valid), async () => { throw error; });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.ok(!JSON.stringify(body).includes(secret));
  }
});

test("Next.js GET route uses the adapter and Node runtime", async () => {
  assert.equal(runtime, "nodejs");
  const response = await GET(request(""));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_RANGE");
});
