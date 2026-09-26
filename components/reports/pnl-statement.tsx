import type { ReactNode } from "react";
import { ArrowRightLeft, Sparkles } from "lucide-react";
import type { Pnl, PnlSectionResult } from "@/lib/financial-statements";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = { pnl: Pnl; periodLabel: string };

export function PnlStatement({ pnl, periodLabel }: Props) {
  const empty =
    !pnl.revenue.lines.length &&
    !pnl.operating.lines.length &&
    !pnl.other.lines.length &&
    !pnl.taxes.lines.length &&
    !pnl.personal.lines.length;

  return (
    <section className="rounded-2xl border border-border bg-card p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Profit &amp; loss</h2>
          <p className="mt-1 text-sm text-muted-foreground">{periodLabel} · Cash basis</p>
        </div>
        {pnl.aiToolSpend > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[13px] font-semibold text-info">
            <Sparkles className="size-3.5" />
            AI tool spend · {formatMoney(pnl.aiToolSpend)}
          </span>
        )}
      </div>

      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No confirmed transactions in this period.
        </p>
      ) : (
        <div className="text-sm tabular-nums">
          <Section data={pnl.revenue} totalLabel="Total revenue" />
          <Section data={pnl.operating} totalLabel="Total operating expenses" />
          <Result label="Operating income" value={pnl.operatingIncome} />
          {pnl.other.lines.length > 0 && <Section data={pnl.other} totalLabel="Total other, net" />}
          {pnl.taxes.lines.length > 0 && <Section data={pnl.taxes} totalLabel="Total taxes" />}
          <Result label="Net income" value={pnl.netIncome} strong />

          {pnl.personal.lines.length > 0 && (
            <>
              <Section data={pnl.personal} totalLabel="Total personal & draws" />
              <Result label="Left after personal spending" value={pnl.netAfterPersonal} />
            </>
          )}
        </div>
      )}

      {pnl.excluded.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm">
          <p className="mb-1.5 flex items-center gap-2 font-medium">
            <ArrowRightLeft className="size-4 text-muted-foreground" />
            Not counted as income or expense
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {pnl.excluded.map((e) => (
              <li key={e.category} className="flex justify-between gap-4 tabular-nums">
                <span>{e.category}</span>
                <span>
                  {formatMoney(e.moneyIn)} in · {formatMoney(e.moneyOut)} out
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground/80">
            Moving money between your own accounts, card payments, and loan principal don&apos;t change profit.
          </p>
        </div>
      )}
    </section>
  );
}

function Section({ data, totalLabel }: { data: PnlSectionResult; totalLabel: string }) {
  return (
    <div className="border-b border-border py-3">
      <p className="mb-2 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">{data.label}</p>
      {data.lines.length === 0 ? (
        <Row label={<span className="text-muted-foreground">None</span>} value={0} indent />
      ) : (
        data.lines.map((line) => (
          <Row
            key={line.category}
            indent
            value={line.amount}
            label={
              line.category === "AI Tools" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-info" />
                  AI Tools
                </span>
              ) : (
                line.category
              )
            }
          />
        ))
      )}
      <Row label={totalLabel} value={data.total} className="mt-1 font-semibold" />
    </div>
  );
}

function Row({
  label,
  value,
  indent,
  className,
}: {
  label: ReactNode;
  value: number;
  indent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-between gap-4 py-1", indent && "pl-4", className)}>
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}

function Result({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 border-b border-border py-3 font-semibold",
        strong && "text-base",
      )}
    >
      <span>{label}</span>
      <span className={value < 0 ? "text-destructive" : strong ? "text-success" : undefined}>{formatMoney(value)}</span>
    </div>
  );
}
