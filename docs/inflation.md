# CPI and inflation analytics

Status: types, series metadata, calculations, the FRED client, and the service
are implemented and tested. The HTTP adapter remains planned.

## Getting real CPI data

Call the service from a Next.js Server Component or a route using the Node
runtime. Keep FRED_API_KEY in .env.local (already declared in .env.example).
Next.js loads that file; standalone Node commands need the --env-file flag.

```ts
import { getInflationAnalytics } from "../lib/inflation/service";

const result = await getInflationAnalytics({
  startMonth: "2024-01",
  endMonth: "2025-01",
});
// result.cumulativeInflationPercent is in percentage units.
// result.observations contains only the requested months.
```

Adjust the import path to the calling file. The service automatically requests
twelve months of extra history for year-over-year calculations. Requests use
untransformed CPI levels, a ten-second timeout, and no response caching.

The client uses Node's process module and rejects browser execution. Never
import the client or service into a Client Component. Once the team installs
Next.js and its dependencies, add the standard server-only package marker to
these modules and verify the application build. No Next.js project or dependency
manifest has been introduced by this module.

Run all offline tests with the installed Node 24 runtime:

```bash
node --test lib/inflation/calculations.test.ts lib/inflation/service.test.ts lib/fred/client.test.ts
```

Run an explicit live check (requires a configured key and network access):

```bash
node --env-file=.env.local scripts/check-inflation.ts
```

The check prints dates, observation count, and cumulative inflation, never the
key or raw errors. Verified against FRED: January 2024 to January 2025 returned
13 requested monthly observations and approximately 3.00048% cumulative inflation.

Errors have stable codes for the future route: FRED_CONFIG (500), FRED_REQUEST
or FRED_RESPONSE (502), and FRED_TIMEOUT (504). Invalid date ranges throw
RangeError (400). Provider failures must not be presented as successful empty
data. Missing observations in a successful response remain null.

## Running the calculation module

The calculation module accepts CPI observations supplied by the caller. Include
prior-year observations when year-over-year results are needed:

```ts
import { calculateInflation } from "../lib/inflation/calculations";

const result = calculateInflation(
  [
    { month: "2024-01", cpi: 200 },
    { month: "2025-01", cpi: 210 },
    { month: "2025-02", cpi: 220 },
  ],
  { startMonth: "2025-01", endMonth: "2025-02" },
);
// January year-over-year: approximately 5%.
// February year-over-year: null (February 2024 is missing).
// Cumulative change: approximately 4.7619% (210 to 220).
```

Adjust the import path to the calling file's location. Duplicate observation
months and malformed dates throw RangeError. Invalid CPI levels become null.
The calculation result excludes provider metadata and retrieval time; the
service adds those fields to produce InflationAnalytics.

Run from the repository root with the installed Node 24 runtime:

```bash
node --test lib/inflation/calculations.test.ts
```

These tests use Node's built-in runner without extra dependencies. Node executes
the TypeScript but does not type-check it. A full TypeScript/Next.js build check
will be needed when the application toolchain is initialized.

## Scope and ownership

The CPI module provides historical U.S. headline CPI, year-over-year inflation,
and cumulative inflation for a selected month range. It does not estimate a
personal inflation rate or forecast future CPI.

Keep provider access in server-only modules and calculation functions independent
of Next.js and network access. The application owner can call the service from a
Server Component or expose the proposed route once the application is initialized.

## Initial data series

Use CPIAUCNS: all-items CPI for urban consumers, U.S. city average, monthly,
not seasonally adjusted, index base 1982-1984 = 100. Source: U.S. Bureau of
Labor Statistics, distributed through FRED.

This choice supports year-over-year and period comparisons. Month-over-month
analysis is deferred; a future implementation must explicitly choose and label
its seasonal-adjustment convention.

References:
- https://fred.stlouisfed.org/series/CPIAUCNS
- https://fred.stlouisfed.org/docs/api/fred/series_observations.html

## Module files

- lib/fred/client.ts: server-only FRED requests and observation normalization.
- lib/fred/client.test.ts: mocked provider validation and failure tests.
- lib/inflation/series.ts: series identifier and metadata.
- lib/inflation/types.ts: shared input and output types.
- lib/inflation/calculations.ts: pure date-based calculation functions.
- lib/inflation/calculations.test.ts: deterministic calculation tests.
- lib/inflation/service.ts: validate inputs, obtain history, and assemble results.
- lib/inflation/service.test.ts: mocked end-to-end service tests.
- scripts/check-inflation.ts: explicit live smoke check without secret output.
- app/api/inflation/route.ts: planned thin HTTP adapter owned with the app team.

