import { vi } from "vitest";

export interface RecordedCall {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

type Reply = { status?: number; body?: unknown };
type Handler = Reply | ((call: RecordedCall) => Reply | Promise<Reply>);

/**
 * Stub `fetch` with handlers keyed by "METHOD /api/path" (optionally with "?query").
 * Unmatched requests fail loudly with a 500 envelope.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const call = { method, path: url.pathname, search: url.search, body };
    calls.push(call);
    const handler = handlers[`${method} ${url.pathname}${url.search}`] ?? handlers[`${method} ${url.pathname}`];
    if (!handler) {
      return new Response(
        JSON.stringify({ error: { code: "NOT_MOCKED", message: `No mock for ${method} ${url.pathname}${url.search}`, details: {} } }),
        { status: 500 },
      );
    }
    const reply = typeof handler === "function" ? await handler(call) : handler;
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? null), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

export const envelope = (code: string, message: string, details: Record<string, unknown> = {}) => ({
  error: { code, message, details },
});
