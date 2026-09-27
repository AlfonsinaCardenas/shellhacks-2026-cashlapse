"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardPoint } from "@/lib/dashboard-series";
import { formatMoney, formatMoneyShort, formatMonth, formatMonthShort } from "@/lib/format";

const INCOME = "var(--chart-1)";
const EXPENSES = "var(--chart-2)";

type Props = { data: DashboardPoint[]; showReal: boolean; adjustedLabel: string };

// Grouped monthly bars. The Inflation View switch picks which dollars the
// bars are drawn in; the tooltip always shows both.
export function IncomeExpenseChart({ data, showReal, adjustedLabel }: Props) {
  // one tick every 6 months, like "Jan '25", "Jul '25"; every month for short ranges
  const ticks =
    data.length <= 12
      ? data.map((d) => d.month)
      : data.filter((d) => [0, 6].includes(new Date(d.month).getUTCMonth())).map((d) => d.month);

  return (
    <>
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
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
              tickFormatter={formatMoneyShort}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              width={48}
            />
            <Tooltip
              cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
              content={({ active, payload }) => (
                <BarTooltip active={active} point={payload?.[0]?.payload} adjustedLabel={adjustedLabel} />
              )}
            />
            <Bar
              dataKey={showReal ? "incomeReal" : "income"}
              name="Income"
              fill={INCOME}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
            <Bar
              dataKey={showReal ? "expensesReal" : "expenses"}
              name="Expenses"
              fill={EXPENSES}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-4 text-sm">
        <summary className="text-muted-foreground hover:text-foreground">Show data</summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border">
          <table className="w-full text-right tabular-nums">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Month</th>
                <th className="px-3 py-2 font-medium">Income</th>
                <th className="px-3 py-2 font-medium">Income ({adjustedLabel})</th>
                <th className="px-3 py-2 font-medium">Expenses</th>
                <th className="px-3 py-2 font-medium">Expenses ({adjustedLabel})</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t border-border">
                  <td className="px-3 py-1.5 text-left">
                    {formatMonth(d.month)}
                    {d.cpiProvisional && <span className="text-muted-foreground"> *</span>}
                  </td>
                  <td className="px-3 py-1.5">{formatMoney(d.income)}</td>
                  <td className="px-3 py-1.5">{d.incomeReal === null ? "—" : formatMoney(d.incomeReal)}</td>
                  <td className="px-3 py-1.5">{formatMoney(d.expenses)}</td>
                  <td className="px-3 py-1.5">{d.expensesReal === null ? "—" : formatMoney(d.expensesReal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.some((d) => d.cpiProvisional) && (
          <p className="mt-2 text-xs text-muted-foreground">* CPI for this month isn&apos;t published yet; the latest available month is used.</p>
        )}
      </details>
    </>
  );
}

function BarTooltip({
  active,
  point,
  adjustedLabel,
}: {
  active?: boolean;
  point?: DashboardPoint;
  adjustedLabel: string;
}) {
  if (!active || !point) return null;
  return (
    <div className="min-w-56 rounded-lg border border-border bg-popover px-3 py-2.5 text-sm shadow-xl">
      <p className="mb-2 font-medium">{formatMonth(point.month)}</p>
      <Row color={INCOME} label="Income" nominal={point.income} real={point.incomeReal} />
      <Row color={EXPENSES} label="Expenses" nominal={point.expenses} real={point.expensesReal} />
      <p className="mt-2 text-xs text-muted-foreground">
        {point.incomeReal === null
          ? "No CPI for this month"
          : `Second value in ${adjustedLabel}${point.cpiProvisional ? " (CPI provisional)" : ""}`}
      </p>
    </div>
  );
}

function Row({ color, label, nominal, real }: { color: string; label: string; nominal: number; real: number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-medium tabular-nums">
        {formatMoney(nominal)}
        {real !== null && <span className="text-muted-foreground"> · {formatMoney(real)}</span>}
      </span>
    </div>
  );
}
