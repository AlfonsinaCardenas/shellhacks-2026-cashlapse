import { beaPool } from "./db";

export type CategoryPrice = {
  category: "groceries" | "gas" | "bills" | "travel" | "restaurants";
  label: string;
  nominal: number;
  earlier: number;
  today: number;
  earlierLabel: string;
  latestLabel: string;
  rise: number;
};

const LABELS: Record<CategoryPrice["category"], string> = {
  groceries: "Groceries",
  gas: "Gas",
  bills: "Rent and utilities",
  travel: "Travel",
  restaurants: "Restaurants",
};

function indexMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const name = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${name} ${year}`;
}

// Restates statement spending at the earliest and latest BEA index for that
// category. Comparing those two levels is the price change over the series.
// A purchase month BEA has not published yet uses the latest index.
export async function statementCategoryPrices(userId: string): Promise<CategoryPrice[]> {
  const { rows } = await beaPool.query<{
    category: CategoryPrice["category"];
    nominal: string;
    earlier: string;
    today: string;
    earlier_month: string;
    latest_month: string;
  }>(`
    WITH mapped AS (
      SELECT
        CASE category
          WHEN 'Groceries' THEN 'groceries'
          WHEN 'Transportation' THEN 'gas'
          WHEN 'Rent & Utilities' THEN 'bills'
          WHEN 'Travel' THEN 'travel'
          WHEN 'Meals & Entertainment' THEN 'restaurants'
        END AS pce_category,
        nominal_amount,
        to_char(transaction_time AT TIME ZONE 'UTC', 'YYYY-MM') AS year_month
      FROM financial_ledger
      WHERE transaction_type = 'EXPENSE'
        AND user_id = $1
    ),
    latest AS (
      SELECT DISTINCT ON (category) category, year_month, pce_index
      FROM macro_pce
      ORDER BY category, year_month DESC
    ),
    earliest AS (
      SELECT DISTINCT ON (category) category, year_month, pce_index
      FROM macro_pce
      ORDER BY category, year_month ASC
    )
    SELECT
      m.pce_category AS category,
      ROUND(SUM(m.nominal_amount), 2) AS nominal,
      ROUND(SUM(m.nominal_amount * e.pce_index / COALESCE(p.pce_index, l.pce_index)), 2) AS earlier,
      ROUND(SUM(m.nominal_amount * l.pce_index / COALESCE(p.pce_index, l.pce_index)), 2) AS today,
      MIN(e.year_month) AS earlier_month,
      MIN(l.year_month) AS latest_month
    FROM mapped m
    JOIN latest l ON l.category = m.pce_category
    JOIN earliest e ON e.category = m.pce_category
    LEFT JOIN macro_pce p
      ON p.category = m.pce_category
     AND p.year_month = m.year_month
    WHERE m.pce_category IS NOT NULL
    GROUP BY m.pce_category
    ORDER BY m.pce_category
  `, [userId]);

  return rows.map((row) => {
    const nominal = Number(row.nominal);
    const earlier = Number(row.earlier);
    const today = Number(row.today);
    return {
      category: row.category,
      label: LABELS[row.category],
      nominal,
      earlier,
      today,
      earlierLabel: indexMonthLabel(row.earlier_month),
      latestLabel: indexMonthLabel(row.latest_month),
      rise: earlier > 0 ? Math.round(((today / earlier - 1) * 100) * 10) / 10 : 0,
    };
  });
}