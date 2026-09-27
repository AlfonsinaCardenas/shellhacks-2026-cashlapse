import "server-only";
import { Pool } from "pg";

const globalForPg = globalThis as unknown as { beaPool?: Pool };

function createPool() {
  const connectionString = process.env.TIGER_DATABASE_URL;
  if (!connectionString) throw new Error("TIGER_DATABASE_URL is not configured.");
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return new Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
}

export const beaPool = globalForPg.beaPool ?? createPool();

if (process.env.NODE_ENV !== "production") globalForPg.beaPool = beaPool;