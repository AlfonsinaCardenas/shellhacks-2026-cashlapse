import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, FileText, ListChecks, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { getStatements } from "@/lib/queries";
import { getSessionUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function StatementsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const statements = await getStatements(userId);

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
        {statements.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="font-medium">No statements yet</p>
            <p className="text-sm text-muted-foreground">
              Uploaded PDFs are saved here so you can open them any time.
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-xs tracking-[0.2em] text-muted-foreground uppercase">
                <th className="px-7 py-5 font-medium">File name</th>
                <th className="px-4 py-5 font-medium">Account</th>
                <th className="px-4 py-5 font-medium">Statement period</th>
                <th className="px-4 py-5 font-medium">Uploaded</th>
                <th className="px-4 py-5 font-medium">Status</th>
                <th className="px-7 py-5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="max-w-[320px] px-7 py-6">
                    <a
                      href={`/api/statements/${s.id}/file`}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-3 font-medium hover:underline"
                      title={`Open ${s.file_name}`}
                    >
                      <FileText className="size-5 shrink-0 text-info" />
                      <span className="truncate">{s.file_name}</span>
                    </a>
                  </td>
                  <td className="px-4 py-6 text-muted-foreground">
                    {s.bank_name ?? "Unknown bank"}
                    {s.account_identifier && ` ${s.account_identifier}`}
                  </td>
                  <td className="px-4 py-6 whitespace-nowrap text-muted-foreground tabular-nums">
                    {s.start_date && s.end_date ? `${formatDate(s.start_date)} – ${formatDate(s.end_date)}` : "—"}
                  </td>
                  <td className="px-4 py-6 whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatDate(s.uploaded_at)}
                  </td>
                  <td className="px-4 py-6">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-7 py-6">
                    <div className="flex items-center justify-end gap-5 text-sm font-medium whitespace-nowrap">
                      <a
                        href={`/api/statements/${s.id}/file`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-2 text-info hover:underline"
                      >
                        <ExternalLink className="size-4" />
                        View PDF
                      </a>
                      <Link href={`/review/${s.id}`} className="inline-flex items-center gap-2 text-info hover:underline">
                        <ListChecks className="size-4" />
                        {s.status === "NEEDS_REVIEW" ? "Review" : "Transactions"}
                        {s.transaction_count !== null && (
                          <span className="text-muted-foreground">({s.transaction_count})</span>
                        )}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
