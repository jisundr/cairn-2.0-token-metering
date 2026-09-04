// Cold-start state: `.cairn/tokens.db` is empty or missing, no session has
// completed a Stop event yet (03-architecture.md's Cold-start / empty
// tokens.db). server.py's rollup/session endpoints return empty results
// rather than erroring; this is that empty-results view.
export function EmptyState() {
  return (
    <div
      data-testid="empty-state"
      className="mx-auto my-8 max-w-[460px] rounded-xl border-[1.5px] border-dashed border-(--paper-line) bg-(--window) px-7.5 py-8.5 text-center"
    >
      <div className="font-mono mx-auto mb-4 flex h-11.5 w-11.5 items-center justify-center rounded-full border-[1.5px] border-dashed border-(--paper-line) text-lg text-(--ink-soft)">
        ∅
      </div>
      <h3 className="m-0 mb-2 text-base font-semibold">No sessions captured yet</h3>
      <p className="m-0 mb-5.5 text-[13px] leading-normal text-(--ink-soft)">
        Looking for{" "}
        <code className="font-mono rounded bg-(--block) px-1 py-0.5">.cairn/tokens.db</code> — it's empty or
        doesn't exist yet in this project.
      </p>
      <div className="mb-5.5 flex flex-col gap-2.5 text-left">
        <EmptyStep n={1} text="Run a normal cairn session — ask for a feature, a fix, anything that dispatches an agent." />
        <EmptyStep n={2} text="Let it finish. Capture fires silently when the session ends — nothing to watch for." />
        <EmptyStep n={3} text="Come back here, or leave this tab open — it polls automatically once data exists." />
      </div>
      <div className="font-label border-t border-dashed border-(--paper-line) pt-3.5 text-[10.5px] text-(--ink-soft)">
        Capture is passive and advisory-only — it never blocks or alters a session.
      </div>
    </div>
  );
}

function EmptyStep({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-2.5 text-[12.5px]">
      <span className="font-mono flex h-4.5 w-4.5 flex-none items-center justify-center rounded-full border border-(--paper-line) text-[10px] text-(--ink-soft)">
        {n}
      </span>
      {text}
    </div>
  );
}
