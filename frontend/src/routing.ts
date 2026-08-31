// Client-side route for a trace row's detail: a drawer when reached via
// in-app navigation, a standalone page when it's the entry route on direct
// load/refresh (03-architecture.md's Call-detail deep-linking). server.py
// serves index.html for any non-API path, so this never needs a server
// round-trip to resolve.
const CALL_ROUTE_RE = /^\/call\/([^/]+)\/(\d+)$/;

export interface CallRoute {
  sessionId: string;
  n: number;
}

export function parseCallRoute(pathname: string): CallRoute | null {
  const match = CALL_ROUTE_RE.exec(pathname);
  if (!match) return null;
  return { sessionId: decodeURIComponent(match[1]), n: Number(match[2]) };
}

export function callRoutePath(sessionId: string, n: number): string {
  return `/call/${encodeURIComponent(sessionId)}/${n}`;
}
