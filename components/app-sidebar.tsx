"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { FileText, LayoutGrid, ListChecks, LogOut, Scale, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/reports", label: "Reports", icon: Scale },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/review", label: "Review", icon: ListChecks },
  { href: "/statements", label: "Statements", icon: FileText },
];

type Props = { user: { name: string | null; email: string } };

export function AppSidebar({ user }: Props) {
  const pathname = usePathname();
  // Google may not share a name; fall back to the email
  const displayName = user.name || user.email;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6">
      <Link href="/dashboard" className="mb-10 flex items-center gap-3 px-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-linear-to-b from-primary to-primary/60 text-lg font-semibold text-white shadow-lg shadow-primary/30">
          C
        </span>
        <span className="text-xl font-semibold tracking-tight">Cashlapse</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-3 border-t border-sidebar-border px-2 pt-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-semibold">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}
