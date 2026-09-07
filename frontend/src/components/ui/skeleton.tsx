import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

// Loading placeholder for panels/cards during the initial fetch, so a slow
// load reads as "still coming" rather than a flash of zero-value defaults.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-[3px] bg-(--surface-muted)", className)} {...props} />;
}
