# CPI and inflation analytics

Status: calculations, the FRED client, the service, and the Next.js HTTP endpoint
are implemented. The frontend can call GET /api/inflation.

## Current dashboard integration

The dashboard now queries real monthly operating spending through lib/queries.ts,
fetches FRED observations, and selects the latest published CPI month. It passes
cpiTargetMonth to the frontend so the subtitle, legend, and tooltip use the actual
comparison month (for example, "Aug 2026 dollars"). Missing adjustments remain
null and render as gaps with an "Unavailable" tooltip. A provider failure leaves
original spending visible with an explicit unavailable message; it never copies
nominal amounts into the adjusted series.

Configure FRED_API_KEY in the ignored .env.local for local development. The
deployment also needs its own server-side environment setting.

Remaining integration work: account filters, the real statements history list,
verification of the balance-column database migration and monthly aggregate
refresh after uploads, and a complete signed-in upload-to-dashboard test.
The team query currently includes ledger rows from NEEDS_VERIFICATION statements
and nets income within operating categories against expenses. Confirm that policy
before treating totals as verified gross spending. Earlier handoff notes below
describe the original integration plan, not the current completion status.

## Adjusting spending into a target month's dollars

lib/inflation/adjustments.ts provides pure functions that accept data supplied
by the caller. They do not access the database or FRED, and can be tested before
the dashboard is connected. The existing /api/inflation response is unchanged.

Formula: adjusted amount = original amount * (target CPI / original-month CPI).
For example, $100 with original CPI 200 and target CPI 220 becomes $110 in the
target month's dollars. This is a broad CPI comparison, not a prediction of a
specific product's price or a person's actual spending.

```ts
import { adjustAmountForInflation, adjustMonthlySpending } from "../lib/inflation/adjustments";

adjustAmountForInflation(100, 200, 220); // approximately 110

const result = adjustMonthlySpending(
  [
    { month: "2024-01", nominal: 100 },
    { month: "2024-02", nominal: 150 },
  ],
  [
    { month: "2024-01", cpi: 200 },
    { month: "2024-02", cpi: 210 },
    { month: "2025-01", cpi: 220 },
  ],
  "2025-01",
);
// result.targetMonth === "2025-01"
// result.targetCpi === 220
// result.spending contains:
// { month: "2024-01", nominal: 100, sourceCpi: 200, adjusted: ~110 }
// { month: "2024-02", nominal: 150, sourceCpi: 210, adjusted: ~157.142857 }
```

Contract for the backend teammate:

- Supply one aggregated USD nominal amount per month, using YYYY-MM strings
  (not full dates or timestamps). Filter by user/accounts before aggregating.
- Supply CPI observations for every source month and the explicit target month,
  all from the same series and adjustment convention. The existing service's
  observations can be passed directly if its requested range covers those months.
- Convert database numeric strings to validated finite numbers at the query
  boundary. Monthly totals must be finite numbers; invalid amounts throw RangeError.
- Duplicate spending months and CPI months, and malformed dates, throw RangeError.
  Input order is arbitrary; output is chronological. Inputs are not mutated.
- Missing/non-positive/non-finite CPI produces null adjustments. A missing target
  CPI makes all adjustments null, with no silent fallback or estimated CPI.
- Zero amounts and negative amounts (such as refunds) are supported when CPI
  is valid. No spending rows are invented for missing months.
- The target may be before, after, or equal to the original month. No prior-year
  data is needed for this conversion. Currency conversion is not performed.
- The scalar helper returns null for invalid amounts, invalid CPI, or unrepresentable
  results. Calculations retain floating-point precision; round only for display.

Contract for the frontend teammate:

- Label the comparison with result.targetMonth, for example "January 2025 dollars".
  Do not call it "today's dollars" when the target is an older published month.
- Map month to the chart's full-date format using month + "-01", nominal to nominal,
  and adjusted to real. The current chart requires real: number; it will need to
  accept null and render gaps/unavailable tooltips before using incomplete data.
