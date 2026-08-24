import { describe, expect, it } from "vitest";
import {
  RealtimeConnection,
  openRealtimeSocket,
  realtimeWebsocketUrl,
  type RealtimeSocket,
  type RealtimeSocketConstructor,
  type RealtimeSocketEvent,
} from "../src/realtime.js";
import { Kupe } from "../src/index.js";
import type { RealtimeSession } from "../src/types.js";

class FakeWebSocket implements RealtimeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private readonly listeners = new Map<string, Set<(ev: RealtimeSocketEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open", {});
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code, reason });
  }

  addEventListener(type: string, handler: (ev: RealtimeSocketEvent) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
  }

  removeEventListener(type: string, handler: (ev: RealtimeSocketEvent) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  push(event: Record<string, unknown>): void {
    this.emit("message", { data: JSON.stringify(event) });
  }

  private emit(type: string, ev: RealtimeSocketEvent): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    for (const handler of handlers) handler(ev);
  }
}

const WS = FakeWebSocket as unknown as RealtimeSocketConstructor;

const session: RealtimeSession = {
  id: "rt_1",
  client_secret: { value: "ephemeral-secret", expires_at: 1_700_000_000 },
  websocket_url: "wss://x.kupe.in/v1/realtime",
};

describe("realtimeWebsocketUrl", () => {
  it("appends model and client_secret", () => {
    const url = realtimeWebsocketUrl(session);
    expect(url).toContain("wss://x.kupe.in/v1/realtime");
    expect(url).toContain("model=kupe-realtime");
    expect(url).toContain("client_secret=ephemeral-secret");
  });
});

describe("RealtimeConnection", () => {
  it("send_text emits conversation.item.create + response.create", async () => {
    const ws = new FakeWebSocket("wss://example/ws");
    ws.readyState = FakeWebSocket.OPEN;
    const rt = new RealtimeConnection(ws);
    rt.send_text("Hi — remind them EMI is due tomorrow.");
    expect(ws.sent).toHaveLength(2);
    expect(JSON.parse(ws.sent[0]!)).toMatchObject({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Hi — remind them EMI is due tomorrow." }],
      },
    });
    expect(JSON.parse(ws.sent[1]!)).toMatchObject({ type: "response.create" });
  });

  it("iterates events until close", async () => {
    const ws = new FakeWebSocket("wss://example/ws");
    ws.readyState = FakeWebSocket.OPEN;
    const rt = new RealtimeConnection(ws);
    const received: string[] = [];
    const consume = (async () => {
      for await (const event of rt) {
        received.push(event.type);
      }
    })();
    ws.push({ type: "session.created" });
    ws.push({ type: "response.output_audio_transcript.done", transcript: "hello" });
    rt.close();
    await consume;
    expect(received).toEqual(["session.created", "response.output_audio_transcript.done"]);
  });

  it("appendAudio sends base64 PCM16 chunks", () => {
    const ws = new FakeWebSocket("wss://example/ws");
    ws.readyState = FakeWebSocket.OPEN;
    const rt = new RealtimeConnection(ws);
    rt.appendAudio(new Uint8Array([1, 2, 3]));
    expect(JSON.parse(ws.sent[0]!)).toMatchObject({
      type: "input_audio_buffer.append",
      audio: Buffer.from([1, 2, 3]).toString("base64"),
    });
  });
});

describe("Kupe.realtime.connect", () => {
  it("opens the minted websocket URL", async () => {
    const kupe = new Kupe({
      apiKey: "sk-kupe-test",
      WebSocket: WS,
      fetch: (async () => new Response("{}")) as typeof fetch,
    });
    const rt = await kupe.realtime.connect(session, {
      WebSocket: WS,
    });
    expect(rt.readyState).toBe(FakeWebSocket.OPEN);
    rt.close();
  });
});

describe("openRealtimeSocket", () => {
  it("resolves after the open event", async () => {
    const ws = await openRealtimeSocket("wss://example/ws", WS);
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
  });
});
