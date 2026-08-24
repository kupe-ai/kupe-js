import type { Transport } from "../api-client.js";
import { fileToForm } from "../api-client.js";
import { openRealtimeSocket, realtimeWebsocketUrl, RealtimeConnection } from "../realtime.js";
import type {
  Agent,
  AgentCreateParams,
  AgentUpdateParams,
  CreateRealtimeSessionParams,
  CreateSessionParams,
  JsonObject,
  Page,
  PaginationParams,
  Query,
  RealtimeSession,
  Session,
  UploadFile,
} from "../types.js";

type Scope = { org_id?: string; project_id?: string };

export class Agents {
  readonly tools: AgentTools;
  readonly analyses: AgentAnalyses;
  readonly memories: AgentMemories;
  readonly tests: AgentTests;
  readonly testRuns: AgentTestRuns;
  readonly versions: AgentVersions;
  readonly databases: AgentDatabases;

  constructor(private readonly c: Transport) {
    this.tools = new AgentTools(c);
    this.analyses = new AgentAnalyses(c);
    this.memories = new AgentMemories(c);
    this.tests = new AgentTests(c);
    this.testRuns = new AgentTestRuns(c);
    this.versions = new AgentVersions(c);
    this.databases = new AgentDatabases(c);
  }

  async create(params: AgentCreateParams & Scope): Promise<Agent> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    const { org_id: _o, project_id: _p, ...body } = params;
    return this.c.post(`/orgs/${orgId}/projects/${projectId}/agents`, body);
  }

  async list(params: PaginationParams & Scope = {}): Promise<Page<Agent>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/agents`, pageQuery(params));
  }

  retrieve(agentId: string): Promise<Agent> {
    return this.c.get(`/agents/${agentId}`);
  }

  update(agentId: string, params: AgentUpdateParams = {}): Promise<Agent> {
    return this.c.patch(`/agents/${agentId}`, params);
  }

  commit(agentId: string, params: { message?: string } = {}): Promise<Agent> {
    return this.c.post(`/agents/${agentId}/commit`, params);
  }

  archive(agentId: string): Promise<Agent> {
    return this.c.post(`/agents/${agentId}/archive`);
  }

  revert(agentId: string, version: number): Promise<Agent> {
    return this.c.post(`/agents/${agentId}/revert/${version}`);
  }

  demoVariables(agentId: string, params: { overrides?: Record<string, string> } = {}): Promise<{ values: Record<string, string> }> {
    return this.c.post(`/agents/${agentId}/demo-variables`, params);
  }
}

class AgentVersions {
  constructor(private readonly c: Transport) {}

  list(agentId: string, params: PaginationParams = {}): Promise<Page<JsonObject>> {
    return this.c.get(`/agents/${agentId}/versions`, pageQuery(params));
  }
}

class AgentTools {
  constructor(private readonly c: Transport) {}

  list(agentId: string, params: PaginationParams = {}): Promise<Page<JsonObject>> {
    return this.c.get(`/agents/${agentId}/tools`, pageQuery(params));
  }

  attach(agentId: string, params: { tool_id: string; enabled?: boolean }): Promise<JsonObject> {
    return this.c.post(`/agents/${agentId}/tools`, params);
  }

  detach(agentId: string, toolId: string): Promise<void> {
    return this.c.delete(`/agents/${agentId}/tools/${toolId}`);
  }
}

class AgentAnalyses {
  constructor(private readonly c: Transport) {}

  list(agentId: string, params: PaginationParams = {}): Promise<Page<JsonObject>> {
    return this.c.get(`/agents/${agentId}/post-call-analyses`, pageQuery(params));
  }

  attach(
    agentId: string,
    params: { post_call_analysis_id: string; enabled?: boolean },
  ): Promise<JsonObject> {
    return this.c.post(`/agents/${agentId}/post-call-analyses`, params);
  }

  detach(agentId: string, analysisId: string): Promise<void> {
    return this.c.delete(`/agents/${agentId}/post-call-analyses/${analysisId}`);
  }
}

class AgentMemories {
  constructor(private readonly c: Transport) {}

  list(agentId: string, params: PaginationParams & { contact?: string } = {}): Promise<Page<JsonObject>> {
    return this.c.get(`/agents/${agentId}/memories`, { ...pageQuery(params), contact: params.contact });
  }

  forget(agentId: string, contact: string): Promise<JsonObject> {
    return this.c.delete(`/agents/${agentId}/memories`, { contact });
  }
}

class AgentTests {
  constructor(private readonly c: Transport) {}

  create(
    agentId: string,
    params: {
      name: string;
      scenario?: string;
      behaviors?: string[];
      expected_tool_calls?: JsonObject[];
    },
  ): Promise<JsonObject> {
    return this.c.post(`/agents/${agentId}/tests`, params);
  }

  list(agentId: string, params: PaginationParams = {}): Promise<Page<JsonObject>> {
    return this.c.get(`/agents/${agentId}/tests`, pageQuery(params));
  }

  update(agentId: string, testId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.patch(`/agents/${agentId}/tests/${testId}`, params);
  }

  delete(agentId: string, testId: string): Promise<void> {
    return this.c.delete(`/agents/${agentId}/tests/${testId}`);
  }
}

class AgentTestRuns {
  constructor(private readonly c: Transport) {}

  create(
    agentId: string,
    params: { test_id?: string; multiplier?: number; run_name?: string } = {},
  ): Promise<JsonObject> {
    return this.c.post(`/agents/${agentId}/test-runs`, params);
  }

  list(agentId: string, params: PaginationParams = {}): Promise<Page<JsonObject>> {
    return this.c.get(`/agents/${agentId}/test-runs`, pageQuery(params));
  }

  retrieve(agentId: string, runId: string): Promise<JsonObject> {
    return this.c.get(`/agents/${agentId}/test-runs/${runId}`);
  }
}

class AgentDatabases {
  constructor(private readonly c: Transport) {}

  list(agentId: string): Promise<JsonObject[]> {
    return this.c.get(`/agents/${agentId}/databases`);
  }
}

export class Realtime {
  readonly sessions: RealtimeSessions;

  constructor(private readonly c: Transport) {
    this.sessions = new RealtimeSessions(c);
  }

  async connect(
    session: RealtimeSession,
    opts: { model?: string; WebSocket?: import("../realtime.js").RealtimeSocketConstructor } = {},
  ): Promise<RealtimeConnection> {
    const url = realtimeWebsocketUrl(session, opts.model ?? "kupe-realtime");
    const ws = await openRealtimeSocket(url, opts.WebSocket ?? this.c.webSocket);
    return new RealtimeConnection(ws);
  }
}

class RealtimeSessions {
  constructor(private readonly c: Transport) {}

  async create(params: CreateRealtimeSessionParams): Promise<RealtimeSession> {
    const org_id = params.org_id ?? (await this.c.requireOrgId().catch(() => undefined));
    const project_id = params.project_id ?? (await this.c.requireProjectId().catch(() => undefined));
    return this.c.post("/realtime/sessions", {
      ...params,
      ...(org_id ? { org_id } : {}),
      ...(project_id ? { project_id } : {}),
    });
  }
}

export class Sessions {
  constructor(private readonly c: Transport) {}

  async create(params: CreateSessionParams = {}): Promise<Session> {
    const org_id = params.org_id ?? (await this.c.requireOrgId().catch(() => undefined));
    const project_id = params.project_id ?? (await this.c.requireProjectId().catch(() => undefined));
    return this.c.post("/sessions", {
      ...params,
      ...(org_id ? { org_id } : {}),
      ...(project_id ? { project_id } : {}),
    });
  }

  async list(params: PaginationParams & { org_id?: string } = {}): Promise<Page<Session>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/sessions`, pageQuery(params));
  }

  retrieve(sessionId: string): Promise<Session> {
    return this.c.get(`/sessions/${sessionId}`);
  }

  end(sessionId: string): Promise<Session> {
    return this.c.post(`/sessions/${sessionId}/end`);
  }

  analysis(sessionId: string, params: PaginationParams = {}): Promise<Page<JsonObject>> {
    return this.c.get(`/sessions/${sessionId}/analysis`, pageQuery(params));
  }
}

