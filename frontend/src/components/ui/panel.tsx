import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-(--block-line) bg-white p-4 pb-4.5", className)}
      {...props}
    />
  );
}

export function PanelTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "font-label mb-3.5 flex items-center gap-2 text-xs tracking-wide text-(--ink-soft) uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}
