"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import {
  checkBalance,
  type AccountType,
  type ApiError,
  type BalanceCheck,
  type ConfirmResponse,
  type ExtractedTransaction,
} from "@/lib/statement-types";
import { cn } from "@/lib/utils";

type Props = {
  statementId: string;
  accountType: AccountType;
  startingBalance: number;
  endingBalance: number;
  transactions: ExtractedTransaction[];
  saved: boolean; // already written to the ledger
};

// Read-only view of what was extracted from the statement. Transactions come
// straight from the PDF and can't be changed; the only action is saving them.
export function TransactionReviewTable({
  statementId,
  accountType,
  startingBalance,
  endingBalance,
  transactions,
  saved,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const balance = checkBalance(accountType, startingBalance, endingBalance, transactions);
  const aiRows = transactions.filter((t) => t.is_ai_tool);
  const aiTotal = aiRows.reduce((sum, t) => sum + t.nominal_amount, 0);

  async function confirm() {
    setSaving(true);
    try {
      const res = await fetch("/api/statements/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement_id: statementId }),
      });
      const data = (await res.json().catch(() => ({ error: "Unexpected server response." }))) as ConfirmResponse | ApiError;

      if (!res.ok || "error" in data) {
        toast.error("Couldn't save to the ledger", { description: "error" in data ? data.error : undefined });
        return;
      }
      if (data.status === "COMPLETED") {
        toast.success(`Saved ${data.inserted} transactions to your ledger`, { description: "Balances match." });
      } else {
        toast.warning(`Saved ${data.inserted} transactions, marked for verification`, {
          description: `The transactions are off by ${formatMoney(Math.abs(data.balance.difference))} from the statement's balances.`,
        });
      }
      router.refresh();
    } catch {
      toast.error("Couldn't save to the ledger", { description: "Network error. Check your connection." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="mb-1 text-lg font-semibold">Transactions</h2>
          <p className="text-sm text-muted-foreground">
            {transactions.length} transactions extracted from the statement
          </p>
        </div>
        {aiRows.length > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[13px] font-semibold text-info">
            <Sparkles className="size-3.5" />
            {aiRows.length} AI tool {aiRows.length === 1 ? "charge" : "charges"} · {formatMoney(aiTotal)}
          </span>
        )}
      </div>

      <BalanceBanner accountType={accountType} balance={balance} />

      <div className="mt-5 rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="text-xs tracking-[0.15em] text-muted-foreground uppercase hover:bg-transparent">
              <TableHead className="w-[130px] pl-4">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[190px]">Category</TableHead>
              <TableHead className="w-[140px] pr-4 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No transactions were found on this statement.
                </TableCell>
              </TableRow>
            )}
            {transactions.map((t, i) => (
              <TableRow key={i} className={cn("align-top", t.is_ai_tool && "bg-primary/[0.06]")}>
                <TableCell className="pl-4 whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatDate(t.transaction_time)}
                </TableCell>
                <TableCell className="min-w-[260px] whitespace-normal">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{t.clean_description}</span>
                    {t.is_ai_tool && (
                      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-[11px] font-semibold text-primary-foreground shadow-sm shadow-primary/40">
                        <Sparkles className="size-3" />
                        AI tool
                      </span>
                    )}
                  </span>
                  {t.raw_description !== t.clean_description && (
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70" title={t.raw_description}>
                      {t.raw_description}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{t.category}</TableCell>
                <TableCell
                  className={cn(
                    "pr-4 text-right font-medium tabular-nums",
                    t.transaction_type === "INCOME" && "text-success",
                  )}
                >
                  {t.transaction_type === "INCOME" ? "+" : "−"}
                  {formatMoney(t.nominal_amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-5 flex justify-end">
        {saved ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" />
            Saved to your ledger
          </p>
        ) : (
          <Button
            onClick={confirm}
            disabled={saving}
            className="h-11 gap-2 rounded-xl px-5 text-[15px] shadow-lg shadow-primary/25"
          >
            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Save to Ledger
          </Button>
        )}
      </div>
    </section>
  );
}

function BalanceBanner({ accountType, balance }: { accountType: AccountType; balance: BalanceCheck }) {
  const ok = balance.matches;
  const card = accountType === "CREDIT_CARD";

  return (
    <div className={cn("rounded-xl border px-5 py-4", ok ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10")}>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {ok ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warning" />}
        {ok
          ? "Balances match. Every dollar is accounted for."
          : `The transactions are off by ${formatMoney(Math.abs(balance.difference))} from the statement's balances.`}
      </p>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 text-sm tabular-nums">
        <Figure label="Starting" value={balance.starting} />
        <Op>+</Op>
        <Figure label={card ? "Charges" : "Credits"} value={card ? balance.debits : balance.credits} />
        <Op>−</Op>
        <Figure label={card ? "Payments & credits" : "Debits"} value={card ? balance.credits : balance.debits} />
        <Op>=</Op>
        <Figure label="Expected ending" value={balance.expectedEnding} />
        <Op>{ok ? "=" : "≠"}</Op>
        <Figure label="Statement ending" value={balance.ending} />
      </div>
      {card && (
        <p className="mt-3 text-xs text-muted-foreground">
          Credit card: the balance is what you owe, so charges add to it and payments reduce it.
        </p>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{formatMoney(value)}</p>
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return <span className="pb-0.5 text-muted-foreground">{children}</span>;
}
