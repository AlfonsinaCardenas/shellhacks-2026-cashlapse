// Pure planning for the macro_cpi sync: given what FRED returned and what's
// already stored, decide which rows to write and which values were revised.
// No I/O; cpi-store.ts executes the plan.
import { addMonths, type CpiLevel } from "./real-spending.ts";
import type { CpiObservation } from "./types.ts";

export type CpiUpsert = { month: string; cpi: number; provisional: boolean };
export type CpiRevision = { month: string; previous: number; current: number };

export type CpiSyncPlan = {
  upserts: CpiUpsert[];
  revisions: CpiRevision[]; // a released value FRED changed after we stored it
  latestReleased: string | null;
  provisionalMonths: string[]; // placeholders for months not yet published
};

// macro_cpi.cpi_index is NUMERIC(8,3); compare at that precision so float
// noise never shows up as a fake revision.
const to3 = (n: number) => Math.round(n * 1000) / 1000;

export function planCpiSync(
  observations: readonly CpiObservation[],
  existing: readonly CpiLevel[],
  currentMonth: string,
): CpiSyncPlan {
  const stored = new Map(existing.map((row) => [row.month, row]));
  const upserts: CpiUpsert[] = [];
  const revisions: CpiRevision[] = [];

  // Officially released months (FRED uses "." → null for unpublished ones).
  const released = observations
    .filter((o): o is { month: string; cpi: number } => o.cpi !== null && o.month <= currentMonth)
    .map((o) => ({ month: o.month, cpi: to3(o.cpi) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  for (const { month, cpi } of released) {
    const row = stored.get(month);
    if (!row || row.provisional) {
      // New month, or a placeholder now replaced by the real release.
      upserts.push({ month, cpi, provisional: false });
    } else if (to3(row.cpi) !== cpi) {
      // BLS rarely revises CPI-U NSA, but FRED can correct values; keep the
      // newest and report the change.
      upserts.push({ month, cpi, provisional: false });
      revisions.push({ month, previous: to3(row.cpi), current: cpi });
    }
  }

  const latest = released.at(-1) ?? null;
  const provisionalMonths: string[] = [];

  // Months after the latest release up to the current month aren't published
  // yet (e.g. September CPI comes out mid-October). Store the latest released
  // level as a provisional placeholder so reports for those months still have
  // a CPI, clearly flagged. The next sync after release overwrites it.
  if (latest) {
    for (let month = addMonths(latest.month, 1); month <= currentMonth; month = addMonths(month, 1)) {
      const row = stored.get(month);
      if (row && !row.provisional) continue; // never downgrade a released value
      provisionalMonths.push(month);
      if (!row || to3(row.cpi) !== latest.cpi) upserts.push({ month, cpi: latest.cpi, provisional: true });
    }
  }

  return { upserts, revisions, latestReleased: latest?.month ?? null, provisionalMonths };
}
