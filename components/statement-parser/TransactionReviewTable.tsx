"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import {
  CATEGORIES,
  checkBalance,
  parseTransaction,
  toAmount,
  type AccountType,
  type ApiError,
  type Category,
  type ConfirmResponse,
  type ExtractedTransaction,
  type TransactionType,
} from "@/lib/statement-types";
import { cn } from "@/lib/utils";

type Props = {
  statementId: string;
  accountType: AccountType;
  startingBalance: number;
  endingBalance: number;
  transactions: ExtractedTransaction[];
};

// Amounts are kept as strings while editing so "12." doesn't snap to "12".
type Row = Omit<ExtractedTransaction, "nominal_amount"> & { key: number; amount: string };

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&>option]:bg-popover";

let nextKey = 0;
const toRow = (t: ExtractedTransaction): Row => {
  const { nominal_amount, ...rest } = t;
  return { ...rest, key: nextKey++, amount: nominal_amount.toFixed(2) };
};
const fromRow = (row: Row) => {
  const { key: _key, amount, ...rest } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, nominal_amount: amount };
};

export function TransactionReviewTable({ statementId, accountType, startingBalance, endingBalance, transactions }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => transactions.map(toRow));
  const [starting, setStarting] = useState(startingBalance.toFixed(2));
  const [ending, setEnding] = useState(endingBalance.toFixed(2));
  const [saving, setSaving] = useState(false);

  const edit = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Row-level validation with the same rules the server applies.
  const errors = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      const result = parseTransaction(fromRow(r));
      if (!result.ok) map.set(r.key, result.error);
    }
    return map;
  }, [rows]);

  const startingNum = toAmount(starting);
  const endingNum = toAmount(ending);

  const balance = useMemo(
    () =>
      checkBalance(
        accountType,
        startingNum ?? 0,
        endingNum ?? 0,
        rows.map((r) => ({ transaction_type: r.transaction_type, nominal_amount: Math.abs(toAmount(r.amount) ?? 0) })),
      ),
    [accountType, startingNum, endingNum, rows],
  );

  const aiRows = rows.filter((r) => r.is_ai_tool);
  const aiTotal = aiRows.reduce((sum, r) => sum + Math.abs(toAmount(r.amount) ?? 0), 0);
  const canSubmit = !saving && errors.size === 0 && startingNum !== null && endingNum !== null;

  async function confirm() {
    setSaving(true);
    try {
      const res = await fetch("/api/statements/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement_id: statementId,
          starting_balance: startingNum,
          ending_balance: endingNum,
          transactions: rows.map(fromRow),
        }),
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
          description: `Off by ${formatMoney(Math.abs(data.balance.difference))}. You can fix rows and confirm again.`,
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
          <h2 className="mb-1 text-lg font-semibold">Extracted transactions</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} transactions · Edit anything the AI got wrong, then save.
          </p>
        </div>
        {aiRows.length > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[13px] font-semibold text-info">
            <Sparkles className="size-3.5" />
            {aiRows.length} AI tool {aiRows.length === 1 ? "charge" : "charges"} · {formatMoney(aiTotal)}
          </span>
        )}
      </div>

      <BalanceBanner
        accountType={accountType}
        balance={balance}
        starting={starting}
        ending={ending}
        onStarting={setStarting}
        onEnding={setEnding}
        invalid={startingNum === null || endingNum === null}
      />

      <div className="mt-5 rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="text-xs tracking-[0.15em] text-muted-foreground uppercase hover:bg-transparent">
              <TableHead className="w-[150px] pl-4">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[190px]">Category</TableHead>
              <TableHead className="w-[120px]">Type</TableHead>
              <TableHead className="w-[130px] text-right">Amount</TableHead>
              <TableHead className="w-[60px] pr-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No transactions. Add one below, or confirm if this statement really had no activity.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const error = errors.get(r.key);
              return (
                <TableRow key={r.key} className={cn("align-top", r.is_ai_tool && "bg-primary/[0.06]")}>
                  <TableCell className="pl-4">
                    <Input
                      type="date"
                      aria-label="Date"
                      value={r.transaction_time}
                      onChange={(e) => edit(r.key, { transaction_time: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="min-w-[260px] whitespace-normal">
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label="Description"
                        value={r.clean_description}
                        onChange={(e) => edit(r.key, { clean_description: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => edit(r.key, { is_ai_tool: !r.is_ai_tool })}
                        aria-pressed={r.is_ai_tool}
                        title={r.is_ai_tool ? "Marked as an AI tool. Click to unmark." : "Mark as an AI tool"}
                        className={cn(
                          "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors",
                          r.is_ai_tool
                            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/40"
                            : "border border-dashed border-border text-muted-foreground/60 hover:text-foreground",
                        )}
                      >
                        <Sparkles className="size-3" />
                        AI tool
                      </button>
                    </div>
                    {r.raw_description && r.raw_description !== r.clean_description && (
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70" title={r.raw_description}>
                        {r.raw_description}
                      </p>
                    )}
                    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                  </TableCell>
                  <TableCell>
                    <select
                      aria-label="Category"
                      className={selectClass}
                      value={r.category}
                      onChange={(e) => edit(r.key, { category: e.target.value as Category })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      aria-label="Type"
                      className={cn(selectClass, r.transaction_type === "INCOME" ? "text-success" : "text-foreground")}
                      value={r.transaction_type}
                      onChange={(e) => edit(r.key, { transaction_type: e.target.value as TransactionType })}
                    >
                      <option value="INCOME">Income</option>
                      <option value="EXPENSE">Expense</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      aria-label="Amount"
                      aria-invalid={error?.includes("amount") || undefined}
                      className="text-right tabular-nums"
                      value={r.amount}
                      onChange={(e) => edit(r.key, { amount: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="pr-4">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete transaction"
                      onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              toRow({
                transaction_time: prev[prev.length - 1]?.transaction_time ?? new Date().toISOString().slice(0, 10),
                raw_description: "",
                clean_description: "",
                category: "Other",
                is_ai_tool: false,
                transaction_type: "EXPENSE",
                nominal_amount: 0,
              }),
            ])
          }
        >
          <Plus />
          Add transaction
        </Button>

        <div className="flex items-center gap-3">
          {errors.size > 0 && (
            <span className="text-sm text-destructive">
              Fix {errors.size} {errors.size === 1 ? "row" : "rows"} before saving
            </span>
          )}
          <Button
            onClick={confirm}
            disabled={!canSubmit}
            className="h-11 gap-2 rounded-xl px-5 text-[15px] shadow-lg shadow-primary/25"
          >
            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Confirm &amp; Save to Ledger
          </Button>
        </div>
      </div>
    </section>
  );
}

type BannerProps = {
  accountType: AccountType;
  balance: ReturnType<typeof checkBalance>;
  starting: string;
  ending: string;
  onStarting: (v: string) => void;
  onEnding: (v: string) => void;
  invalid: boolean;
};

function BalanceBanner({ accountType, balance, starting, ending, onStarting, onEnding, invalid }: BannerProps) {
  const ok = balance.matches && !invalid;
  const card = accountType === "CREDIT_CARD";

  return (
    <div
      className={cn(
        "rounded-xl border px-5 py-4",
        ok ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10",
      )}
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {ok ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warning" />}
        {ok
          ? "Balances match. Every dollar is accounted for."
          : invalid
            ? "Enter valid starting and ending balances."
            : `The transactions are off by ${formatMoney(Math.abs(balance.difference))}. Look for a missing or duplicated row.`}
      </p>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 text-sm tabular-nums">
        <MoneyField label="Starting" value={starting} onChange={onStarting} />
        <Op>+</Op>
        <Figure label={card ? "Charges" : "Credits"} value={card ? balance.debits : balance.credits} />
        <Op>−</Op>
        <Figure label={card ? "Payments & credits" : "Debits"} value={card ? balance.credits : balance.debits} />
        <Op>=</Op>
        <Figure label="Expected ending" value={balance.expectedEnding} />
        <Op>{ok ? "=" : "≠"}</Op>
        <MoneyField label="Statement ending" value={ending} onChange={onEnding} />
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
      <p className="flex h-8 items-center font-semibold">{formatMoney(value)}</p>
    </div>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <Input
        inputMode="decimal"
        className="w-32 text-right font-semibold tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={toAmount(value) === null || undefined}
      />
    </label>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return <span className="flex h-8 items-center text-muted-foreground">{children}</span>;
}
