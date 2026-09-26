// Node runtime only. Import from server components/routes, never client components.
import { env } from "node:process";
import { validateInflationRange } from "../inflation/calculations.ts";
import { CPI_SERIES } from "../inflation/series.ts";
import type { CpiObservation, InflationRange } from "../inflation/types.ts";

export type FredErrorCode = "FRED_CONFIG" | "FRED_REQUEST" | "FRED_RESPONSE" | "FRED_TIMEOUT";

/** Safe messages intentionally omit provider bodies, URLs, and original errors. */
export class FredError extends Error {
  readonly code: FredErrorCode;
  constructor(code: FredErrorCode, message: string) {
    super(message);
    this.name = "FredError";
    this.code = code;
  }
}

export type FredClientOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function invalidResponse(): never {
  throw new FredError("FRED_RESPONSE", "FRED returned invalid or incomplete CPI data.");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(payload: unknown, startDate: string, endDate: string): CpiObservation[] {
  if (!record(payload) || !Array.isArray(payload.observations) ||
      payload.count !== payload.observations.length || payload.offset !== 0) invalidResponse();
  const seen = new Set<string>();
  const observations: CpiObservation[] = [];
  for (const row of payload.observations) {
    if (!record(row) || typeof row.date !== "string" ||
        !/^(?!0000)\d{4}-(0[1-9]|1[0-2])-01$/.test(row.date) ||
        row.date < startDate || row.date > endDate || typeof row.value !== "string") invalidResponse();
    const month = row.date.slice(0, 7);
    if (seen.has(month)) invalidResponse();
    seen.add(month);
    let cpi: number | null = null;
    if (row.value !== ".") {
      if (!/^\d+(\.\d+)?$/.test(row.value)) invalidResponse();
      cpi = Number(row.value);
      if (!Number.isFinite(cpi) || cpi <= 0) invalidResponse();
    }
    observations.push({ month, cpi });
  }
  return observations.sort((a, b) => a.month.localeCompare(b.month));
}

function lastDay(month: string): string {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = number === 2 ? (leap ? 29 : 28) : ([4, 6, 9, 11].includes(number) ? 30 : 31);
  return `${month}-${days}`;
}

/** Fetches the selected range plus twelve months of prior-year comparison data. */
export async function fetchCpiObservations(
  range: InflationRange,
  options: FredClientOptions = {},
): Promise<{ observations: CpiObservation[]; fetchedAt: string }> {
  if ("window" in globalThis) throw new FredError("FRED_CONFIG", "FRED access requires the server runtime.");
  validateInflationRange(range);
  const apiKey = (options.apiKey ?? env.FRED_API_KEY)?.trim();
  if (!apiKey) throw new FredError("FRED_CONFIG", "FRED_API_KEY is not configured on the server.");
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new FredError("FRED_CONFIG", "FRED timeout must be a positive supported integer.");
  }

  const previousYear = String(Number(range.startMonth.slice(0, 4)) - 1).padStart(4, "0");
  const lookback = `${previousYear}-${range.startMonth.slice(5)}-01`;
  const startDate = lookback < "1776-07-04" ? "1776-07-04" : lookback;
  const endDate = lastDay(range.endMonth);
  if (endDate < startDate) return { observations: [], fetchedAt: new Date().toISOString() };

  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.search = new URLSearchParams({
    series_id: CPI_SERIES.seriesId, api_key: apiKey, file_type: "json",
    observation_start: startDate, observation_end: endDate,
    units: "lin", sort_order: "asc", limit: "100000", offset: "0",
  }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      signal: controller.signal, cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new FredError("FRED_REQUEST", "FRED could not complete the CPI request.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      invalidResponse();
    }
    const observations = normalize(payload, startDate, endDate);
    return { observations, fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (controller.signal.aborted) throw new FredError("FRED_TIMEOUT", "The FRED CPI request timed out.");
    if (error instanceof FredError) throw error;
    throw new FredError("FRED_REQUEST", "Unable to retrieve CPI data from FRED.");
  } finally {
    clearTimeout(timer);
  }
}