If the initialized app uses src/, place app/ and lib/ under src/ consistently.

## Service contract

Implemented function: getInflationAnalytics({ startMonth, endMonth }).

Both inputs are required calendar months formatted YYYY-MM. Accept years 0001
through 9999, validate months 01 through 12, and require startMonth <= endMonth.
Requests requiring an unsupported calendar-year lookback are invalid.

The successful result has this shape:

```ts
type InflationAnalytics = {
  seriesId: "CPIAUCNS";
  frequency: "monthly";
  seasonalAdjustment: "not-seasonally-adjusted";
  indexBase: "1982-1984=100";
  source: "U.S. Bureau of Labor Statistics via FRED";
  sourceUrl: "https://fred.stlouisfed.org/series/CPIAUCNS";
  fetchedAt: string; // ISO timestamp of provider retrieval, not publication
  startMonth: string;
  endMonth: string;
  latestAvailableMonth: string | null; // within the requested range
  observations: Array<{
    month: string;
    cpi: number | null;
    yearOverYearPercent: number | null;
  }>;
  cumulativeInflationPercent: number | null;
};
```

Return one observation per requested calendar month, in ascending order.
Missing or unpublished values are null. A requested end month must not silently
be replaced with the latest published month.

Percent fields use percentage units: 3.2 means 3.2%, not 0.032.
Preserve calculation precision; round only in presentation code.

## Calculation rules

For a valid, finite, positive CPI level C:

- Year-over-year percent at month t = (C[t] / C[t minus 12 months] - 1) * 100.
- Cumulative percent = (C[endMonth] / C[startMonth] - 1) * 100.
- A same-month period returns zero only when that month's CPI is valid.
- Missing, non-finite, or non-positive required values produce null.
- Match calendar months, not array offsets. Do not interpolate missing months.
- Negative inflation is a valid result.

Synthetic acceptance examples:
- CPI 200 last January and 210 this January => 5% year-over-year.
- CPI 200 at the start and 220 at the end => 10% cumulative.
- CPI 200 at the start and 190 at the end => -5% cumulative.
- A missing year-ago month => null year-over-year, even with 12 other rows.

## Provider behavior

Read FRED_API_KEY only on the server. Do not use a NEXT_PUBLIC_ prefix or send
the key to the browser. The existing .env.example already declares the variable.

Use the FRED series observations endpoint with JSON output, the fixed series ID,
ascending order, and untransformed index levels (units=lin). Fetch from twelve
calendar months before startMonth through the final day of endMonth. Return
only the requested months while retaining lookback data for calculations.
Clamp the provider start date to FRED's earliest supported date, 1776-07-04.
Ranges entirely before that date produce unavailable results without a request.
For that case fetchedAt records the availability check time. Response counts
must match the returned observations so truncated data is not silently accepted.

Normalize provider missing-value markers to null. Validate the response shape;
malformed responses and request failures are errors, not empty successful data.
Use a finite request timeout. Never include an API-key-bearing request URL in
logs or client-facing errors.

Data reflects the provider's current observations and may be revised; this
version does not provide historical data vintages. If caching is introduced,
retain the original fetchedAt timestamp and document the refresh policy.

## Proposed HTTP adapter

GET /api/inflation?startMonth=2025-01&endMonth=2026-01

- 200: the analytics result, including nulls for unavailable observations.
- 400: missing, malformed, or reversed month inputs.
- 500: missing server configuration.
- 502: provider request or response failure.
- 504: provider timeout.

Return a stable error object with code and message; never expose raw provider
errors or secrets.

## Implementation order and validation

1. Complete: shared types, series metadata, calculations, and deterministic tests.
2. Complete: FRED client, service, mocked tests, and a live provider check.
3. Next: integrate the HTTP adapter after the team initializes Next.js.

Use the team's chosen test runner rather than introducing a separate project
toolchain. Test calendar gaps, out-of-order input, missing baselines, deflation,
same-month ranges, and invalid values. Provider tests should cover missing
configuration, missing-value markers, bad responses, request failures, and
timeouts. Live API access is not required for automated tests.
