import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "pill" | "ghost";
}

export function Button({ className, variant = "pill", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-(--border) px-2.5 py-1.5 text-[12.5px] font-medium text-(--ink-soft) transition-colors",
        variant === "pill" && "bg-(--surface) hover:bg-(--surface-muted) hover:text-(--ink)",
        variant === "ghost" && "border-transparent bg-transparent hover:bg-(--surface-muted) hover:text-(--ink)",
        className,
      )}
      {...props}
    />
  );
}
