"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

type Props = {
  value: string;
  groups: { group: string; options: { value: string; label: string }[] }[];
};

export function PeriodPicker({ value, groups }: Props) {
  const router = useRouter();

  return (
    <label className="flex h-11 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-sm text-foreground/90 focus-within:ring-2 focus-within:ring-ring">
      <CalendarDays className="size-4 text-muted-foreground" />
      <span className="sr-only">Report period</span>
      <select
        value={value}
        onChange={(e) => router.push(`/reports?period=${e.target.value}`)}
        className="bg-transparent outline-none [&_option]:bg-popover"
      >
        {groups.map(({ group, options }) => (
          <optgroup key={group} label={group}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
