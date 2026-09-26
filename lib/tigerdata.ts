import { Pool } from "pg";

// Server-only: never import this from a client component.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

// TIGER_DATABASE_URL already includes ?sslmode=require
export const pool =
  globalForPg.pgPool ??
  new Pool({ connectionString: process.env.TIGER_DATABASE_URL, max: 5 });

// reuse one pool across hot reloads in dev
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;
