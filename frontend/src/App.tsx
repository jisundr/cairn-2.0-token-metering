import { useMemo, useState } from "react";
import { CallPage } from "./components/CallPage";
import { Dashboard } from "./Dashboard";
import { type CallRoute, callRoutePath, parseCallRoute } from "./routing";

// Client-side route for a trace row's detail: the entry route on direct
// load/refresh renders as a standalone page (CallPage); reached via in-app
// navigation from the dashboard it renders as a drawer instead, with the
// dashboard still mounted underneath (03-architecture.md's Call-detail
// deep-linking; plan.md's Actionable 4).
export function App() {
  const initialRoute = useMemo(() => parseCallRoute(window.location.pathname), []);
  const [standaloneCall, setStandaloneCall] = useState<CallRoute | null>(initialRoute);
  const [drawerCall, setDrawerCall] = useState<CallRoute | null>(null);

  function openCall(sessionId: string, n: number) {
    setDrawerCall({ sessionId, n });
    window.history.pushState({}, "", callRoutePath(sessionId, n));
  }

  function closeDrawer() {
    setDrawerCall(null);
    window.history.pushState({}, "", "/");
  }

  function viewFullPage() {
    if (drawerCall) setStandaloneCall(drawerCall);
    setDrawerCall(null);
  }

  function backToDashboard() {
    setStandaloneCall(null);
    window.history.pushState({}, "", "/");
  }

  if (standaloneCall) {
    return <CallPage sessionId={standaloneCall.sessionId} n={standaloneCall.n} onBack={backToDashboard} />;
  }

  return (
    <Dashboard
      onOpenCall={openCall}
      drawerCall={drawerCall}
      onCloseDrawer={closeDrawer}
      onViewFullPage={viewFullPage}
    />
  );
}
