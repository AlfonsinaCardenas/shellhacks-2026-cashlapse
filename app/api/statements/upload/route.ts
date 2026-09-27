import { pool } from "@/lib/tigerdata";
import { extractAndRedactPdf, GeminiParseError, hashFile, parsePdfWithGemini } from "@/lib/pdf-parser";
import { StorageConfigError, storeStatementPdf } from "@/lib/r2";
import { getSessionUserId } from "@/lib/session";
import type { ApiError, StoredPayload, UploadResponse } from "@/lib/statement-types";

// Gemini on a long statement can take a while.
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;

const error = (status: number, body: ApiError) => Response.json(body, { status });

export async function POST(request: Request) {
  // 1. Session
  const userId = await getSessionUserId();
  if (!userId) return error(401, { error: "Sign in to upload statements." });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, { error: "Expected multipart form data." });
  }

  const file = form.get("file");
  const password = form.get("password");
  if (!(file instanceof File)) return error(400, { error: "No file was uploaded." });
  if (file.size === 0) return error(400, { error: "The file is empty." });
  if (file.size > MAX_BYTES) return error(413, { error: "Statements must be 20 MB or smaller." });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return error(415, { error: "That file isn't a PDF." });
  }
  const fileName = file.name.slice(0, 255) || "statement.pdf";

  // 2. Duplicate check
  const fileHash = hashFile(buffer);
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM statements WHERE user_id = $1 AND file_hash = $2",
    [userId, fileHash],
  );
  if (existing.rowCount) {
    return error(409, { error: `${fileName} was already uploaded.`, statement_id: existing.rows[0].id });
  }

  // 3. Text + redaction
  let extracted;
  try {
    extracted = await extractAndRedactPdf(buffer, typeof password === "string" ? password : undefined);
  } catch (err) {
    console.error("[upload] PDF extraction failed", err);
    return error(422, { error: "We couldn't read that PDF. It may be damaged." });
  }
  if (extracted.needsPassword) {
    return error(401, {
      error: extracted.incorrectPassword ? "That password didn't work." : "This PDF is password protected.",
      needsPassword: true,
      incorrectPassword: extracted.incorrectPassword,
    });
  }
  if (extracted.redactedText.replace(/--- Page \d+ ---/g, "").trim().length < 40) {
    return error(422, {
      error:
        "This PDF has no readable text. Scanned statements aren't supported yet; download the PDF from your bank instead.",
    });
  }

  // 4. Gemini sees only the redacted text
  const sentToGemini = extracted.redactedText;
  let parsed;
  try {
    parsed = await parsePdfWithGemini(sentToGemini);
  } catch (err) {
    console.error("[upload] Gemini parsing failed", err);
    const message =
      err instanceof GeminiParseError
        ? "The AI couldn't make sense of this statement. Make sure it's a bank or card statement."
        : "The AI service is unavailable right now. Try again in a moment.";
    return error(502, { error: message });
  }

  // 5. Keep the original PDF. Done only after a successful parse, so password
  //    prompts and unreadable files don't leave orphans behind.
  let r2Key: string;
  try {
    r2Key = await storeStatementPdf(userId, fileHash, buffer);
  } catch (err) {
    if (err instanceof StorageConfigError) {
      console.error("[upload] storage misconfigured:", err.message);
      return error(500, { error: "File storage isn't configured on the server." });
    }
    console.error("[upload] storing the PDF failed", err);
    return error(502, { error: "Couldn't store the file. Try again in a moment." });
  }

  // 6. Save for review. ON CONFLICT covers two uploads of the same file racing.
  const payload: StoredPayload = {
    extraction: parsed.extraction,
    meta: { model: parsed.model, page_count: extracted.pageCount, redactions: extracted.redactions },
  };
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO statements (user_id, file_name, r2_key, file_hash, bank_name, status, sent_to_gemini, extraction_payload)
     VALUES ($1, $2, $3, $4, $5, 'NEEDS_REVIEW', $6, $7)
     ON CONFLICT (user_id, file_hash) DO NOTHING
     RETURNING id`,
    [userId, fileName, r2Key, fileHash, parsed.extraction.bank_name, sentToGemini, payload],
  );
  if (!inserted.rowCount) return error(409, { error: `${fileName} was already uploaded.` });

  // 7. Back to the client for review
  const body: UploadResponse = {
    statement_id: inserted.rows[0].id,
    status: "NEEDS_REVIEW",
    extraction: parsed.extraction,
    sent_to_gemini: sentToGemini,
    redactions: extracted.redactions,
  };
  return Response.json(body, { status: 201 });
}
