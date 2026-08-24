import { PermissionError } from "./errors.js";
import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, normalizeBaseUrl, request, toBlobPart } from "./http.js";
import type { RealtimeSocketConstructor } from "./realtime.js";
import type { AuthKind, KupeOptions, Me, Query, UploadFile } from "./types.js";

export type Transport = {
  get<T>(path: string, query?: Query): Promise<T>;
  post<T>(path: string, body?: unknown, query?: Query): Promise<T>;
  patch<T>(path: string, body?: unknown, query?: Query): Promise<T>;
  delete<T>(path: string, query?: Query, body?: unknown): Promise<T>;
  postForm<T>(path: string, form: FormData, query?: Query): Promise<T>;
  patchForm<T>(path: string, form: FormData, query?: Query): Promise<T>;
  getBinary(path: string, query?: Query): Promise<ArrayBuffer>;
  postBinary(path: string, body?: unknown, query?: Query): Promise<ArrayBuffer>;
  requireOrgId(explicit?: string): Promise<string>;
  requireProjectId(explicit?: string): Promise<string>;
  requireJwt(action: string): Promise<void>;
  me(): Promise<Me>;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly webSocket?: RealtimeSocketConstructor;
};

export class ApiClient implements Transport {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly fetchImpl: typeof fetch;
  readonly webSocket?: RealtimeSocketConstructor;

  private _orgId?: string;
  private _projectId?: string;
  private _auth?: AuthKind;
  private _mePromise?: Promise<Me>;

  constructor(opts: KupeOptions = {}) {
    const apiKey = opts.apiKey ?? env("KUPE_API_KEY");
    if (!apiKey) {
      throw new Error("Missing API key. Pass apiKey or set KUPE_API_KEY.");
    }
    this.apiKey = apiKey;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl ?? env("KUPE_BASE_URL") ?? DEFAULT_BASE_URL);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.webSocket = opts.WebSocket;
    this._orgId = opts.orgId;
    this._projectId = opts.projectId;
  }

  get orgIdValue(): string | undefined {
    return this._orgId;
  }

  get projectIdValue(): string | undefined {
    return this._projectId;
  }

  get authKind(): AuthKind | undefined {
    return this._auth;
  }

  async me(): Promise<Me> {
    if (!this._mePromise) {
      this._mePromise = this.get<Me>("/me").then((data) => {
        if (!this._orgId && data.org_id) this._orgId = data.org_id;
        if (!this._projectId && data.project_id) this._projectId = data.project_id;
        if (data.auth) this._auth = data.auth;
        return data;
      });
    }
    return this._mePromise;
  }

  async requireOrgId(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (this._orgId) return this._orgId;
    const me = await this.me();
    if (!me.org_id) {
      throw new Error("Could not determine org_id. Pass org_id or call GET /v1/me.");
    }
    return me.org_id;
  }

  async requireProjectId(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (this._projectId) return this._projectId;
    const me = await this.me();
    if (!me.project_id) {
      throw new Error("Could not determine project_id. Pass project_id or call GET /v1/me.");
    }
    return me.project_id;
  }

  async requireJwt(action: string): Promise<void> {
    if (this._auth === "jwt") return;
    if (this._auth === "api_key" || looksLikeApiKey(this.apiKey)) {
      throw new PermissionError(
        403,
        `${action} requires a user JWT — API keys cannot own a voice.`,
      );
    }
    try {
      const me = await this.me();
      if (me.auth === "jwt") return;
    } catch {
      // fall through with a clear error
    }
    throw new PermissionError(
      403,
      `${action} requires a user JWT — API keys cannot own a voice.`,
    );
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return request<T>(this.http(), { method: "GET", path, query });
  }

  post<T>(path: string, body?: unknown, query?: Query): Promise<T> {
    return request<T>(this.http(), { method: "POST", path, body, query });
  }

  patch<T>(path: string, body?: unknown, query?: Query): Promise<T> {
    return request<T>(this.http(), { method: "PATCH", path, body, query });
  }

  delete<T>(path: string, query?: Query, body?: unknown): Promise<T> {
    return request<T>(this.http(), { method: "DELETE", path, query, body });
  }

  postForm<T>(path: string, form: FormData, query?: Query): Promise<T> {
    return request<T>(this.http(), { method: "POST", path, form, query });
  }

  patchForm<T>(path: string, form: FormData, query?: Query): Promise<T> {
    return request<T>(this.http(), { method: "PATCH", path, form, query });
  }

  getBinary(path: string, query?: Query): Promise<ArrayBuffer> {
    return request<ArrayBuffer>(this.http(), { method: "GET", path, query, binary: true });
  }

  postBinary(path: string, body?: unknown, query?: Query): Promise<ArrayBuffer> {
    return request<ArrayBuffer>(this.http(), { method: "POST", path, body, query, binary: true });
  }

  private http() {
    return {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      fetch: this.fetchImpl,
    };
  }
}

export function looksLikeApiKey(key: string): boolean {
  return key.startsWith("sk-kupe-");
}

export function env(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function fileToForm(
  file: UploadFile,
  extra: Record<string, string | Blob | undefined> = {},
  fileField = "file",
): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) continue;
    form.append(key, value);
  }
  const blob = new Blob([toBlobPart(file.data)], { type: file.contentType ?? "application/octet-stream" });
  form.append(fileField, blob, file.filename);
  return form;
}
