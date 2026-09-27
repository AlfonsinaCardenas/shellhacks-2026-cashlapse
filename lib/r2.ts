// Server-only: where original statement PDFs are kept.
// Cloudflare R2 (S3-compatible API) when configured. In local development
// with no R2 settings at all, falls back to a gitignored .uploads/ folder.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
const LOCAL_DIR = path.join(process.cwd(), ".uploads");

// Storage is misconfigured, as opposed to temporarily failing. Retrying won't help.
export class StorageConfigError extends Error {}

let client: S3Client | null = null;
let warnedLocal = false;

function getClient(accountId: string, accessKeyId: string, secretAccessKey: string) {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

// Keyed by user + content hash, so storing the same file twice overwrites the
// same object instead of piling up copies.
export function statementKey(userId: string, fileHash: string) {
  // These become path segments on disk, so keep them boring.
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error("Invalid user id for storage key");
  if (!/^[0-9a-f]{64}$/.test(fileHash)) throw new Error("Invalid file hash for storage key");
  return `statements/${userId}/${fileHash}.pdf`;
}

// Stores the PDF and returns the key to save in statements.r2_key.
// Local files get a "local:" prefix so it's clear where to read them from.
export async function storeStatementPdf(userId: string, fileHash: string, body: Buffer): Promise<string> {
  const key = statementKey(userId, fileHash);
  const missing = R2_VARS.filter((name) => !process.env[name]?.trim());

  if (missing.length === 0) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
    await getClient(R2_ACCOUNT_ID!, R2_ACCESS_KEY_ID!, R2_SECRET_ACCESS_KEY!).send(
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: "application/pdf" }),
    );
    return key;
  }

  // Half-configured R2 is a mistake worth surfacing, not something to paper over.
  if (missing.length < R2_VARS.length) {
    throw new StorageConfigError(`R2 is partly configured; missing ${missing.join(", ")}`);
  }

  if (process.env.NODE_ENV !== "development") {
    throw new StorageConfigError("File storage isn't configured (set the R2_* env vars)");
  }

  if (!warnedLocal) {
    console.warn("[storage] R2 not configured, storing PDFs locally in .uploads/");
    warnedLocal = true;
  }
  const file = path.join(LOCAL_DIR, ...key.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  return `local:${key}`;
}
