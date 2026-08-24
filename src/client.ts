import { ApiClient, env } from "./api-client.js";
import type { KupeOptions, Me } from "./types.js";
import {
  Agents,
  Campaigns,
  Inbound,
  Realtime,
  RecipientLists,
  Sessions,
} from "./resources/core.js";
import {
  Analyses,
  AudioAssets,
  Composio,
  Databases,
  KnowledgeBases,
  Tools,
} from "./resources/platform.js";
import {
  Billing,
  Logs,
  Orgs,
  Phones,
  Projects,
  Providers,
  Usage,
  Voices,
} from "./resources/account.js";

/**
 * First-party Kupe API client.
 *
 * ```ts
 * import { Kupe } from "kupe-sdk";
 * const kupe = new Kupe(); // KUPE_API_KEY
 * const session = await kupe.realtime.sessions.create({ agent_id, voice: "priya" });
 * const rt = await kupe.realtime.connect(session);
 * ```
 */
export class Kupe {
  readonly agents: Agents;
  readonly realtime: Realtime;
  readonly sessions: Sessions;
  readonly inbound: Inbound;
  readonly campaigns: Campaigns;
  readonly recipientLists: RecipientLists;
  readonly tools: Tools;
  readonly composio: Composio;
  readonly analyses: Analyses;
  readonly databases: Databases;
  readonly knowledgeBases: KnowledgeBases;
  readonly audioAssets: AudioAssets;
  readonly phones: Phones;
  readonly voices: Voices;
  readonly providers: Providers;
  readonly logs: Logs;
  readonly billing: Billing;
  readonly usage: Usage;
  readonly orgs: Orgs;
  readonly projects: Projects;

  private readonly _client: ApiClient;

  constructor(options: KupeOptions = {}) {
    this._client = new ApiClient(options);
    this.agents = new Agents(this._client);
    this.realtime = new Realtime(this._client);
    this.sessions = new Sessions(this._client);
    this.inbound = new Inbound(this._client);
    this.campaigns = new Campaigns(this._client);
    this.recipientLists = new RecipientLists(this._client);
    this.tools = new Tools(this._client);
    this.composio = new Composio(this._client);
    this.analyses = new Analyses(this._client);
    this.databases = new Databases(this._client);
    this.knowledgeBases = new KnowledgeBases(this._client);
    this.audioAssets = new AudioAssets(this._client);
    this.phones = new Phones(this._client);
    this.voices = new Voices(this._client);
    this.providers = new Providers(this._client);
    this.logs = new Logs(this._client);
    this.billing = new Billing(this._client);
    this.usage = new Usage(this._client);
    this.orgs = new Orgs(this._client);
    this.projects = new Projects(this._client);
  }

  get apiKey(): string {
    return this._client.apiKey;
  }

  get baseUrl(): string {
    return this._client.baseUrl;
  }

  /** Load `{ org_id, project_id, auth }` from `GET /v1/me` and cache it. */
  me(): Promise<Me> {
    return this._client.me();
  }
}

export { env };
