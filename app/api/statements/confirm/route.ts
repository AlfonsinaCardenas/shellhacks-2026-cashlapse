import { pool } from "@/lib/tigerdata";
import { getSessionUserId } from "@/lib/session";
import { checkBalance, isUuid, type ApiError, type ConfirmResponse, type StoredPayload } from "@/lib/statement-types";

const error = (status: number, body: ApiError) => Response.json(body, { status });

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return error(401, { error: "Sign in to confirm statements." });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return error(400, { error: "Expected a JSON body." });
  }

  const statementId = body.statement_id;
  if (!isUuid(statementId)) {
    return error(400, { error: "statement_id is missing or invalid." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the row so two confirms can't interleave their ledger writes.
    const found = await client.query<{ extraction_payload: StoredPayload }>(
      "SELECT extraction_payload FROM statements WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [statementId, userId],
    );
    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return error(404, { error: "Statement not found." });
    }
    const payload = found.rows[0].extraction_payload;
    const extraction = payload.extraction;

    // Transactions aren't editable: save exactly what was extracted from the
    // PDF. Nothing from the request body besides the id is trusted.
    const transactions = extraction.transactions;
    const starting = extraction.starting_balance;
    const ending = extraction.ending_balance;

    // starting + credits - debits == ending (flipped for credit cards)
    const balance = checkBalance(extraction.account_type, starting, ending, transactions);
    const status = balance.matches ? "COMPLETED" : "NEEDS_VERIFICATION";

    const confirmed: StoredPayload = {
      ...payload,
      confirmed: {
        starting_balance: starting,
        ending_balance: ending,
        transactions,
        confirmed_at: new Date().toISOString(),
      },
    };
    // Balance columns feed the balance sheet (lib/queries.ts).
    await client.query(
      `UPDATE statements SET status = $1, extraction_payload = $2,
         account_identifier = NULLIF($4, ''), account_type = $5,
         period_start = NULLIF($6, '')::date, period_end = NULLIF($7, '')::date,
         starting_balance = $8, ending_balance = $9
       WHERE id = $3`,
      [
        status,
        confirmed,
        statementId,
        extraction.account_identifier,
        extraction.account_type,
        extraction.start_date,
        extraction.end_date,
        starting.toFixed(2),
        ending.toFixed(2),
      ],
    );

    // Same account, overlapping period: the ledger may now count some
    // transactions twice. Worth a log line; not worth blocking the user.
    const overlap = await client.query(
      `SELECT file_name FROM statements
       WHERE user_id = $1 AND id <> $2 AND bank_name = $3
         AND account_identifier IS NOT DISTINCT FROM NULLIF($4, '')
         AND status IN ('COMPLETED', 'NEEDS_VERIFICATION')
         AND period_start <= NULLIF($6, '')::date AND period_end >= NULLIF($5, '')::date`,
      [userId, statementId, extraction.bank_name, extraction.account_identifier, extraction.start_date, extraction.end_date],
    );
    if (overlap.rowCount) {
      console.warn(`[confirm] ${statementId} overlaps ${overlap.rows.map((r) => r.file_name).join(", ")}`);
    }

    // Replace this statement's ledger rows, so confirming again after a fix
    // doesn't double count. One UNNEST insert instead of N round trips.
    await client.query("DELETE FROM financial_ledger WHERE statement_id = $1 AND user_id = $2", [
      statementId,
      userId,
    ]);
    if (transactions.length) {
      await client.query(
        `INSERT INTO financial_ledger
           (transaction_time, user_id, statement_id, raw_description, clean_description,
            category, is_ai_tool, transaction_type, nominal_amount)
         SELECT t.time, $1, $2, t.raw, t.clean, t.category, t.ai, t.type, t.amount
         FROM UNNEST($3::timestamptz[], $4::text[], $5::text[], $6::text[], $7::boolean[], $8::text[], $9::numeric[])
           AS t(time, raw, clean, category, ai, type, amount)`,
        [
          userId,
          statementId,
          // midnight UTC so a transaction never shifts into another month
          transactions.map((t) => `${t.transaction_time}T00:00:00Z`),
          transactions.map((t) => t.raw_description),
          transactions.map((t) => t.clean_description),
          transactions.map((t) => t.category),
          transactions.map((t) => t.is_ai_tool),
          transactions.map((t) => t.transaction_type),
          transactions.map((t) => t.nominal_amount.toFixed(2)),
        ],
      );
    }

    await client.query("COMMIT");

    const response: ConfirmResponse = { statement_id: statementId, status, inserted: transactions.length, balance };
    return Response.json(response);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[confirm] failed", err);
    return error(500, { error: "Couldn't save to the ledger. Nothing was changed." });
  } finally {
    client.release();
  }
}
