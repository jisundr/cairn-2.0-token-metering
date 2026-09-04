import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

// shadcn/ui-style primitive, copied into the tree rather than pulled in as
// a runtime kit (03-architecture.md's Serving side).
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-mono inline-flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full border-[1.5px] border-(--ink-soft) text-[10px] font-bold text-(--ink-soft)",
        className,
      )}
      {...props}
    />
  );
}
