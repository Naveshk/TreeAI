/**
 * Central API client. Every request goes to the same-origin `/api` prefix (proxied to
 * FastAPI by Vite in development), and every failure becomes an `ApiError` built from the
 * backend's standard envelope: {"error": {"code", "message", "details"}}.
 */

export const API_PREFIX = "/api";

export const NETWORK_ERROR_MESSAGE =
  "Cannot reach the TreeMind AI server. Make sure the backend is running and try again.";
export const GENERIC_ERROR_MESSAGE = "Something went wrong on the server. Please try again.";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Build an ApiError from a parsed response body (envelope or anything else). */
export function errorFromBody(status: number, body: unknown): ApiError {
  if (isRecord(body) && isRecord(body.error)) {
    const { code, message, details } = body.error;
    if (typeof code === "string" && typeof message === "string") {
      return new ApiError(status, code, message, isRecord(details) ? details : {});
    }
  }
  if (status === 502 || status === 503 || status === 504) {
    return new ApiError(status, "NETWORK_ERROR", NETWORK_ERROR_MESSAGE);
  }
  return new ApiError(status, "UNEXPECTED_RESPONSE", GENERIC_ERROR_MESSAGE);
}

export function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", NETWORK_ERROR_MESSAGE);
  }

  const body = parseJson(await response.text());
  if (!response.ok) {
    throw errorFromBody(response.status, body);
  }
  return body as T;
}

/** A message that is safe and helpful to show to the user. */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.code === "INTERNAL_ERROR" ? GENERIC_ERROR_MESSAGE : error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
