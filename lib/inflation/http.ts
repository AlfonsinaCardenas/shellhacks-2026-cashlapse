import "server-only";
import { FredError } from "../fred/client.ts";
import { validateInflationRange } from "./calculations.ts";
import { getInflationAnalytics } from "./service.ts";
import type { InflationAnalytics, InflationRange } from "./types.ts";

type LoadAnalytics = (range: InflationRange) => Promise<InflationAnalytics>;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

/** HTTP adapter; the optional loader keeps tests independent of live FRED access. */
export async function handleInflationRequest(
  request: Request,
  load: LoadAnalytics = getInflationAnalytics,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if (params.getAll("startMonth").length !== 1 || params.getAll("endMonth").length !== 1) {
    return errorResponse(400, "INVALID_RANGE", "Provide exactly one startMonth and endMonth in YYYY-MM format.");
  }
  const range = { startMonth: params.get("startMonth")!, endMonth: params.get("endMonth")! };
  try {
    validateInflationRange(range);
  } catch {
    return errorResponse(400, "INVALID_RANGE", "Use valid YYYY-MM dates, startMonth no later than endMonth, and a start year of at least 0002.");
  }
  try {
    const result = await load(range);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FredError) {
      switch (error.code) {
        case "FRED_CONFIG":
          return errorResponse(500, error.code, "Inflation data is not configured on the server.");
        case "FRED_TIMEOUT":
          return errorResponse(504, error.code, "The CPI data provider timed out. Please try again.");
        case "FRED_REQUEST":
        case "FRED_RESPONSE":
          return errorResponse(502, error.code, "CPI data is temporarily unavailable. Please try again.");
      }
    }
    return errorResponse(500, "INTERNAL_ERROR", "Unable to load inflation data.");
  }
}
