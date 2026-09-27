"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import type { CategoryPrice } from "@/lib/bea/statement-prices";

export function CategoryChart({ rows }: { rows: CategoryPrice[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Confirm a statement with groceries, gas, bills, travel, or restaurants to see this chart.
      </p>
    );
  }

  const earlierLabel = rows[0]?.earlierLabel ?? "Earlier prices";
  const latestLabel = rows[0]?.latestLabel ?? "Latest prices";

  return (
    <div>
      <div className="mb-4 flex items-center gap-5 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: "var(--chart-1)" }} />
          {earlierLabel} prices
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: "var(--chart-2)" }} />
          {latestLabel} prices
        </span>
      </div>
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 28, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
            <XAxis
              dataKey="label"
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
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as CategoryPrice | undefined;
                if (!active || !point) return null;
                return (
                  <div className="min-w-52 rounded-lg border border-border bg-popover px-3 py-2.5 text-sm shadow-xl">
                    <p className="mb-2 font-medium">{point.label}</p>
                    <p>
                      {point.earlierLabel} prices {formatMoney(point.earlier)}
                    </p>
                    <p>
                      {point.latestLabel} prices {formatMoney(point.today)}
                    </p>
                    <p>
                      Prices {point.rise >= 0 ? "rose" : "fell"} {Math.abs(point.rise)}% (
                      {formatMoney(Math.abs(point.today - point.earlier))})
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="earlier" name={earlierLabel} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="today" name={latestLabel} fill="var(--chart-2)" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="rise"
                position="top"
                formatter={(value) => {
                  const rise = Number(value);
                  return `${rise > 0 ? "+" : ""}${rise}%`;
                }}
                style={{ fill: "var(--foreground)", fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
