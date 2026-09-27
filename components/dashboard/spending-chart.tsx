"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMoneyShort, formatMonth, formatMonthShort } from "@/lib/format";

export type SpendingPoint = { month: string; nominal: number; real: number | null };

const NOMINAL = "var(--chart-1)";
const REAL = "var(--chart-2)";

type Props = { data: SpendingPoint[]; showReal: boolean; adjustedLabel: string };

export function SpendingChart({ data, showReal, adjustedLabel }: Props) {
  // one tick every 6 months, like "Jan '23", "Jul '23"
  const ticks = data.filter((d) => [0, 6].includes(new Date(d.month).getUTCMonth())).map((d) => d.month);

  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fill-top" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={showReal ? REAL : NOMINAL} stopOpacity={0.18} />
              <stop offset="100%" stopColor={showReal ? REAL : NOMINAL} stopOpacity={0} />
            </linearGradient>
          </defs>
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
            content={({ active, payload }) => (
              <ChartTooltip active={active} point={payload?.[0]?.payload} showReal={showReal} adjustedLabel={adjustedLabel} />
            )}
            cursor={{ stroke: "rgb(255 255 255 / 0.25)", strokeWidth: 1 }}
          />
          {/* faint fill under the top line only, so fills never overlap */}
          <Area
            type="monotone"
            dataKey={showReal ? "real" : "nominal"}
            connectNulls={false}
            stroke="none"
            fill="url(#fill-top)"
            isAnimationActive={false}
            activeDot={false}
          />
          {showReal && (
            <Line
              type="monotone"
              dataKey="real"
              name={adjustedLabel}
              connectNulls={false}
              stroke={REAL}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
          )}
          <Line
            type="monotone"
            dataKey="nominal"
            name="Nominal"
            stroke={NOMINAL}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({
  active,
  point,
  showReal,
  adjustedLabel,
}: {
  active?: boolean;
  point?: SpendingPoint;
  showReal: boolean;
  adjustedLabel: string;
}) {
  if (!active || !point) return null;

  return (
    <div className="min-w-44 rounded-lg border border-border bg-popover px-3 py-2.5 text-sm shadow-xl">
      <p className="mb-2 font-medium">
        {formatMonth(point.month)}
      </p>
      <TooltipRow color={NOMINAL} label="Nominal" value={point.nominal} />
      {showReal && <TooltipRow color={REAL} label={adjustedLabel} value={point.real} />}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value === null ? "Unavailable" : formatMoney(value)}</span>
    </div>
  );
}
