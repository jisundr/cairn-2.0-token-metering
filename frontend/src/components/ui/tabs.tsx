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
    <div
      className="mb-3.5 inline-flex gap-1 rounded-md border border-(--border) bg-(--surface-muted) p-0.5 text-[12.5px]"
      data-testid={rest["data-testid"]}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-testid={rest["data-testid"] ? `${rest["data-testid"]}-${opt.value}` : undefined}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "cursor-pointer rounded-[5px] px-2.5 py-1 font-medium text-(--ink-soft) transition-colors select-none",
            value === opt.value && "bg-(--surface) text-(--accent)",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
