"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FileText, Landmark } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type StatementOption = {
  id: string;
  label: string; // "Jan 2026 · Chase Account ••1234"
  account: string; // "Chase Account ••1234", what the account filter matches on
};

type Props = { statements: StatementOption[]; selectedId: string };

const control =
  "flex h-11 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-sm text-foreground/90 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring";

// Pick which uploaded statement the P&L covers. The account filter only
// narrows this list; the selected statement lives in the URL (?statement=).
export function StatementPicker({ statements, selectedId }: Props) {
  const router = useRouter();
  const accounts = [...new Set(statements.map((s) => s.account))];
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(accounts);

  const visible = statements.filter((s) => selectedAccounts.includes(s.account));
  const go = (id: string) => router.push(`/reports?statement=${id}`);

  function setAccounts(next: string[]) {
    setSelectedAccounts(next);
    // If the current statement's account was filtered out, jump to the
    // newest statement that's still visible (the list is newest first).
    const current = statements.find((s) => s.id === selectedId);
    if (current && !next.includes(current.account)) {
      const first = statements.find((s) => next.includes(s.account));
      if (first) go(first.id);
    }
  }

  const accountsLabel =
    selectedAccounts.length === accounts.length
      ? "All accounts"
      : `${selectedAccounts.length} of ${accounts.length} accounts`;

  return (
    <>
      {accounts.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={control}>
            <Landmark className="size-4 text-muted-foreground" />
            {accountsLabel}
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuCheckboxItem
              checked={selectedAccounts.length === accounts.length}
              onCheckedChange={(checked) => setAccounts(checked ? accounts : [])}
            >
              All accounts
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {accounts.map((account) => (
              <DropdownMenuCheckboxItem
                key={account}
                checked={selectedAccounts.includes(account)}
                onCheckedChange={(checked) =>
                  setAccounts(checked ? [...selectedAccounts, account] : selectedAccounts.filter((a) => a !== account))
                }
              >
                {account}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <label className={control}>
        <FileText className="size-4 text-muted-foreground" />
        <span className="sr-only">Statement</span>
        <select
          value={visible.some((s) => s.id === selectedId) ? selectedId : ""}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="max-w-[320px] bg-transparent outline-none [&_option]:bg-popover"
        >
          {visible.length === 0 && <option value="">No statements for the selected accounts</option>}
          {visible.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
