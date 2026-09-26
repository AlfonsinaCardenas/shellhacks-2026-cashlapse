// Report periods as URL values: "2026" (year), "2026-Q1" (quarter), "2026-01" (month).
// Always whole months, because the P&L reads the monthly_pnl aggregate.

export type ReportPeriod = {
  value: string;
  label: string;
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, exclusive
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const iso = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);

export function parsePeriod(value: string | undefined, now = new Date()): ReportPeriod {
  const match = /^(\d{4})(?:-(Q[1-4]|0[1-9]|1[0-2]))?$/.exec(value ?? "");
  if (!match) return parsePeriod(String(now.getUTCFullYear()), now);

  const year = Number(match[1]);
  const part = match[2];
  if (!part) return { value: match[0], label: String(year), from: iso(year, 0), to: iso(year + 1, 0) };
  if (part.startsWith("Q")) {
    const q = Number(part[1]) - 1;
    return { value: match[0], label: `Q${q + 1} ${year}`, from: iso(year, q * 3), to: iso(year, q * 3 + 3) };
  }
  const m = Number(part) - 1;
  return { value: match[0], label: `${MONTHS[m]} ${year}`, from: iso(year, m), to: iso(year, m + 1) };
}

// Picker options: the last 3 years, 8 quarters, and 12 months.
export function periodOptions(now = new Date()): { group: string; options: { value: string; label: string }[] }[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const quarter = Math.floor(month / 3);

  const years = [0, 1, 2].map((i) => String(year - i));
  const quarters = Array.from({ length: 8 }, (_, i) => {
    const q = quarter - i;
    const y = year + Math.floor(q / 4);
    return `${y}-Q${(((q % 4) + 4) % 4) + 1}`;
  });
  const months = Array.from({ length: 12 }, (_, i) => iso(year, month - i).slice(0, 7));

  const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: parsePeriod(v, now).label }));
  return [
    { group: "Year", options: toOptions(years) },
    { group: "Quarter", options: toOptions(quarters) },
    { group: "Month", options: toOptions(months) },
  ];
}
