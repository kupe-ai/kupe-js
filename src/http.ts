import { APIConnectionError, APIError } from "./errors.js";
import type { Query } from "./types.js";

export const DEFAULT_BASE_URL = "https://x.kupe.in";
export const DEFAULT_TIMEOUT_MS = 60_000;

/** Strip trailing slashes and a trailing `/v1` so paths always join as `{base}/v1/...`. */
export function normalizeBaseUrl(url: string): string {
  let value = url.trim();
  if (!value) return DEFAULT_BASE_URL;
  value = value.replace(/\/+$/, "");
  if (value.toLowerCase().endsWith("/v1")) {
    value = value.slice(0, -3).replace(/\/+$/, "");
  }
  return value;
}

/** Force every request onto `/v1/...` so an absolute path cannot drop the prefix. */
export function toV1Path(path: string): string {
  let p = path.trim();
  if (!p) throw new Error("API path is empty");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p === "/v1" || p.startsWith("/v1/")) return p;
  return `/v1${p}`;
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${toV1Path(path)}`;
}

export function encodeQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export type HttpRequestInit = {
  method: string;
  path: string;
  query?: Query;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  binary?: boolean;
  timeoutMs?: number;
};

export type HttpConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetch: typeof fetch;
};

export async function request<T>(config: HttpConfig, init: HttpRequestInit): Promise<T> {
  const path = toV1Path(init.path);
  const url = `${normalizeBaseUrl(config.baseUrl)}${path}${encodeQuery(init.query)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    ...init.headers,
  };

  let body: BodyInit | undefined;
  if (init.form) {
    body = init.form;
  } else if (init.body !== undefined && init.body !== null) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }

  const timeoutMs = init.timeoutMs ?? config.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await config.fetch(url, {
      method: init.method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new APIConnectionError(`Request timed out after ${timeoutMs}ms: ${init.method} ${path}`);
    }
    throw new APIConnectionError(
      `Network error: ${init.method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 400) {
    let parsed: unknown = await response.text();
    try {
      parsed = parsed ? JSON.parse(parsed as string) : null;
    } catch {
      // keep text
    }
    throw APIError.fromResponse(response.status, parsed, path, init.method);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (init.binary) {
    return (await response.arrayBuffer()) as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType || contentType.includes("application/json")) {
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
  if (contentType.startsWith("text/")) {
    return (await response.text()) as T;
  }
  return (await response.arrayBuffer()) as T;
}

export function toBlobPart(data: ArrayBuffer | Uint8Array | Blob | Buffer): BlobPart {
  if (data instanceof Blob) return data;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return Uint8Array.from(data) as BlobPart;
  }
  return data as BlobPart;
}
