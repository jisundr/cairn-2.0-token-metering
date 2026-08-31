import { cn } from "../../lib/utils";

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "data-testid"?: string;
}

// Radio-group-styled tab bar, matching the mockup's `.chart-tabs` (a set of
// mutually exclusive labels rather than a single active-tab underline).
export function Tabs<T extends string>({ options, value, onChange, ...rest }: TabsProps<T>) {
  return (
    <div className="font-label mb-3.5 flex text-[10.5px]" data-testid={rest["data-testid"]}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          data-testid={rest["data-testid"] ? `${rest["data-testid"]}-${opt.value}` : undefined}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "cursor-pointer border border-(--block-line) px-2.5 py-1.5 tracking-wide text-(--ink-soft) uppercase select-none",
            i > 0 && "border-l-0",
            i === 0 && "rounded-l-md",
            i === options.length - 1 && "rounded-r-md",
            value === opt.value && "relative z-1 border-(--blue) bg-white font-bold text-(--ink)",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
