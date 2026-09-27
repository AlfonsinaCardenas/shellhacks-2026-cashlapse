// Server-only: macro_cpi persistence. Reads CPI for reports and runs the
// daily FRED sync.
import "server-only";
import { fetchCpiObservations } from "../fred/client.ts";
import { pool } from "../tigerdata.ts";
import { planCpiSync, type CpiRevision } from "./cpi-sync.ts";
import { addMonths, CpiTable, type CpiLevel } from "./real-spending.ts";

/** Raised when reports run before the first sync has populated macro_cpi. */
export class CpiNotSyncedError extends Error {}

type CpiRow = { year_month: string; cpi_index: number; is_provisional: boolean };

async function loadLevels(): Promise<CpiLevel[]> {
  const { rows } = await pool.query<CpiRow>(
    "SELECT year_month, cpi_index::float8 AS cpi_index, is_provisional FROM macro_cpi ORDER BY year_month",
  );
  return rows.map((r) => ({ month: r.year_month, cpi: r.cpi_index, provisional: r.is_provisional }));
}

// The whole table is a few hundred rows at most, so load it once per request.
export async function loadCpiTable(): Promise<CpiTable> {
  const levels = await loadLevels();
  if (!levels.length) throw new CpiNotSyncedError("macro_cpi is empty; run /api/cron/sync-cpi first");
  return new CpiTable(levels);
}

export type CpiSyncResult = {
  fetched_months: number;
  written: number;
  revisions: CpiRevision[];
  latest_released: string | null;
  provisional_months: string[];
};

const SYNC_MONTHS = 36;

/**
 * Pulls the last 36 months of CPIAUCNS from FRED (the client adds 12 months of
 * lookback, which we also keep so the oldest month has a YoY comparison) and
 * upserts them into macro_cpi.
 */
export async function syncCpiFromFred(now = new Date()): Promise<CpiSyncResult> {
  const currentMonth = now.toISOString().slice(0, 7);
  const { observations } = await fetchCpiObservations({
    startMonth: addMonths(currentMonth, -(SYNC_MONTHS - 1)),
    endMonth: currentMonth,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize overlapping runs (a manual trigger during the cron) so both
    // don't plan against the same snapshot. Readers aren't blocked.
    await client.query("LOCK TABLE macro_cpi IN SHARE ROW EXCLUSIVE MODE");

    const { rows } = await client.query<CpiRow>(
      "SELECT year_month, cpi_index::float8 AS cpi_index, is_provisional FROM macro_cpi",
    );
    const existing = rows.map((r) => ({ month: r.year_month, cpi: r.cpi_index, provisional: r.is_provisional }));
    const plan = planCpiSync(observations, existing, currentMonth);

    if (plan.upserts.length) {
      await client.query(
        `INSERT INTO macro_cpi (year_month, cpi_index, is_provisional, updated_at)
         SELECT m, c, p, NOW() FROM UNNEST($1::varchar[], $2::numeric[], $3::boolean[]) AS t(m, c, p)
         ON CONFLICT (year_month) DO UPDATE
           SET cpi_index = EXCLUDED.cpi_index, is_provisional = EXCLUDED.is_provisional, updated_at = NOW()
           -- a released value is never replaced by a provisional placeholder
           WHERE macro_cpi.is_provisional OR NOT EXCLUDED.is_provisional`,
        [
          plan.upserts.map((u) => u.month),
          plan.upserts.map((u) => u.cpi.toFixed(3)),
          plan.upserts.map((u) => u.provisional),
        ],
      );
    }
    await client.query("COMMIT");

    for (const r of plan.revisions) {
      console.warn(`[cpi-sync] revision ${r.month}: ${r.previous} -> ${r.current}`);
    }

    return {
      fetched_months: observations.length,
      written: plan.upserts.length,
      revisions: plan.revisions,
      latest_released: plan.latestReleased,
      provisional_months: plan.provisionalMonths,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
