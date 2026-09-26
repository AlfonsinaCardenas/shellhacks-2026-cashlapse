import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { RotateCw } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";

export default async function LandingPage() {
  // already signed in: skip the landing page
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center">
        <span className="mx-auto mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
          <RotateCw className="size-6 text-white" strokeWidth={2.5} />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Cashlapse</h1>
        <p className="mt-2 mb-8 text-sm text-muted-foreground">
          Upload your bank statements and see what your spending is worth in today&apos;s dollars.
        </p>
        <SignInButton />
      </div>
    </main>
  );
}
