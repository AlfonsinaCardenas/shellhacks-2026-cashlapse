import Link from "next/link";
import { Eye, FileText, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { mockStatements } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// TODO: replace mock data with a `statements` query filtered by the session user.
export default function StatementsPage() {
  return (
    <>
      <PageHeader eyebrow="History" title="Statements">
        <Link
          href="/upload"
          className={cn(buttonVariants(), "h-11 gap-2 rounded-xl px-5 text-[15px] shadow-lg shadow-primary/25")}
        >
          <Upload className="size-4" />
          Upload statements
        </Link>
      </PageHeader>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-xs tracking-[0.2em] text-muted-foreground uppercase">
              <th className="px-7 py-5 font-medium">File name</th>
              <th className="px-4 py-5 font-medium">Bank</th>
              <th className="px-4 py-5 font-medium">Date uploaded</th>
              <th className="px-4 py-5 font-medium">Status</th>
              <th className="px-7 py-5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {mockStatements.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-7 py-6">
                  <span className="flex items-center gap-3 font-medium">
                    <FileText className="size-5 shrink-0 text-info" />
                    {s.fileName}
                  </span>
                </td>
                <td className="px-4 py-6 text-muted-foreground">{s.bankName}</td>
                <td className="px-4 py-6 text-muted-foreground tabular-nums">{formatDate(s.uploadedAt)}</td>
                <td className="px-4 py-6">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-7 py-6 text-right">
                  {(s.status === "NEEDS_VERIFICATION" || s.status === "NEEDS_REVIEW") && (
                    <Link
                      href={`/review/${s.id}`}
                      className="inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap text-info hover:underline"
                    >
                      <Eye className="size-4" />
                      Review statement
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
