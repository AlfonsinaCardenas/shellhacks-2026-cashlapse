// Node runtime only. Import from server code, never from a Client Component.
import "server-only";
import { env } from "node:process";

const CATEGORIES = {
  groceries: "Food and beverages purchased for off-premises consumption",
  gas: "Gasoline and other energy goods",
  bills: "Housing and utilities",
  travel: "Transportation services",
  restaurants: "Food services and accommodations",
} as const;

export type PceCategory = keyof typeof CATEGORIES;

export type PceObservation = {
  month: string;
  category: PceCategory;
  index: number;
};

function label(description: string): PceCategory | null {
  const clean = description.replace(/^\.+/, "").trim();
  for (const [category, name] of Object.entries(CATEGORIES)) {
    if (clean === name) return category as PceCategory;
  }
  return null;
}

export async function fetchPceObservations(): Promise<PceObservation[]> {
  const apiKey = env.BEA_API_KEY?.trim();
  if (!apiKey) throw new Error("BEA_API_KEY is not configured on the server.");

  const url = new URL("https://apps.bea.gov/api/data/");
  url.search = new URLSearchParams({
    UserID: apiKey,
    method: "GetData",
    DataSetName: "NIUnderlyingDetail",
    TableName: "U20404",
    Frequency: "M",
    Year: "2023,2024,2025,2026",
    ResultFormat: "JSON",
  }).toString();

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("BEA could not complete the request.");

  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("BEAAPI" in payload)
  ) {
    throw new Error("BEA returned an unexpected response.");
  }

  const results = (payload as { BEAAPI: { Results?: { Data?: unknown; Error?: unknown } } })
    .BEAAPI.Results;
  if (!results || results.Error || !Array.isArray(results.Data)) {
    throw new Error("BEA returned an error instead of price data.");
  }

  const observations: PceObservation[] = [];
  for (const row of results.Data) {
    if (typeof row !== "object" || row === null) continue;
    const item = row as {
      LineDescription?: unknown;
      TimePeriod?: unknown;
      DataValue?: unknown;
    };
    if (typeof item.LineDescription !== "string" || typeof item.TimePeriod !== "string") {
      continue;
    }
    const category = label(item.LineDescription);
    const month = /^(\d{4})M(0[1-9]|1[0-2])$/.exec(item.TimePeriod);
    const index = typeof item.DataValue === "string" ? Number(item.DataValue) : NaN;
    if (!category || !month || !Number.isFinite(index) || index <= 0) continue;
    observations.push({
      month: `${month[1]}-${month[2]}`,
      category,
      index,
    });
  }

  return observations;
}