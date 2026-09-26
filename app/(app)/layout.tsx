import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { authOptions } from "@/lib/auth";

// Shared shell for signed-in pages. Route groups like (app) don't change URLs.
// The session check lives here, not in proxy.ts: next-auth v4's withAuth only supports JWT sessions.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  const user = { name: session.user.name ?? null, email: session.user.email ?? "" };

  return (
    <div className="flex min-h-screen">
      <AppSidebar user={user} />
      <main className="min-w-0 flex-1 px-10 py-10 lg:px-14">{children}</main>
    </div>
  );
}
