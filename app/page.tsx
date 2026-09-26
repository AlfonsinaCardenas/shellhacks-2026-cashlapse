import Link from "next/link";
import { RotateCw } from "lucide-react";

// TODO: replace the link with NextAuth signIn("google").
export default function LandingPage() {
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
        <Link
          href="/dashboard"
          className="flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-white text-sm font-medium text-neutral-900 transition-colors hover:bg-white/90"
        >
          <GoogleIcon />
          Continue with Google
        </Link>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}
