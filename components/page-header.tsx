import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  children?: ReactNode; // right-side actions
};

export function PageHeader({ eyebrow, title, children }: Props) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}
