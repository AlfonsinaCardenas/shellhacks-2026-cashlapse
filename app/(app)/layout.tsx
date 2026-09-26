import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { mockUser } from "@/lib/mock-data";

// Shared shell for signed-in pages. Route groups like (app) don't change URLs.
// TODO: redirect to "/" when there's no session, and pass the real session user.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar user={mockUser} />
      <main className="min-w-0 flex-1 px-10 py-10 lg:px-14">{children}</main>
    </div>
  );
}
