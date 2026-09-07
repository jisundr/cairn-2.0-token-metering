import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

// shadcn/ui-style primitive, copied into the tree rather than pulled in as
// a runtime kit (03-architecture.md's Serving side).
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-mono inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-full bg-(--ink-soft) px-1 text-[10px] font-bold text-(--surface)",
        className,
      )}
      {...props}
    />
  );
}
