import { timingSafeEqual } from "node:crypto";
import { FredError } from "@/lib/fred/client";
import { syncCpiFromFred } from "@/lib/inflation/cpi-store";

export const maxDuration = 60;

// Machine-to-machine: authenticated with CRON_SECRET, not a user session.
function authorized(request: Request): boolean | "unconfigured" {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  // Constant-time comparison so the secret can't be guessed byte by byte.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request): Promise<Response> {
  const auth = authorized(request);
  if (auth === "unconfigured") {
    console.error("[cpi-sync] CRON_SECRET is not set");
    return Response.json({ error: "CPI sync is not configured on the server." }, { status: 500 });
  }
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await syncCpiFromFred();
    console.info(
      `[cpi-sync] ${result.written} rows written, latest released ${result.latest_released}, ` +
        `${result.revisions.length} revisions, provisional: ${result.provisional_months.join(", ") || "none"}`,
    );
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof FredError) {
      console.error(`[cpi-sync] FRED ${err.code}: ${err.message}`);
      const status = err.code === "FRED_CONFIG" ? 500 : err.code === "FRED_TIMEOUT" ? 504 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[cpi-sync] failed", err);
    return Response.json({ error: "CPI sync failed." }, { status: 500 });
  }
}

// Vercel Cron calls GET with "Authorization: Bearer $CRON_SECRET". POST is
// kept for manual runs (curl -X POST -H "Authorization: Bearer ...").
export const GET = handle;
export const POST = handle;
