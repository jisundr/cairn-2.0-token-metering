import type { CallDetail } from "../api/types";

// Shared between the in-app drawer and the standalone /call/<session>/<n>
// page - same content, two presentations (03-architecture.md's Call-detail
// deep-linking). Renders the "transcript unavailable" contract from
// "Trace-row transcript unavailable" when `available` is false; that state
// isn't drawn in mockups/dashboard.html itself.
export function TraceDetailContent({ call }: { call: CallDetail }) {
  if (!call.available) {
    return (
      <p
        className="rounded-[4px] border border-dashed border-(--paper-line) px-3 py-2.5 text-[12.5px] text-(--ink-soft)"
        data-testid="transcript-unavailable"
      >
        Transcript unavailable — the session transcript has been moved or deleted since this call was captured.
        Token counts, cost, and duration above are unaffected; they were already recorded in{" "}
        <code className="rounded bg-(--block) px-1 py-0.5">tokens.db</code> at parse time.
      </p>
    );
  }

  return (
    <div className="border-l border-(--paper-line) pl-3" data-testid="transcript-available">
      <TraceDetailGroup label="prompt" text={call.prompt ?? ""} align="left" />
      <TraceDetailGroup label="response" text={call.response ?? ""} align="right" />
      <p className="mt-4 border-t border-dashed border-(--paper-line) pt-3 text-[10.5px] leading-normal text-(--ink-soft)">
        Read on demand from the session transcript — never duplicated into{" "}
        <code className="rounded bg-(--block) px-1 py-0.5">tokens.db</code>.
      </p>
    </div>
  );
}

function TraceDetailGroup({ label, text, align }: { label: string; text: string; align: "left" | "right" }) {
  const isRight = align === "right";
  return (
    <div className={"mt-3.5 max-w-[80%] first:mt-0 " + (isRight ? "ml-auto" : "mr-auto")}>
      <span
        className={
          "font-label mb-1.5 block text-[9.5px] tracking-wide text-(--ink-faint) uppercase " +
          (isRight ? "text-right" : "")
        }
      >
        {label}
      </span>
      <p
        className={
          "m-0 rounded-[4px] border border-(--paper-line) px-3 py-2.5 text-[12.5px] whitespace-pre-wrap " +
          (isRight ? "border-(--bone-dim) bg-(--bone-dim)" : "bg-(--window)")
        }
        data-testid={`trace-detail-${label}`}
      >
        {text || <span className="text-(--ink-soft) italic">(empty)</span>}
      </p>
    </div>
  );
}
