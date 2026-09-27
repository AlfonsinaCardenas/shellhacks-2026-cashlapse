"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IndexedPoint } from "@/lib/dashboard-series";
import { formatMonth, formatMonthShort } from "@/lib/format";

const INCOME = "var(--chart-1)";
const EXPENSES = "var(--chart-2)";
// CPI is the reference everything is judged against, so it's drawn as a
// recessive dashed line rather than a third brand color.
const CPI = "var(--muted-foreground)";

const SERIES = [
  { key: "income", label: "Income", color: INCOME, dashed: false },
  { key: "expenses", label: "Expenses", color: EXPENSES, dashed: false },
  { key: "cpi", label: "CPI (inflation)", color: CPI, dashed: true },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

const formatPct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}%`;

// Income, expenses and CPI on one scale: % change since the first month of
// the selected range. Above the dashed CPI line = growing faster than prices.
export function InflationComparisonChart({ data }: { data: IndexedPoint[] }) {
  const ticks =
    data.length <= 12
      ? data.map((d) => d.month)
      : data.filter((d) => [0, 6].includes(new Date(d.month).getUTCMonth())).map((d) => d.month);

  // Direct label at the last point that has a value, for each line.
  const lastIndex = (key: SeriesKey) => {
    for (let i = data.length - 1; i >= 0; i--) if (data[i][key] !== null) return i;
    return -1;
  };

  return (
    <>
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 84, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
            <XAxis
              dataKey="month"
              ticks={ticks}
              tickFormatter={formatMonthShort}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              dy={10}
            />
            <YAxis
              tickFormatter={formatPct}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              width={52}
            />
            <ReferenceLine y={0} stroke="rgb(255 255 255 / 0.25)" />
            <Tooltip
              cursor={{ stroke: "rgb(255 255 255 / 0.25)", strokeWidth: 1 }}
              content={({ active, payload }) => <LineTooltip active={active} point={payload?.[0]?.payload} />}
            />
            {SERIES.map((s) => {
              const last = lastIndex(s.key);
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  label={({ x, y, index }) =>
                    index === last && x !== undefined && y !== undefined ? (
                      <text key={s.key} x={Number(x) + 8} y={Number(y)} dy={4} fontSize={12} fill="var(--muted-foreground)">
                        {s.label.split(" ")[0]}
                      </text>
                    ) : (
                      <g key={`${s.key}-${index}`} />
                    )
                  }
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-4 text-sm">
        <summary className="text-muted-foreground hover:text-foreground">Show data</summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border">
          <table className="w-full text-right tabular-nums">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Month</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-3 py-2 font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t border-border">
                  <td className="px-3 py-1.5 text-left">
                    {formatMonth(d.month)}
                    {d.cpiProvisional && <span className="text-muted-foreground"> *</span>}
                  </td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="px-3 py-1.5">
                      {d[s.key] === null ? "—" : formatPct(d[s.key]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Ranges of 6+ months use a 3-month rolling average for all three lines; shorter ranges compare each month
          with the first.
          {data.some((d) => d.cpiProvisional) && " * CPI not published yet; the latest available month is used."}
        </p>
      </details>
    </>
  );
}

function LineTooltip({ active, point }: { active?: boolean; point?: IndexedPoint }) {
  if (!active || !point) return null;
  return (
    <div className="min-w-52 rounded-lg border border-border bg-popover px-3 py-2.5 text-sm shadow-xl">
      <p className="mb-2 font-medium">{formatMonth(point.month)}</p>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="font-medium tabular-nums">{point[s.key] === null ? "—" : formatPct(point[s.key]!)}</span>
        </div>
      ))}
      {point.cpiProvisional && <p className="mt-2 text-xs text-muted-foreground">CPI provisional for this month</p>}
    </div>
  );
}

export function InflationLegend() {
  return (
    <div className="flex items-center gap-5 text-sm text-muted-foreground">
      {SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-2">
          {s.dashed ? (
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: s.color }} />
          ) : (
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
          )}
          {s.label}
        </span>
      ))}
    </div>
  );
}
