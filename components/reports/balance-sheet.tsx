import { AlertTriangle, Clock, CreditCard, Landmark } from "lucide-react";
import type { BalanceSheet as Sheet, BalanceSheetLine } from "@/lib/financial-statements";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BalanceSheet({ sheet }: { sheet: Sheet }) {
  const empty = !sheet.assets.length && !sheet.liabilities.length;

  return (
    <section className="rounded-2xl border border-border bg-card p-7">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Balance sheet</h2>
        <p className="mt-1 text-sm text-muted-foreground">As of {formatDate(sheet.asOf)} · From statement balances</p>
      </div>

      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No confirmed statements ending on or before this date.
        </p>
      ) : (
        <div className="text-sm tabular-nums">
          <Group title="Assets" icon={Landmark} lines={sheet.assets} total={sheet.totalAssets} totalLabel="Total assets" />
          <Group
            title="Liabilities"
            icon={CreditCard}
            lines={sheet.liabilities}
            total={sheet.totalLiabilities}
            totalLabel="Total liabilities"
          />
          <div className="flex justify-between gap-4 py-3 text-base font-semibold">
            <span>Equity (net worth)</span>
            <span className={sheet.equity < 0 ? "text-destructive" : "text-success"}>{formatMoney(sheet.equity)}</span>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground/80">
        Only accounts you&apos;ve uploaded statements for. Equipment, money owed to you, and loans without statements
        aren&apos;t included.
      </p>
    </section>
  );
}

function Group({
  title,
  icon: Icon,
  lines,
  total,
  totalLabel,
}: {
  title: string;
  icon: typeof Landmark;
  lines: BalanceSheetLine[];
  total: number;
  totalLabel: string;
}) {
  return (
    <div className="border-b border-border py-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {title}
      </p>
      {lines.length === 0 && <p className="py-1 pl-4 text-muted-foreground">None</p>}
      {lines.map((line) => (
        <div key={line.label} className="flex justify-between gap-4 py-1.5 pl-4">
          <span className="min-w-0">
            <span className="block truncate">{line.label}</span>
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                line.stale || line.needs_verification ? "text-warning" : "text-muted-foreground",
              )}
            >
              {line.needs_verification ? (
                <>
                  <AlertTriangle className="size-3" />
                  Balances didn&apos;t add up · {formatDate(line.as_of)}
                </>
              ) : line.stale ? (
                <>
                  <Clock className="size-3" />
                  Last statement {formatDate(line.as_of)}, may be out of date
                </>
              ) : (
                <>Statement ending {formatDate(line.as_of)}</>
              )}
            </span>
          </span>
          <span>{formatMoney(line.ending_balance)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-4 py-1 font-semibold">
        <span>{totalLabel}</span>
        <span>{formatMoney(total)}</span>
      </div>
    </div>
  );
}
