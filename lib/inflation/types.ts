import type { CPI_SERIES } from "./series.ts";

export type InflationRange = {
  /** Inclusive calendar month, YYYY-MM. */
  startMonth: string;
  /** Inclusive calendar month, YYYY-MM. */
  endMonth: string;
};

export type CpiObservation = {
  month: string;
  cpi: number | null;
};

export type InflationObservation = CpiObservation & {
  /** Percentage units: 3.2 means 3.2%. */
  yearOverYearPercent: number | null;
};

export type InflationCalculation = InflationRange & {
  latestAvailableMonth: string | null;
  observations: InflationObservation[];
  cumulativeInflationPercent: number | null;
};

/** The provider service adds source metadata and retrieval time. */
export type InflationAnalytics = InflationCalculation & typeof CPI_SERIES & {
  fetchedAt: string;
};

/** One already-aggregated monthly amount in USD; negative refunds are allowed. */
export type MonthlySpending = {
  month: string; // YYYY-MM
  nominal: number;
};

export type AdjustedSpending = {
  targetMonth: string;
  targetCpi: number | null;
  spending: Array<MonthlySpending & {
    sourceCpi: number | null;
    adjusted: number | null;
  }>;
};

export type AdjustedSpendingAnalytics = AdjustedSpending & typeof CPI_SERIES & {
  fetchedAt: string;
};
