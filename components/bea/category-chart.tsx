"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
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
                <div className="min-w-44 rounded-lg border border-border bg-popover px-3 py-2.5 text-sm shadow-xl">
                  <p className="mb-2 font-medium">{point.label}</p>
                  <p>Charged {formatMoney(point.nominal)}</p>
                  <p>July 2026 prices {formatMoney(point.today)}</p>
                  <p>Prices rose {point.rise}%</p>
                </div>
              );
            }}
          />
          <Bar dataKey="nominal" name="Charged" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="today" name="July 2026 prices" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}