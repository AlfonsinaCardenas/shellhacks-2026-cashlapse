/** Monthly headline CPI metadata; the index level is not a percentage. */
export const CPI_SERIES = {
  seriesId: "CPIAUCNS",
  frequency: "monthly",
  seasonalAdjustment: "not-seasonally-adjusted",
  indexBase: "1982-1984=100",
  source: "U.S. Bureau of Labor Statistics via FRED",
  sourceUrl: "https://fred.stlouisfed.org/series/CPIAUCNS",
} as const;