export class Inbound {
  constructor(private readonly c: Transport) {}

  async create(params: {
    org_id?: string;
    project_id?: string;
    agent_id: string;
    telephony_account_id: string;
    name: string;
    status?: string;
    availability?: JsonObject;
  }): Promise<JsonObject> {
    const org_id = await this.c.requireOrgId(params.org_id);
    const project_id = await this.c.requireProjectId(params.project_id);
    return this.c.post("/inbound", { ...params, org_id, project_id });
  }

  async list(params: PaginationParams & Scope = {}): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/inbound`, pageQuery(params));
  }

  retrieve(deploymentId: string): Promise<JsonObject> {
    return this.c.get(`/inbound/${deploymentId}`);
  }

  update(deploymentId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.patch(`/inbound/${deploymentId}`, params);
  }

  delete(deploymentId: string): Promise<void> {
    return this.c.delete(`/inbound/${deploymentId}`);
  }
}

export class Campaigns {
  readonly contacts: CampaignContacts;

  constructor(private readonly c: Transport) {
    this.contacts = new CampaignContacts(c);
  }

  async create(params: {
    org_id?: string;
    project_id?: string;
    agent_id: string;
    telephony_account_id: string;
    name: string;
    max_concurrent_calls?: number;
    retry_policy?: JsonObject;
    schedule?: JsonObject;
  }): Promise<JsonObject> {
    const org_id = await this.c.requireOrgId(params.org_id);
    const project_id = await this.c.requireProjectId(params.project_id);
    return this.c.post("/batches", { ...params, org_id, project_id });
  }

  async list(params: PaginationParams & Scope = {}): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/batches`, pageQuery(params));
  }

  async unhide(params: Scope = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.post(`/orgs/${orgId}/projects/${projectId}/batches:unhide`);
  }

  async analytics(
    params: Scope & { batch_id?: string; search?: string } = {},
  ): Promise<JsonObject[]> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/batches/analytics`, {
      batch_id: params.batch_id,
      search: params.search,
    });
  }

  retrieve(batchId: string): Promise<JsonObject> {
    return this.c.get(`/batches/${batchId}`);
  }

  stats(batchId: string): Promise<JsonObject> {
    return this.c.get(`/batches/${batchId}/stats`);
  }

  callAnalytics(batchId: string): Promise<JsonObject> {
    return this.c.get(`/batches/${batchId}/call-analytics`);
  }

  updateSchedule(batchId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.patch(`/batches/${batchId}/schedule`, params);
  }

  start(batchId: string): Promise<JsonObject> {
    return this.c.post(`/batches/${batchId}/start`);
  }

  pause(batchId: string): Promise<JsonObject> {
    return this.c.post(`/batches/${batchId}/pause`);
  }

  resume(batchId: string): Promise<JsonObject> {
    return this.c.post(`/batches/${batchId}/resume`);
  }

  cancel(batchId: string): Promise<JsonObject> {
    return this.c.post(`/batches/${batchId}/cancel`);
  }

  hide(batchId: string): Promise<void> {
    return this.c.post(`/batches/${batchId}/hide`);
  }

  delete(batchId: string): Promise<void> {
    return this.c.delete(`/batches/${batchId}`);
  }

  attachList(batchId: string, recipientListId: string): Promise<JsonObject> {
    return this.c.post(`/batches/${batchId}/contacts:from-list`, { recipient_list_id: recipientListId });
  }
}

class CampaignContacts {
  constructor(private readonly c: Transport) {}

  addBulk(batchId: string, params: { contacts: JsonObject[] } | JsonObject): Promise<JsonObject[]> {
    return this.c.post(`/batches/${batchId}/contacts:bulk`, params);
  }

  deleteBulk(batchId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.delete(`/batches/${batchId}/contacts:bulk`, undefined, params);
  }

  addCsv(batchId: string, file: UploadFile): Promise<JsonObject[]> {
    return this.c.postForm(`/batches/${batchId}/contacts`, fileToForm(file));
  }

  list(
    batchId: string,
    params: PaginationParams & { cursor?: string; status?: string; search?: string } = {},
  ): Promise<Page<JsonObject> | JsonObject> {
    return this.c.get(`/batches/${batchId}/contacts`, {
      ...pageQuery(params),
      cursor: params.cursor,
      status: params.status,
      search: params.search,
    });
  }
}

export class RecipientLists {
  readonly members: RecipientListMembers;

  constructor(private readonly c: Transport) {
    this.members = new RecipientListMembers(c);
  }

  async create(params: {
    org_id?: string;
    project_id?: string;
    name: string;
    description?: string;
  }): Promise<JsonObject> {
    const org_id = await this.c.requireOrgId(params.org_id);
    const project_id = await this.c.requireProjectId(params.project_id);
    return this.c.post("/recipient-lists", { ...params, org_id, project_id });
  }

  async list(
    params: PaginationParams & Scope & { name?: string } = {},
  ): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/recipient-lists`, {
      ...pageQuery(params),
      name: params.name,
    });
  }

  retrieve(listId: string): Promise<JsonObject> {
    return this.c.get(`/recipient-lists/${listId}`);
  }

  update(listId: string, params: { name?: string; description?: string }): Promise<JsonObject> {
    return this.c.patch(`/recipient-lists/${listId}`, params);
  }

  delete(listId: string): Promise<void> {
    return this.c.delete(`/recipient-lists/${listId}`);
  }
}

class RecipientListMembers {
  constructor(private readonly c: Transport) {}

  addBulk(listId: string, params: { members: JsonObject[] }): Promise<JsonObject> {
    return this.c.post(`/recipient-lists/${listId}/members:bulk`, params);
  }

  addCsv(listId: string, file: UploadFile): Promise<JsonObject> {
    return this.c.postForm(`/recipient-lists/${listId}/members`, fileToForm(file));
  }

  list(listId: string, params: { limit?: number; cursor?: string } = {}): Promise<JsonObject> {
    return this.c.get(`/recipient-lists/${listId}/members`, params);
  }

  update(listId: string, memberId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.patch(`/recipient-lists/${listId}/members/${memberId}`, params);
  }

  delete(listId: string, memberId: string): Promise<void> {
    return this.c.delete(`/recipient-lists/${listId}/members/${memberId}`);
  }
}

export function pageQuery(params: PaginationParams): Query {
  return { limit: params.limit, offset: params.offset };
}
