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
        "font-label inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-(--block-line) px-3 py-1.5 text-[11.5px] text-(--ink-soft) transition-colors",
        variant === "pill" && "bg-(--block) hover:bg-(--block-line)",
        variant === "ghost" && "border-transparent bg-transparent hover:bg-(--block)",
        className,
      )}
      {...props}
    />
  );
}
