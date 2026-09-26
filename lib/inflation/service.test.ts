import assert from "node:assert/strict";
import { test } from "node:test";
import { getInflationAnalytics } from "./service.ts";
import { FredError } from "../fred/client.ts";

test("combines FRED observations, calculation results, and attribution", async () => {
  const result = await getInflationAnalytics({ startMonth: "2025-01", endMonth: "2025-03" }, {
    apiKey: "fake", fetchImpl: async () => Response.json({
      count: 4, offset: 0, observations: [
        { date: "2024-01-01", value: "200" }, { date: "2024-03-01", value: "200" },
        { date: "2025-01-01", value: "210" }, { date: "2025-03-01", value: "220" },
      ],
    }),
  });
  assert.equal(result.seriesId, "CPIAUCNS");
  assert.equal(result.seasonalAdjustment, "not-seasonally-adjusted");
  assert.equal(result.source, "U.S. Bureau of Labor Statistics via FRED");
  assert.equal(result.observations.length, 3);
  assert.ok(Math.abs(result.observations[0].yearOverYearPercent! - 5) < 1e-10);
  assert.ok(Math.abs(result.observations[2].yearOverYearPercent! - 10) < 1e-10);
  assert.equal(result.observations[1].cpi, null);
  assert.ok(Math.abs(result.cumulativeInflationPercent! - (220 / 210 - 1) * 100) < 1e-10);
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
  assert.equal(result.latestAvailableMonth, "2025-03");
});

test("missing selected end month stays missing even when earlier CPI exists", async () => {
  const result = await getInflationAnalytics({ startMonth: "2025-01", endMonth: "2025-02" }, {
    apiKey: "fake", fetchImpl: async () => Response.json({ count: 1, offset: 0,
      observations: [{ date: "2025-01-01", value: "200" }],
    }),
  });
  assert.equal(result.endMonth, "2025-02");
  assert.equal(result.latestAvailableMonth, "2025-01");
  assert.equal(result.cumulativeInflationPercent, null);
  assert.equal(result.observations[1].cpi, null);
});

test("provider failures remain errors, not successful empty results", async () => {
  await assert.rejects(getInflationAnalytics({ startMonth: "2025-01", endMonth: "2025-02" }, {
    apiKey: "fake", fetchImpl: async () => new Response("unavailable", { status: 503 }),
  }), (error: unknown) => error instanceof FredError && error.code === "FRED_REQUEST");
});
