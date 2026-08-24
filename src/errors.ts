/** Typed HTTP and client errors raised by the SDK. */

export class KupeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KupeError";
  }
}

export class APIError extends KupeError {
  readonly status: number;
  readonly body: unknown;
  readonly path: string;
  readonly method: string;

  constructor(status: number, message: string, opts: { body?: unknown; path?: string; method?: string } = {}) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.body = opts.body ?? null;
    this.path = opts.path ?? "";
    this.method = opts.method ?? "";
  }

  static fromResponse(status: number, body: unknown, path: string, method: string): APIError {
    const detail = extractDetail(body);
    const message = detail ? `Kupe API ${status}: ${detail}` : `Kupe API ${status}`;
    const Ctor = classForStatus(status);
    return new Ctor(status, message, { body, path, method });
  }
}

export class AuthenticationError extends APIError {
  constructor(status: number, message: string, opts?: { body?: unknown; path?: string; method?: string }) {
    super(status, message, opts);
    this.name = "AuthenticationError";
  }
}

export class PermissionError extends APIError {
  constructor(status: number, message: string, opts?: { body?: unknown; path?: string; method?: string }) {
    super(status, message, opts);
    this.name = "PermissionError";
  }
}

export class NotFoundError extends APIError {
  constructor(status: number, message: string, opts?: { body?: unknown; path?: string; method?: string }) {
    super(status, message, opts);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends APIError {
  constructor(status: number, message: string, opts?: { body?: unknown; path?: string; method?: string }) {
    super(status, message, opts);
    this.name = "RateLimitError";
  }
}

export class APIConnectionError extends KupeError {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "APIConnectionError";
    this.cause = cause;
  }
}

function classForStatus(status: number): typeof APIError {
  if (status === 401) return AuthenticationError;
  if (status === 403) return PermissionError;
  if (status === 404) return NotFoundError;
  if (status === 429) return RateLimitError;
  return APIError;
}

function extractDetail(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}
