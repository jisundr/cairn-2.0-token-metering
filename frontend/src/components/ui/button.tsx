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
        "font-label inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border border-(--paper-line) px-2.5 py-1 text-[11.5px] font-semibold tracking-[.05em] text-(--ink-soft) uppercase transition-colors",
        variant === "pill" && "bg-(--window) hover:bg-(--block)",
        variant === "ghost" && "border-transparent bg-transparent hover:bg-(--block)",
        className,
      )}
      {...props}
    />
  );
}