- Missing adjusted values are not zero and must not be replaced with nominal.
  These functions do not generate provisional or forecast values.

Target selection, fetching/querying spending, persistence in macro_cpi, and chart
wiring remain integration work. The caller must explicitly choose a published
target month or show an unavailable result; this module does not choose one.

Validation for this addition: all 34 inflation tests pass (including nine new
adjustment tests), along with repository lint and TypeScript no-emit checking.

## Getting real CPI data

### Monthly spending service for backend integration

The server-only getAdjustedMonthlySpending function now connects monthly spending
to live FRED CPI and the tested adjustment functions. It returns targetMonth,
targetCpi, spending rows, source metadata, and fetchedAt. It does not query or
write the database, and no spending amounts are sent to FRED.

```ts
import { getAdjustedMonthlySpending } from "@/lib/inflation/spending-service";

// Replace this synthetic input with the backend's authenticated monthly query.
const monthlySpending = [{ month: "2024-01", nominal: 100 }];
const result = await getAdjustedMonthlySpending(monthlySpending, "2025-01");
// Verified live: adjusted is approximately 103.00048 (display as $103.00).
// Target label: January 2025 dollars.
```

One CPI request covers all spending months and the explicit target month (plus
the existing provider client's year-ago lookback). Inputs are validated and copied
before fetching. The service inherits the client's minimum starting year of 0002.
An empty spending array returns an empty spending result with fetched target CPI.
Missing target/source CPI stays null; provider errors propagate as FredError.
Validation: all 40 inflation tests, repository lint, and the merged application's
production build pass. The live synthetic-spending check also passed.
The existing /api/inflation endpoint remains a CPI-only endpoint, not a spending
endpoint. Backend owners can use this service in their authenticated P&L query
or route; the HTTP adapter is not yet connected to monthly spending.

Run the standalone live check with synthetic spending and real CPI:

```bash
node --conditions=react-server --env-file=.env scripts/check-adjusted-spending.ts
```

### Exact teammate handoff

Person 2 (backend/database):

- Provide a server-side query returning one { month: "YYYY-MM", nominal: number }
  per month for the authenticated user and selected accounts/date range. Convert
  PostgreSQL numeric strings to validated numbers before calling the service.
- Confirm the initial operating-spending rule: EXPENSE transactions excluding
  Transfers, from COMPLETED statements only. Decide how refunds should reduce
  spending: the parser currently labels credits/refunds INCOME, so they cannot
  all be subtracted indiscriminately as if they were expense refunds.
- Confirm that database tables are deployed and supply a synthetic completed
  statement with known totals for an integration test; do not send credentials.
- The confirm route currently also writes NEEDS_VERIFICATION statements to the
  ledger. A status-aware query must join statements. The existing monthly_pnl
  aggregate does not include statement_id/status, so it cannot filter those rows
  after aggregation without an agreed change to the data model/query.
- Agree how account filters map to stored statement/account identifiers and who
  owns the P&L endpoint or Server Component call. Current production authentication
  remains a separate dependency: getSessionUserId returns null in production.

Person 1 (frontend):

- Consume the combined spending result once the backend exposes it. The chart
  mapping is { month: row.month + "-01", nominal: row.nominal,
  real: row.adjusted, provisional: false } for these published observations.
- Accept real: number | null, leave chart gaps for missing CPI, and show an
  unavailable tooltip rather than formatting null as money. Add loading/error
  states and label the exact targetMonth instead of claiming current-day prices.
- Coordinate filter changes with the backend query, rather than only filtering
  the old mock chart locally.

Person 3 (parser):

- Confirm that Transfers includes credit-card payments/internal transfers and
  clarify how actual purchase refunds can be distinguished from other INCOME.
- Provide a synthetic PDF test case with known monthly expenses, a transfer,
  and a refund so the team can verify the full flow together.

Shared decision: choose a published target month (recommended eventual default:
latest available published CPI, clearly labeled). Automatic target selection and
macro_cpi persistence/refresh are not implemented by this new service.

### CPI-only service

Call the service from a Next.js Server Component or a route using the Node
runtime. Keep FRED_API_KEY in .env (already declared in .env.example).
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

The client, service, and HTTP adapter import the server-only marker, so Next.js
rejects imports from Client Components. Fetch /api/inflation from browser code
instead. This branch incorporates the team's Next.js setup from main.

Run all offline tests with the installed Node 24 runtime:

```bash
npm run test:inflation
```

Run an explicit live check (requires a configured key and network access):

```bash
npm run check:inflation
```

The check prints dates, observation count, and cumulative inflation, never the
key or raw errors. Verified against FRED: January 2024 to January 2025 returned
13 requested monthly observations and approximately 3.00048% cumulative inflation.

The original CPI endpoint was validated with 25 offline tests, repository lint,
and the production build. Dollar-adjustment tests run in the same test command.
The built Next.js endpoint also returned HTTP 200 for the live example above
and HTTP 400 when required query parameters were omitted.

Errors have stable codes for the route: FRED_CONFIG (500), FRED_REQUEST
or FRED_RESPONSE (502), and FRED_TIMEOUT (504). Invalid date ranges produce
INVALID_RANGE (400); unexpected failures produce INTERNAL_ERROR (500).
Provider failures must not be presented as successful empty
data. Missing observations in a successful response remain null.

On Windows PowerShell, use npm.cmd if execution policy blocks npm.ps1. The test
and smoke-check scripts enable Node's react-server condition to load server-only
modules outside Next.js. Never set this condition globally for the Next.js app.

## Frontend handoff

Start the application with npm run dev, then request:

```text
http://localhost:3000/api/inflation?startMonth=2024-01&endMonth=2025-01
```

```ts
const query = new URLSearchParams({ startMonth: "2024-01", endMonth: "2025-01" });
const response = await fetch(`/api/inflation?${query}`);
const data = await response.json();
if (!response.ok) throw new Error(data.error.message);
// Display data.cumulativeInflationPercent and chart data.observations.
// Display null as unavailable; it is not zero inflation.
```

Both parameters must appear exactly once. All responses use Cache-Control:
no-store. Error bodies have the shape { error: { code, message } }. The endpoint
uses the Node runtime; FRED_API_KEY must also be set in the deployment environment.

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

These tests use Node's built-in runner. Node executes TypeScript without
type-checking it; npm run build performs the full Next.js/TypeScript build.
allowImportingTsExtensions permits the explicit .ts imports used by Node tests.

## Scope and ownership

The CPI module provides historical U.S. headline CPI, year-over-year inflation,
and cumulative inflation for a selected month range. It does not estimate a
personal inflation rate or forecast future CPI.

Keep provider access in server-only modules and calculation functions independent
of Next.js and network access. The application owner can call the service from a
Server Component or use the implemented HTTP endpoint.

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
- lib/inflation/spending-service.ts: connects monthly totals to FRED and adjustments.
- lib/inflation/spending-service.test.ts: tests the combined spending service.
- lib/inflation/adjustments.ts: scalar and monthly dollar-adjustment functions.
- lib/inflation/adjustments.test.ts: deterministic dollar-adjustment tests.
- lib/inflation/http.ts: request validation and safe HTTP error mapping.
- lib/inflation/http.test.ts: HTTP contract and route wiring tests.
- scripts/check-inflation.ts: explicit live smoke check without secret output.
- app/api/inflation/route.ts: thin Next.js GET adapter.

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

## HTTP endpoint

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
3. Complete: integrate the HTTP adapter with the team's Next.js setup.
4. Complete locally: dollar-adjustment functions, tests, and teammate contracts.
5. Next: connect real monthly spending, explicit target selection, and frontend display.

Use the team's chosen test runner rather than introducing a separate project
toolchain. Test calendar gaps, out-of-order input, missing baselines, deflation,
same-month ranges, and invalid values. Provider tests should cover missing
configuration, missing-value markers, bad responses, request failures, and
timeouts. Live API access is not required for automated tests.
