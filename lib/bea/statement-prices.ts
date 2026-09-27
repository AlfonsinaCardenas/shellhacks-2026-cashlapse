import { beaPool } from "./db";

export type CategoryPrice = {
  category: "groceries" | "gas" | "bills" | "travel" | "restaurants";
  label: string;
  nominal: number;
  today: number;
  rise: number;
};

const LABELS: Record<CategoryPrice["category"], string> = {
  groceries: "Groceries",
  gas: "Gas",
  bills: "Rent and utilities",
  travel: "Travel",
  restaurants: "Restaurants",
};

export async function statementCategoryPrices(userId: string): Promise<CategoryPrice[]> {
    const { rows } = await beaPool.query<{
      category: CategoryPrice["category"];
      nominal: string;
      today: string;
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
      SELECT DISTINCT ON (category) category, pce_index
      FROM macro_pce
      ORDER BY category, year_month DESC
    )
    SELECT
      m.pce_category AS category,
      ROUND(SUM(m.nominal_amount), 2) AS nominal,
      ROUND(SUM(m.nominal_amount * l.pce_index / p.pce_index), 2) AS today
    FROM mapped m
    JOIN macro_pce p
      ON p.category = m.pce_category
     AND p.year_month = m.year_month
    JOIN latest l ON l.category = m.pce_category
    WHERE m.pce_category IS NOT NULL
    GROUP BY m.pce_category
    ORDER BY m.pce_category
  `, [userId]);

  return rows.map((row) => {
    const nominal = Number(row.nominal);
    const today = Number(row.today);
    return {
      category: row.category,
      label: LABELS[row.category],
      nominal,
      today,
      rise: nominal > 0 ? Math.round(((today / nominal - 1) * 100) * 10) / 10 : 0,
    };
  });
}