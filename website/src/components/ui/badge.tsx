import { cn } from "@/lib/utils";

function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-orange-500/40 bg-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-400",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
