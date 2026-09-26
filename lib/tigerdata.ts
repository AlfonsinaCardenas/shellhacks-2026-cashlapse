import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

// Server-only: never import this from a client component.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

// Tiger signs its certificates with its own CA (ca.timescale.com), which Node doesn't
// trust by default. Trust that CA so the connection is encrypted AND verified.
// Public certificate, not a secret. Expires Oct 2027.
const timescaleCa = readFileSync(path.join(process.cwd(), "certs", "timescale-ca.pem"), "utf8");

// TIGER_DATABASE_URL includes ?sslmode=require (psql needs it). pg lets sslmode in the
// URL override the ssl option below, so drop it here.
function withoutSslMode(url: string | undefined): string | undefined {
  if (!url) return url;
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: withoutSslMode(process.env.TIGER_DATABASE_URL),
    ssl: { ca: timescaleCa },
    max: 5,
  });

// reuse one pool across hot reloads in dev
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;
