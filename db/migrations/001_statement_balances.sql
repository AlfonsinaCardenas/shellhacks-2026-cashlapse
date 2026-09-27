-- For databases created before these columns were added to db/schema.sql.
-- Safe to run more than once:
--   psql "$TIGER_DATABASE_URL" -f db/migrations/001_statement_balances.sql

ALTER TABLE statements ADD COLUMN IF NOT EXISTS account_identifier VARCHAR(16);
ALTER TABLE statements ADD COLUMN IF NOT EXISTS account_type VARCHAR(12)
  CHECK (account_type IN ('DEPOSIT','CREDIT_CARD'));
ALTER TABLE statements ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS starting_balance NUMERIC(12,2);
ALTER TABLE statements ADD COLUMN IF NOT EXISTS ending_balance NUMERIC(12,2);

-- Backfill statements that were already confirmed. Confirmed balances win
-- over what the AI extracted, same as the confirm route.
UPDATE statements SET
  account_identifier = NULLIF(extraction_payload #>> '{extraction,account_identifier}', ''),
  account_type       = extraction_payload #>> '{extraction,account_type}',
  period_start       = NULLIF(extraction_payload #>> '{extraction,start_date}', '')::date,
  period_end         = NULLIF(extraction_payload #>> '{extraction,end_date}', '')::date,
  starting_balance   = COALESCE(extraction_payload #>> '{confirmed,starting_balance}',
                                extraction_payload #>> '{extraction,starting_balance}')::numeric,
  ending_balance     = COALESCE(extraction_payload #>> '{confirmed,ending_balance}',
                                extraction_payload #>> '{extraction,ending_balance}')::numeric
WHERE status IN ('COMPLETED', 'NEEDS_VERIFICATION')
  AND extraction_payload ? 'confirmed'
  AND period_end IS NULL;
