import { handleInflationRequest } from "../../../lib/inflation/http.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleInflationRequest(request);
}
