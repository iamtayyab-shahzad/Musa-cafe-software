import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-950/80 p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black text-white">{value}</p>
          {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="rounded-lg bg-orange-500/15 p-3 text-orange-400">
            {icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
