import { Pool } from "pg";
import { fetchPceObservations } from "../lib/bea/client.ts";

const connectionString = process.env.TIGER_DATABASE_URL;
if (!connectionString) throw new Error("TIGER_DATABASE_URL is not configured.");

const url = new URL(connectionString);
url.searchParams.delete("sslmode");

const pool = new Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  max: 5,
});

await pool.query(`
  CREATE TABLE IF NOT EXISTS macro_pce (
    year_month   VARCHAR(7) NOT NULL,
    category     VARCHAR(40) NOT NULL
                 CHECK (category IN ('groceries','gas','bills','travel','restaurants')),
    pce_index    NUMERIC(12,3) NOT NULL,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (year_month, category)
  )
`);

const rows = await fetchPceObservations();

for (const row of rows) {
  await pool.query(
    `INSERT INTO macro_pce (year_month, category, pce_index)
     VALUES ($1, $2, $3)
     ON CONFLICT (year_month, category)
     DO UPDATE SET pce_index = EXCLUDED.pce_index, updated_at = NOW()`,
    [row.month, row.category, row.index],
  );
}

const summary = await pool.query(`
  SELECT category, COUNT(*)::int AS months,
         MIN(year_month) AS first_month, MAX(year_month) AS last_month
  FROM macro_pce
  GROUP BY category
  ORDER BY category
`);

console.log(`saved ${rows.length} rows`);
console.log(summary.rows);
await pool.end();