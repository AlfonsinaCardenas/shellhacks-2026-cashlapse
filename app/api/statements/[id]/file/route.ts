import { readStatementPdf, StorageConfigError, StoredFileMissingError } from "@/lib/r2";
import { getSessionUserId } from "@/lib/session";
import { isUuid } from "@/lib/statement-types";
import { pool } from "@/lib/tigerdata";

// Streams the original statement PDF back to its owner, shown inline in the browser.
export async function GET(_request: Request, ctx: RouteContext<"/api/statements/[id]/file">) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Sign in to view statements.", { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const { rows } = await pool.query<{ r2_key: string; file_name: string }>(
    "SELECT r2_key, file_name FROM statements WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!rows[0]) return new Response("Not found", { status: 404 });

  let pdf: Buffer;
  try {
    pdf = await readStatementPdf(rows[0].r2_key);
  } catch (err) {
    if (err instanceof StoredFileMissingError) return new Response("The PDF for this statement wasn't found.", { status: 404 });
    if (err instanceof StorageConfigError) {
      console.error("[statement file] storage misconfigured:", err.message);
      return new Response("File storage isn't configured on the server.", { status: 500 });
    }
    console.error("[statement file] read failed", err);
    return new Response("Couldn't load the PDF. Try again in a moment.", { status: 502 });
  }

  // Header-safe ASCII fallback plus the real name for browsers that support it.
  const name = rows[0].file_name;
  const ascii = name.replace(/[^\x20-\x7E]|["\\]/g, "_");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Personal financial data: never let a shared cache keep it.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
