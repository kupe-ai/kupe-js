import { afterEach, describe, expect, it, vi } from "vitest";
import { joinUrl, normalizeBaseUrl, toV1Path } from "../src/http.js";
import { Kupe } from "../src/index.js";
import { AuthenticationError, PermissionError } from "../src/errors.js";
import type { RealtimeSession } from "../src/types.js";

type FetchCall = { url: string; method: string; body: unknown; headers: Headers };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function installFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = init?.body ?? null;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // keep string
      }
    }
    const call: FetchCall = {
      url,
      method,
      body,
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    return handler(call);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const ME = { org_id: "org_1", project_id: "proj_1", auth: "api_key" as const };

afterEach(() => {
  delete process.env.KUPE_API_KEY;
  delete process.env.KUPE_BASE_URL;
});

describe("path joining", () => {
  it("always prefixes /v1 and strips a trailing /v1 from the base", () => {
    expect(normalizeBaseUrl("https://x.kupe.in/v1")).toBe("https://x.kupe.in");
    expect(normalizeBaseUrl("https://x.kupe.in/v1/")).toBe("https://x.kupe.in");
    expect(toV1Path("realtime/sessions")).toBe("/v1/realtime/sessions");
    expect(toV1Path("/v1/agents/agt_1")).toBe("/v1/agents/agt_1");
    expect(joinUrl("https://x.kupe.in/v1", "/realtime/sessions")).toBe(
      "https://x.kupe.in/v1/realtime/sessions",
    );
    expect(joinUrl("https://x.kupe.in", "orgs/org_1/projects/p/agents")).toBe(
      "https://x.kupe.in/v1/orgs/org_1/projects/p/agents",
    );
  });
});

describe("Kupe constructor", () => {
  it("reads KUPE_API_KEY and KUPE_BASE_URL", () => {
    process.env.KUPE_API_KEY = "sk-kupe-env";
    process.env.KUPE_BASE_URL = "https://example.test/v1";
    const kupe = new Kupe();
    expect(kupe.apiKey).toBe("sk-kupe-env");
    expect(kupe.baseUrl).toBe("https://example.test");
  });

  it("throws without an API key", () => {
    expect(() => new Kupe()).toThrow(/KUPE_API_KEY/);
  });
});

describe("auto-fill via GET /v1/me", () => {
  it("fills org and project for scoped list calls", async () => {
    const { fetchImpl, calls } = installFetch((call) => {
      if (call.url.endsWith("/v1/me")) return jsonResponse(ME);
      return jsonResponse({ items: [], total: 0, limit: 20, offset: 0 });
    });
    const kupe = new Kupe({ apiKey: "sk-kupe-test", fetch: fetchImpl });
    await kupe.agents.list();
    expect(calls.map((c) => c.url)).toEqual([
      "https://x.kupe.in/v1/me",
      "https://x.kupe.in/v1/orgs/org_1/projects/proj_1/agents",
    ]);
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer sk-kupe-test");
  });

  it("does not double-prefix /v1 when minting a realtime session", async () => {
    const { fetchImpl, calls } = installFetch((call) => {
      if (call.url.endsWith("/v1/me")) return jsonResponse(ME);
      return jsonResponse({
        id: "rt_1",
        client_secret: { value: "secret", expires_at: 1 },
        websocket_url: "wss://x.kupe.in/v1/realtime",
      });
    });
    const kupe = new Kupe({ apiKey: "sk-kupe-test", fetch: fetchImpl });
    await kupe.realtime.sessions.create({ agent_id: "agt_1", voice: "priya" });
    const mint = calls.find((c) => c.url.includes("/realtime/sessions"));
    expect(mint?.url).toBe("https://x.kupe.in/v1/realtime/sessions");
    expect(mint?.url).not.toContain("/v1/v1/");
    expect(mint?.body).toMatchObject({ agent_id: "agt_1", voice: "priya", org_id: "org_1" });
  });

  it("mints a realtime session by name without agent_id", async () => {
    const { fetchImpl, calls } = installFetch((call) => {
      if (call.url.endsWith("/v1/me")) return jsonResponse(ME);
      return jsonResponse({
        id: "rt_1",
        agent_id: "new-agt",
        client_secret: { value: "secret", expires_at: 1 },
        websocket_url: "wss://x.kupe.in/v1/realtime",
      });
    });
    const kupe = new Kupe({ apiKey: "sk-kupe-test", fetch: fetchImpl });
    await kupe.realtime.sessions.create({
      name: "Priya",
      voice: "priya",
      prompt: "Be brief.",
      greeting: "Hi.",
    });
    const mint = calls.find((c) => c.url.includes("/realtime/sessions"));
    expect(mint?.body).toMatchObject({
      name: "Priya",
      voice: "priya",
      prompt: "Be brief.",
      greeting: "Hi.",
      org_id: "org_1",
    });
    expect(mint?.body).not.toHaveProperty("agent_id");
  });

  it("mints a realtime session with voice_id instead of voice name", async () => {
    const { fetchImpl, calls } = installFetch((call) => {
      if (call.url.endsWith("/v1/me")) return jsonResponse(ME);
      return jsonResponse({
        id: "rt_1",
        client_secret: { value: "secret", expires_at: 1 },
        websocket_url: "wss://x.kupe.in/v1/realtime",
      });
    });
    const kupe = new Kupe({ apiKey: "sk-kupe-test", fetch: fetchImpl });
    await kupe.realtime.sessions.create({ agent_id: "agt_1", voice_id: "pub-1" });
    const mint = calls.find((c) => c.url.includes("/realtime/sessions"));
    expect(mint?.body).toMatchObject({ agent_id: "agt_1", voice_id: "pub-1", org_id: "org_1" });
  });
});

describe("errors", () => {
  it("maps 401 to AuthenticationError", async () => {
    const { fetchImpl } = installFetch(() => jsonResponse({ detail: "nope" }, 401));
    const kupe = new Kupe({ apiKey: "sk-kupe-test", orgId: "org_1", fetch: fetchImpl });
    await expect(kupe.providers.list()).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe("voices JWT-only methods", () => {
  it("rejects clone/update/delete with an API key", async () => {
    const { fetchImpl } = installFetch(() => jsonResponse({}));
    const kupe = new Kupe({ apiKey: "sk-kupe-test", fetch: fetchImpl });
    await expect(
      kupe.voices.clone({ name: "Mine", sample: { data: new Uint8Array([1]), filename: "a.wav" } }),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(kupe.voices.update("voice_1", { name: "x" })).rejects.toBeInstanceOf(PermissionError);
    await expect(kupe.voices.delete("voice_1")).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("usage and billing exclusions", () => {
  it("exposes cost-summary and daily only", async () => {
    const { fetchImpl, calls } = installFetch((call) => {
      if (call.url.endsWith("/v1/me")) return jsonResponse(ME);
      return jsonResponse({ items: [], total: 0, limit: 20, offset: 0, currency: "INR" });
    });
    const kupe = new Kupe({ apiKey: "sk-kupe-test", fetch: fetchImpl });
    await kupe.usage.costSummary({ start_date: "2026-01-01" });
    await kupe.usage.daily({ start_date: "2026-01-01", end_date: "2026-01-31" });
    await kupe.billing.wallet();
    await kupe.billing.invoices.list();
    const urls = calls.map((c) => c.url);
    expect(urls).toContain("https://x.kupe.in/v1/orgs/org_1/usage/cost-summary?start_date=2026-01-01");
    expect(urls.some((u) => u.includes("/usage/daily"))).toBe(true);
    expect(urls.some((u) => u.includes("/billing/wallet"))).toBe(true);
    expect(urls.some((u) => /\/usage(\?|$)/.test(u.replace(/https:\/\/x\.kupe\.in\/v1\/orgs\/org_1/, "")))).toBe(
      false,
    );
    expect(urls.some((u) => u.includes("/billing/topup"))).toBe(false);
    expect(urls.some((u) => u.includes("/billing/subscribe"))).toBe(false);
    expect(urls.some((u) => u.includes("/sessions/") && u.endsWith("/usage"))).toBe(false);
    expect(kupe.usage).not.toHaveProperty("summary");
    expect(kupe.billing).not.toHaveProperty("checkout");
    expect(kupe.billing).not.toHaveProperty("topup");
  });
});

describe("resource paths", () => {
  it("hits the included REST surface under /v1", async () => {
    const { fetchImpl, calls } = installFetch((call) => {
      if (call.url.endsWith("/v1/me")) return jsonResponse(ME);
      if (call.method === "DELETE" || call.url.includes("/hide")) return emptyResponse(204);
      return jsonResponse({ id: "ok", items: [], total: 0, limit: 20, offset: 0 });
    });
    const kupe = new Kupe({ apiKey: "sk-kupe-test", fetch: fetchImpl });

    await kupe.agents.create({ name: "Kavya", system_prompt: "You are Kavya." });
    await kupe.agents.retrieve("agt_1");
    await kupe.agents.commit("agt_1", { message: "ship" });
    await kupe.agents.tools.attach("agt_1", { tool_id: "tool_1" });
    await kupe.sessions.create({ agent_id: "agt_1", channel: "web" });
    await kupe.inbound.list();
    await kupe.campaigns.create({
      agent_id: "agt_1",
      telephony_account_id: "tel_1",
      name: "EMI",
    });
    await kupe.recipientLists.list();
    await kupe.tools.list();
    await kupe.composio.toolkits.list();
    await kupe.analyses.list();
    await kupe.databases.list();
    await kupe.knowledgeBases.list();
    await kupe.audioAssets.list();
    await kupe.phones.search({ country_iso: "IN" });
    await kupe.phones.buy({ number: "+9111", country_iso: "IN" });
    await kupe.phones.delete("tel_1");
    await kupe.voices.list({ provider: "kupe" });
    await kupe.providers.list();
    await kupe.logs.transcript("sess_1");
    await kupe.logs.recording("sess_1");
    await kupe.logs.toolCallEvents();
    await kupe.orgs.list();
    await kupe.projects.list();

    const urls = calls.map((c) => `${c.method} ${c.url}`);
    expect(urls).toContain("POST https://x.kupe.in/v1/orgs/org_1/projects/proj_1/agents");
    expect(urls).toContain("GET https://x.kupe.in/v1/agents/agt_1");
    expect(urls).toContain("POST https://x.kupe.in/v1/sessions");
    expect(urls).toContain("POST https://x.kupe.in/v1/batches");
    expect(urls).toContain("GET https://x.kupe.in/v1/orgs/org_1/plivo/numbers/search?country_iso=IN");
    expect(urls).toContain("POST https://x.kupe.in/v1/orgs/org_1/plivo/numbers/purchase");
    expect(urls).toContain("DELETE https://x.kupe.in/v1/telephony-accounts/tel_1");
    expect(urls).toContain("GET https://x.kupe.in/v1/sessions/sess_1/transcript");
    expect(urls).toContain("GET https://x.kupe.in/v1/providers");
    expect(urls.every((u) => u.includes("/v1/"))).toBe(true);
    expect(urls.some((u) => u.includes("/v1/v1/"))).toBe(false);
  });

  it("phones.ucc list summary retrieve proof sync", async () => {
    const { fetchImpl, calls } = installFetch((call) => {
      if (call.url.endsWith("/v1/me")) return jsonResponse(ME);
      return jsonResponse({ items: [], total: 0, actionable_count: 0 });
    });
    const kupe = new Kupe({ apiKey: "sk-kupe-test", fetch: fetchImpl });

    await kupe.phones.ucc.list({ status: "pending", from_number: "+9111" });
    await kupe.phones.ucc.summary();
    await kupe.phones.ucc.retrieve("PUCC-2026-1");
    await kupe.phones.ucc.submitProof("PUCC-2026-1", {
      file: { data: new Uint8Array([1, 2, 3]), filename: "proof.pdf", contentType: "application/pdf" },
    });
    await kupe.phones.ucc.sync();

    const urls = calls.map((c) => `${c.method} ${c.url}`);
    expect(urls).toContain(
      "GET https://x.kupe.in/v1/orgs/org_1/plivo/ucc?status=pending&from_number=%2B9111",
    );
    expect(urls).toContain("GET https://x.kupe.in/v1/orgs/org_1/plivo/ucc/summary");
    expect(urls).toContain("GET https://x.kupe.in/v1/orgs/org_1/plivo/ucc/PUCC-2026-1");
    expect(urls).toContain("POST https://x.kupe.in/v1/orgs/org_1/plivo/ucc/PUCC-2026-1/proof");
    expect(urls).toContain("POST https://x.kupe.in/v1/orgs/org_1/plivo/ucc/sync");
    const proof = calls.find((c) => c.url.endsWith("/proof"));
    expect(proof?.body).toBeInstanceOf(FormData);
  });
});

export type { RealtimeSession };
