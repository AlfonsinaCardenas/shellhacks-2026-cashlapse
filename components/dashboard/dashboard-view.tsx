"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, FileText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { SpendingChart, type SpendingPoint } from "@/components/dashboard/spending-chart";
import type { MonthlyTotals } from "@/lib/financial-statements";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryChart } from "@/components/bea/category-chart";
import type { CategoryPrice } from "@/lib/bea/statement-prices";

const RANGES = [
  { value: "2023-01-01", label: "Jan 2023 – Present" },
  { value: "2024-01-01", label: "Jan 2024 – Present" },
  { value: "2025-01-01", label: "Jan 2025 – Present" },
];

type Total = { value: number; change: number | null };
type Totals = Record<"revenue" | "expenses" | "netIncome", Total>;

type Props = {
  monthly: MonthlyTotals[];
  spending: SpendingPoint[];
  accounts: string[];
  categories?: CategoryPrice[];
};

// Sums the selected range and compares it with the same number of months
// just before it ("Jan 2025 – Present" vs the equally long stretch before Jan 2025).
function summarize(monthly: MonthlyTotals[], rangeStart: string): Totals {
  const start = rangeStart.slice(0, 7);
  const now = new Date();
  const startDate = new Date(`${start}-01T00:00:00Z`);
  const length =
    (now.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + now.getUTCMonth() - startDate.getUTCMonth() + 1;
  const prevStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - length, 1))
    .toISOString()
    .slice(0, 7);

  const current = monthly.filter((m) => m.month >= start);
  const previous = monthly.filter((m) => m.month >= prevStart && m.month < start);

  const total = (key: keyof Totals): Total => {
    const cur = current.reduce((s, m) => s + m[key], 0);
    const prev = previous.reduce((s, m) => s + m[key], 0);
    const change = previous.length && prev !== 0 ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null;
    return { value: Math.round(cur * 100) / 100, change };
  };
  return { revenue: total("revenue"), expenses: total("expenses"), netIncome: total("netIncome") };
}

export function DashboardView({ monthly, spending, accounts, categories = [] }: Props) {
  const [range, setRange] = useState(RANGES[0].value);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(accounts);
  const [inflationView, setInflationView] = useState(true);

  const rangeLabel = RANGES.find((r) => r.value === range)!.label;
  const data = useMemo(() => spending.filter((d) => d.month >= range), [spending, range]);
  const totals = useMemo(() => summarize(monthly, range), [monthly, range]);

  const accountsLabel =
    selectedAccounts.length === accounts.length
      ? "All accounts"
      : `${selectedAccounts.length} of ${accounts.length} accounts`;

  function toggleAccount(account: string, checked: boolean) {
    setSelectedAccounts((prev) => (checked ? [...prev, account] : prev.filter((a) => a !== account)));
  }

  return (
    <>
      <PageHeader eyebrow="Profit & Loss" title="Your financial picture">
        <DropdownMenu>
          <DropdownMenuTrigger className={filterButton}>
            <CalendarDays className="size-4 text-muted-foreground" />
            {rangeLabel}
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuRadioGroup value={range} onValueChange={(v) => setRange(v as string)}>
              {RANGES.map((r) => (
                <DropdownMenuRadioItem key={r.value} value={r.value}>
                  {r.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={filterButton}>
            <FileText className="size-4 text-muted-foreground" />
            {accountsLabel}
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuCheckboxItem
              checked={selectedAccounts.length === accounts.length}
              onCheckedChange={(checked) => setSelectedAccounts(checked ? accounts : [])}
            >
              All accounts
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {accounts.map((account) => (
              <DropdownMenuCheckboxItem
                key={account}
                checked={selectedAccounts.includes(account)}
                onCheckedChange={(checked) => toggleAccount(account, checked)}
              >
                {account}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <label className={cn(filterButton, "cursor-pointer")}>
          <Switch checked={inflationView} onCheckedChange={setInflationView} />
          Inflation View
        </label>
      </PageHeader>

      <div className="mb-6 grid gap-5 md:grid-cols-3">
        <StatCard label="Gross Revenue" total={totals.revenue} period={rangeLabel} goodWhenUp />
        <StatCard label="Operating Expenses" total={totals.expenses} period={rangeLabel} goodWhenUp={false} />
        <StatCard label="Net Income" total={totals.netIncome} period={rangeLabel} goodWhenUp />
      </div>

      <section className="rounded-2xl border border-border bg-card p-7">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Spending over time</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {inflationView
                ? "Operating spend, adjusted to today's dollars using official CPI data"
                : "Operating spend as it was charged"}
            </p>
          </div>
          <div className="flex items-center gap-5 text-sm text-muted-foreground">
            <LegendItem color="var(--chart-1)" label="Nominal" />
            {inflationView && <LegendItem color="var(--chart-2)" label="Today's dollars" />}
          </div>
        </div>
        {data.length ? (
          <SpendingChart data={data} showReal={inflationView} />
        ) : (
          <p className="flex h-[380px] items-center justify-center text-sm text-muted-foreground">
            <span>
              No confirmed transactions in this range yet.{" "}
              <Link href="/upload" className="font-medium text-info hover:underline">
                Upload a statement
              </Link>
            </span>
          </p>
        )}
      </section>
      <section className="mt-6 rounded-2xl border border-border bg-card p-7">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Prices by category</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Statement spending, repriced with the index for that category.
          </p>
        </div>
        <CategoryChart rows={categories} />
      </section>
    </>
  );
}

const filterButton =
  "flex h-11 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-sm text-foreground/90 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring";

function StatCard({
  label,
  total,
  period,
  goodWhenUp,
}: {
  label: string;
  total: Total;
  period: string;
  goodWhenUp: boolean;
}) {
  const good = (total.change ?? 0) >= 0 === goodWhenUp;
  return (
    <div className="rounded-2xl border border-border bg-card p-7">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        {/* no change % when there's no earlier period to compare against */}
        {total.change !== null && (
          <span className={cn("text-sm font-semibold tabular-nums", good ? "text-success" : "text-destructive")}>
            {total.change >= 0 ? "+" : ""}
            {total.change}%
          </span>
        )}
      </div>
      <p className="text-4xl font-bold tracking-tight tabular-nums">{formatMoney(total.value)}</p>
      <p className="mt-3 text-sm text-muted-foreground">{period}</p>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
