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

export type EchoSuppression = "none" | "half_duplex";

export type RealtimeEchoOptions = {
  /**
   * What to do with mic audio while the agent is talking.
   *
   * - `"none"` (default): send every chunk. Correct when the input already has
   *   acoustic echo cancellation -- a headset, a phone line, or a browser
   *   `getUserMedia({ echoCancellation: true })` stream. Barge-in works.
   * - `"half_duplex"`: drop chunks while the agent's audio is still playing.
   *   Use for open speakers, where the mic otherwise records the agent and
   *   sends its own voice back as user speech. Trade-off: no barge-in.
   */
  echoSuppression?: EchoSuppression;
  /** Extra hold after playback ends, for speaker decay and room reverb. */
  echoTailMs?: number;
};

export type RealtimeConnectOptions = RealtimeEchoOptions & {
  model?: string;
  WebSocket?: RealtimeSocketConstructor;
};

export const PCM16_SAMPLE_RATE = 24_000;

// Events meaning the agent's audio stopped now, so the gate can reopen
// without waiting out the queued-playback estimate.
const PLAYBACK_STOP_EVENTS = new Set([
  "input_audio_buffer.speech_started",
  "response.cancelled",
  "response.canceled",
]);

/**
 * Playback duration of a base64 PCM16-mono payload, without decoding it.
 * Deltas arrive faster than realtime, so the bytes buffered -- not the arrival
 * time of the last delta -- determine when playback actually ends.
 */
export function base64Pcm16Seconds(b64: string, sampleRate = PCM16_SAMPLE_RATE): number {
  const length = b64.length;
  if (length === 0) return 0;
  let padding = 0;
  if (b64.endsWith("==")) padding = 2;
  else if (b64.endsWith("=")) padding = 1;
  const nBytes = Math.floor((length * 3) / 4) - padding;
  if (nBytes <= 0) return 0;
  return nBytes / 2 / sampleRate;
}

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
  private readonly echoSuppression: EchoSuppression;
  private readonly echoTail: number;
  private playbackUntil = 0;
  /** Chunks dropped by echo suppression so far (diagnostics). */
  suppressedChunks = 0;

  constructor(ws: RealtimeSocket, opts: RealtimeEchoOptions = {}) {
    this.echoSuppression = opts.echoSuppression ?? "none";
    this.echoTail = Math.max(0, opts.echoTailMs ?? 250) / 1000;
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

  /** True while the agent's audio is still expected to be audible. */
  get agentIsSpeaking(): boolean {
    return Date.now() / 1000 < this.playbackUntil;
  }

  /**
   * Append a PCM16 mono 24 kHz chunk (raw bytes or base64).
   *
   * Returns `true` when sent, `false` when echo suppression dropped it
   * because the agent is still speaking. Pass `{ force: true }` to override.
   */
  appendAudio(chunk: ArrayBuffer | Uint8Array | string, opts: { force?: boolean } = {}): boolean {
    if (!opts.force && this.echoSuppression === "half_duplex" && this.agentIsSpeaking) {
      this.suppressedChunks += 1;
      return false;
    }
    const audio = typeof chunk === "string" ? chunk : bytesToBase64(chunk);
    this.sendEvent({ type: "input_audio_buffer.append", audio });
    return true;
  }

  /** Cancel the in-flight response (client-side barge-in). */
  cancel(): void {
    this.playbackUntil = 0;
    this.sendEvent({ type: "response.cancel" });
  }

  private notePlayback(event: RealtimeEvent): void {
    const type = event.type;
    if (type === "response.output_audio.delta") {
      const delta = (event as { delta?: unknown }).delta;
      if (typeof delta !== "string" || delta.length === 0) return;
      const seconds = base64Pcm16Seconds(delta);
      if (seconds <= 0) return;
      const now = Date.now() / 1000;
      // Chain onto queued audio, not onto "now".
      const queuedUntil = this.playbackUntil - this.echoTail;
      const start = queuedUntil > now ? queuedUntil : now;
      this.playbackUntil = start + seconds + this.echoTail;
    } else if (PLAYBACK_STOP_EVENTS.has(type)) {
      this.playbackUntil = 0;
    }
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
    this.notePlayback(parsed);
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
