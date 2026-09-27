import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { FileChartColumn, TrendingUp, type LucideIcon } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { SignInButton } from "@/components/sign-in-button";

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: FileChartColumn,
    title: "Automatic P&L",
    description: "Income, expenses by category and net income, built from your PDF or CSV statements.",
  },
  {
    icon: TrendingUp,
    title: "Inflation-adjusted totals",
    description: "Past spending shown in today’s dollars, using official CPI data.",
  },
];

export default async function LandingPage() {
  // already signed in: skip the landing page
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="relative grid min-h-svh flex-1 overflow-hidden lg:grid-cols-2">
      {/* soft glows in the corners: blue top-left, orange bottom-right */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full bg-chart-1/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-chart-2/10 blur-3xl" />

      {/* left: pitch */}
      <section className="relative mx-auto flex w-full max-w-2xl flex-col p-8 sm:p-12 lg:p-16">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-linear-to-b from-primary to-primary/60 text-xl font-semibold text-white shadow-lg shadow-primary/30">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight">Cashlapse</span>
        </div>

        {/* extra bottom padding lifts the block above true center, which reads better */}
        <div className="mt-16 lg:my-auto lg:pb-40">
          <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground">
            <span className="size-1.5 rounded-full bg-chart-1" />
            Personal finance, adjusted for inflation
          </span>
          <h1 className="mt-6 text-5xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
            Your spending, in{" "}
            <span className="bg-linear-to-r from-chart-1 to-chart-2 bg-clip-text text-transparent">
              today&apos;s dollars.
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Upload your bank statements and get a P&amp;L report adjusted for inflation, plus a clear view of what you spend on AI tools.
          </p>
        </div>
      </section>

      {/* right: what you get + sign in */}
      <section className="relative flex flex-col justify-center border-t border-border bg-card/50 p-8 sm:p-12 lg:border-t-0 lg:border-l lg:p-16">
        <div className="mx-auto w-full max-w-xl">
          <p className="text-sm font-semibold tracking-[0.15em] text-chart-1 uppercase">How it works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Everything from one upload.</h2>
          <p className="mt-3 text-muted-foreground">
            Upload a statement and Cashlapse reads it, sorts every transaction into a category and builds your report.
          </p>

          <ul className="mt-8 divide-y divide-border">
            {features.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-5 py-5 first:pt-0">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border">
                  <Icon className="size-5 text-chart-1" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-muted-foreground">{description}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <SignInButton />
          </div>
        </div>
      </section>
    </main>
  );
}
