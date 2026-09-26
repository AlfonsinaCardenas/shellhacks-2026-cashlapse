-- App tables. Source of truth for the schema. Run with `npm run db:setup`
-- (runs db/authjs.sql first). Each statement runs on its own because
-- continuous aggregates can't be created inside a transaction.

CREATE TABLE statements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             VARCHAR(64) NOT NULL,
  file_name           TEXT NOT NULL,
  r2_key              TEXT NOT NULL,
  file_hash           CHAR(64) NOT NULL,
  bank_name           TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                      CHECK (status IN ('PROCESSING','NEEDS_REVIEW','NEEDS_VERIFICATION','COMPLETED','FAILED')),
  sent_to_gemini      TEXT,
  extraction_payload  JSONB,
  -- Filled in on confirm; the balance sheet reads these.
  account_identifier  VARCHAR(16),
  account_type        VARCHAR(12) CHECK (account_type IN ('DEPOSIT','CREDIT_CARD')),
  period_start        DATE,
  period_end          DATE,
  starting_balance    NUMERIC(12,2),
  ending_balance      NUMERIC(12,2),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, file_hash)
);

CREATE TABLE financial_ledger (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  transaction_time    TIMESTAMPTZ NOT NULL,
  user_id             VARCHAR(64) NOT NULL,
  statement_id        UUID NOT NULL,
  raw_description     TEXT NOT NULL,
  clean_description   TEXT NOT NULL,
  category            VARCHAR(50) NOT NULL,
  is_ai_tool          BOOLEAN NOT NULL DEFAULT FALSE,
  transaction_type    VARCHAR(10) NOT NULL CHECK (transaction_type IN ('INCOME','EXPENSE')),
  nominal_amount      NUMERIC(12,2) NOT NULL,
  PRIMARY KEY (id, transaction_time)
);
SELECT create_hypertable('financial_ledger', 'transaction_time');
CREATE INDEX idx_ledger_user_time ON financial_ledger (user_id, transaction_time DESC);

CREATE TABLE macro_cpi (
  year_month      VARCHAR(7) PRIMARY KEY,
  cpi_index       NUMERIC(8,3) NOT NULL,
  is_provisional  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE MATERIALIZED VIEW monthly_pnl
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('1 month', transaction_time) AS month,
       user_id, category, transaction_type, is_ai_tool,
       SUM(nominal_amount) AS total_nominal, COUNT(*) AS tx_count
FROM financial_ledger
GROUP BY month, user_id, category, transaction_type, is_ai_tool;

SELECT add_continuous_aggregate_policy('monthly_pnl',
  start_offset => INTERVAL '3 years', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes');
