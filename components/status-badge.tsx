import type { StatementStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STYLES: Record<StatementStatus, { label: string; className: string }> = {
  PROCESSING: { label: "Processing", className: "bg-info/10 text-info" },
  NEEDS_REVIEW: { label: "Ready to review", className: "bg-info/10 text-info" },
  NEEDS_VERIFICATION: { label: "Needs verification", className: "bg-warning/10 text-warning" },
  COMPLETED: { label: "Completed", className: "bg-success/10 text-success" },
  FAILED: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

export function StatusBadge({ status }: { status: StatementStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold whitespace-nowrap",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
