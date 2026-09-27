import assert from "node:assert/strict";
import { test } from "node:test";
import { planCpiSync } from "./cpi-sync.ts";

test("first sync inserts released months and a provisional placeholder for the current month", () => {
  const plan = planCpiSync(
    [
      { month: "2026-07", cpi: 320.5801 },
      { month: "2026-08", cpi: 321.2 },
      { month: "2026-09", cpi: null }, // not published yet
    ],
    [],
    "2026-09",
  );
  assert.equal(plan.latestReleased, "2026-08");
  assert.deepEqual(plan.provisionalMonths, ["2026-09"]);
  assert.deepEqual(plan.upserts, [
    { month: "2026-07", cpi: 320.58, provisional: false },
    { month: "2026-08", cpi: 321.2, provisional: false },
    { month: "2026-09", cpi: 321.2, provisional: true },
  ]);
  assert.deepEqual(plan.revisions, []);
});

test("unchanged data writes nothing", () => {
  const plan = planCpiSync(
    [{ month: "2026-08", cpi: 321.2 }],
    [
      { month: "2026-08", cpi: 321.2, provisional: false },
      { month: "2026-09", cpi: 321.2, provisional: true },
    ],
    "2026-09",
  );
  assert.deepEqual(plan.upserts, []);
});

test("a release replaces its placeholder without counting as a revision", () => {
  const plan = planCpiSync(
    [{ month: "2026-09", cpi: 322 }],
    [{ month: "2026-09", cpi: 321.2, provisional: true }],
    "2026-10",
  );
  assert.deepEqual(plan.revisions, []);
  assert.deepEqual(plan.upserts, [
    { month: "2026-09", cpi: 322, provisional: false },
    { month: "2026-10", cpi: 322, provisional: true },
  ]);
});

test("a changed released value is upserted and reported as a revision", () => {
  const plan = planCpiSync(
    [{ month: "2026-05", cpi: 319.9 }],
    [{ month: "2026-05", cpi: 319.8, provisional: false }],
    "2026-05",
  );
  assert.deepEqual(plan.revisions, [{ month: "2026-05", previous: 319.8, current: 319.9 }]);
  assert.equal(plan.upserts.length, 1);
});

test("float noise below NUMERIC(8,3) precision is not a revision", () => {
  const plan = planCpiSync(
    [{ month: "2026-05", cpi: 319.8000004 }],
    [{ month: "2026-05", cpi: 319.8, provisional: false }],
    "2026-05",
  );
  assert.deepEqual(plan.upserts, []);
});

test("mid-series gaps are left alone; placeholders only follow the latest release", () => {
  const plan = planCpiSync(
    [
      { month: "2025-09", cpi: 310 },
      { month: "2025-10", cpi: null }, // shutdown gap
      { month: "2025-11", cpi: 311 },
    ],
    [],
    "2025-11",
  );
  assert.deepEqual(plan.upserts.map((u) => u.month), ["2025-09", "2025-11"]);
  assert.deepEqual(plan.provisionalMonths, []);
});
