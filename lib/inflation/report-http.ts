// Server-only: shared plumbing for the inflation report routes.
import "server-only";
import { getSessionUserId } from "../session.ts";
import { CpiNotSyncedError } from "./cpi-store.ts";
import { parseMonthRange } from "./metrics.ts";

type Handler = (userId: string, range: { from: string; to: string }) => Promise<unknown>;

/** Session check, ?from/?to parsing, and consistent error responses. */
export async function runReport(request: Request, name: string, handler: Handler): Promise<Response> {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Sign in to view reports." }, { status: 401 });

  const range = parseMonthRange(request.url);
  if ("error" in range) return Response.json({ error: range.error }, { status: 400 });

  try {
    const body = await handler(userId, range);
    return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof CpiNotSyncedError) {
      return Response.json(
        { error: "CPI data hasn't been loaded yet. Try again after the daily sync runs.", code: "CPI_NOT_SYNCED" },
        { status: 503 },
      );
    }
    console.error(`[${name}] failed`, err);
    return Response.json({ error: "Couldn't build this report." }, { status: 500 });
  }
}
