import { APIConnectionError } from "./errors.js";
import type { RealtimeEvent, RealtimeSession } from "./types.js";

export type RealtimeSocketEvent = {
  data?: unknown;
  code?: number;
  reason?: string;
};

export type RealtimeSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (ev: RealtimeSocketEvent) => void): void;
  removeEventListener(type: string, listener: (ev: RealtimeSocketEvent) => void): void;
};

export type RealtimeSocketConstructor = new (url: string) => RealtimeSocket;

export type RealtimeConnectOptions = {
  model?: string;
  WebSocket?: RealtimeSocketConstructor;
};

type Pending<T> = {
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

/**
 * OpenAI-compatible realtime WebSocket: `conversation.item.create`,
 * `response.create`, `input_audio_buffer.append` (PCM16 24 kHz).
 */
export class RealtimeConnection implements AsyncIterable<RealtimeEvent> {
  private readonly ws: RealtimeSocket;
  private readonly queue: RealtimeEvent[] = [];
  private waiter: Pending<IteratorResult<RealtimeEvent>> | null = null;
  private closed = false;
  private closeError: unknown = null;
  private readonly listeners = new Map<string, Set<(event: RealtimeEvent) => void>>();

  constructor(ws: RealtimeSocket) {
    this.ws = ws;
    this.ws.addEventListener("message", (ev) => this.onMessage(ev.data));
    this.ws.addEventListener("error", (ev) => {
      this.fail(new APIConnectionError("Realtime WebSocket error", ev));
    });
    this.ws.addEventListener("close", (ev) => {
      if (!this.closed && ev.code && ev.code !== 1000) {
        this.fail(new APIConnectionError(`Realtime WebSocket closed: ${ev.code} ${ev.reason ?? ""}`.trim()));
        return;
      }
      this.finish();
    });
  }

  get readyState(): number {
    return this.ws.readyState;
  }

  sendEvent(event: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(event));
  }

  /** Send a user text turn and (by default) ask the agent to respond. */
  send_text(text: string, opts: { create_response?: boolean } = {}): void {
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    if (opts.create_response !== false) {
      this.createResponse();
    }
  }

  sendText(text: string, opts: { create_response?: boolean } = {}): void {
    this.send_text(text, opts);
  }

  /** Append a PCM16 mono 24 kHz chunk (raw bytes or base64). */
  appendAudio(chunk: ArrayBuffer | Uint8Array | string): void {
    const audio = typeof chunk === "string" ? chunk : bytesToBase64(chunk);
    this.sendEvent({ type: "input_audio_buffer.append", audio });
  }

  commitAudio(): void {
    this.sendEvent({ type: "input_audio_buffer.commit" });
  }

  createResponse(body: Record<string, unknown> = {}): void {
    this.sendEvent({ type: "response.create", ...body });
  }

  on(type: string, handler: (event: RealtimeEvent) => void): this {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return this;
  }

  off(type: string, handler: (event: RealtimeEvent) => void): this {
    this.listeners.get(type)?.delete(handler);
    return this;
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    try {
      this.ws.close(code, reason);
    } catch {
      // already closed
    }
    this.finish();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<RealtimeEvent> {
    while (true) {
      const next = await this.nextEvent();
      if (next.done) return;
      yield next.value;
    }
  }

  private nextEvent(): Promise<IteratorResult<RealtimeEvent>> {
    if (this.queue.length > 0) {
      return Promise.resolve({ value: this.queue.shift() as RealtimeEvent, done: false });
    }
    if (this.closeError) return Promise.reject(this.closeError);
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  private onMessage(data: unknown): void {
    let parsed: RealtimeEvent;
    try {
      const text = typeof data === "string" ? data : bytesToText(data);
      parsed = JSON.parse(text) as RealtimeEvent;
    } catch {
      return;
    }
    const handlers = this.listeners.get(parsed.type);
    if (handlers) {
      for (const handler of handlers) handler(parsed);
    }
    const anyHandlers = this.listeners.get("*");
    if (anyHandlers) {
      for (const handler of anyHandlers) handler(parsed);
    }
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter.resolve({ value: parsed, done: false });
    } else {
      this.queue.push(parsed);
    }
  }

  private fail(err: unknown): void {
    this.closeError = err;
    this.closed = true;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter.reject(err);
    }
  }

  private finish(): void {
    this.closed = true;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      if (this.closeError) waiter.reject(this.closeError);
      else waiter.resolve({ value: undefined, done: true });
    }
  }
}

export function realtimeWebsocketUrl(session: RealtimeSession, model = "kupe-realtime"): string {
  const secret = session.client_secret?.value;
  if (!secret) {
    throw new Error("Realtime session is missing client_secret.value");
  }
  if (!session.websocket_url) {
    throw new Error("Realtime session is missing websocket_url");
  }
  const url = new URL(session.websocket_url);
  if (!url.searchParams.has("model")) url.searchParams.set("model", model);
  if (!url.searchParams.has("client_secret")) url.searchParams.set("client_secret", secret);
  return url.toString();
}

export async function openRealtimeSocket(
  url: string,
  WebSocketImpl?: RealtimeSocketConstructor,
): Promise<RealtimeSocket> {
  const Ctor = await resolveWebSocket(WebSocketImpl);
  const ws = new Ctor(url);
  if (ws.readyState === 1) return ws;
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (ev: RealtimeSocketEvent) => {
      cleanup();
      reject(new APIConnectionError("Failed to open realtime WebSocket", ev));
    };
    const cleanup = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
  });
  return ws;
}

async function resolveWebSocket(override?: RealtimeSocketConstructor): Promise<RealtimeSocketConstructor> {
  if (override) return override;
  const globalCtor = (globalThis as { WebSocket?: RealtimeSocketConstructor }).WebSocket;
  if (typeof globalCtor === "function") return globalCtor;
  const mod = (await import("ws")) as unknown as {
    default?: RealtimeSocketConstructor;
    WebSocket?: RealtimeSocketConstructor;
  };
  const Ctor = mod.WebSocket ?? mod.default;
  if (!Ctor) {
    throw new Error("No WebSocket implementation found. Pass WebSocket or install the `ws` package.");
  }
  return Ctor;
}

function bytesToBase64(chunk: ArrayBuffer | Uint8Array): string {
  const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function bytesToText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data as ArrayBufferView);
  }
  return String(data);
}
