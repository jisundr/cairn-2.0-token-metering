import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

// shadcn/ui-style primitive, copied into the tree rather than pulled in as
// a runtime kit (03-architecture.md's Serving side).
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-label inline-flex items-center rounded-full border border-(--block-line) bg-(--block) px-2 py-0.5 text-[10px] text-(--ink-soft)",
        className,
      )}
      {...props}
    />
  );
}
