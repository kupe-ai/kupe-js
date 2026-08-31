import type { Transport } from "../api-client.js";
import { fileToForm } from "../api-client.js";
import type { JsonObject, Page, PaginationParams, Query, UploadFile } from "../types.js";
import { pageQuery } from "./core.js";

type Scope = { org_id?: string; project_id?: string };

export class Tools {
  constructor(private readonly c: Transport) {}

  async create(params: {
    org_id?: string;
    name: string;
    description: string;
    parameters?: JsonObject;
    required?: string[];
    http_url?: string;
    http_method?: string;
    http_headers?: Record<string, string>;
    kind?: string;
    mcp_tool_name?: string;
  }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const { org_id: _o, ...body } = params;
    return this.c.post(`/orgs/${orgId}/tools`, body);
  }

  async list(params: PaginationParams & { org_id?: string } = {}): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/tools`, pageQuery(params));
  }

  retrieve(toolId: string): Promise<JsonObject> {
    return this.c.get(`/tools/${toolId}`);
  }

  update(toolId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.patch(`/tools/${toolId}`, params);
  }

  archive(toolId: string): Promise<JsonObject> {
    return this.c.post(`/tools/${toolId}/archive`);
  }
}

export class Composio {
  readonly toolkits: ComposioToolkits;
  readonly connections: ComposioConnections;
  readonly tools: ComposioTools;

  constructor(c: Transport) {
    this.toolkits = new ComposioToolkits(c);
    this.connections = new ComposioConnections(c);
    this.tools = new ComposioTools(c);
  }
}

class ComposioToolkits {
  constructor(private readonly c: Transport) {}

  async list(
    params: { org_id?: string; category?: string; cursor?: string } = {},
  ): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/composio/toolkits`, {
      category: params.category,
      cursor: params.cursor,
    });
  }

  async listTools(
    toolkitSlug: string,
    params: { org_id?: string; cursor?: string } = {},
  ): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/composio/toolkits/${toolkitSlug}/tools`, {
      cursor: params.cursor,
    });
  }
}

class ComposioConnections {
  constructor(private readonly c: Transport) {}

  async list(params: { org_id?: string } = {}): Promise<JsonObject[]> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/composio/connections`);
  }

  async create(params: { org_id?: string; toolkit_slug: string; callback_url: string }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const { org_id: _o, ...body } = params;
    return this.c.post(`/orgs/${orgId}/composio/connections`, body);
  }

  refresh(connectionId: string): Promise<JsonObject> {
    return this.c.post(`/composio/connections/${connectionId}/refresh`);
  }

  delete(connectionId: string): Promise<void> {
    return this.c.delete(`/composio/connections/${connectionId}`);
  }
}

class ComposioTools {
  constructor(private readonly c: Transport) {}

  async create(params: {
    org_id?: string;
    toolkit_slug: string;
    tool_slug: string;
    connection_id: string;
    name?: string;
    label?: string;
  }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const { org_id: _o, ...body } = params;
    return this.c.post(`/orgs/${orgId}/composio/tools`, body);
  }
}

export class Analyses {
  constructor(private readonly c: Transport) {}

  async create(params: {
    org_id?: string;
    name: string;
    prompt: string;
    eval_llm_id: string;
    description?: string;
    fields?: JsonObject[];
    webhook_url?: string;
  }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const { org_id: _o, ...body } = params;
    return this.c.post(`/orgs/${orgId}/post-call-analyses`, body);
  }

  async list(params: PaginationParams & { org_id?: string } = {}): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/post-call-analyses`, pageQuery(params));
  }

  retrieve(analysisId: string): Promise<JsonObject> {
    return this.c.get(`/post-call-analyses/${analysisId}`);
  }

  update(analysisId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.patch(`/post-call-analyses/${analysisId}`, params);
  }

  archive(analysisId: string): Promise<JsonObject> {
    return this.c.post(`/post-call-analyses/${analysisId}/archive`);
  }
}

export class Databases {
  readonly agents: DatabaseAgents;
  readonly rows: DatabaseRows;

  constructor(private readonly c: Transport) {
    this.agents = new DatabaseAgents(c);
    this.rows = new DatabaseRows(c);
  }

  async create(params: {
    org_id?: string;
    project_id?: string;
    name: string;
    description?: string;
    fields?: JsonObject[];
    agent_ids?: string[];
    destinations?: JsonObject[];
  }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    const { org_id: _o, project_id: _p, ...body } = params;
    return this.c.post(`/orgs/${orgId}/projects/${projectId}/databases`, body);
  }

  async list(
    params: PaginationParams & Scope & { search?: string } = {},
  ): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/databases`, {
      ...pageQuery(params),
      search: params.search,
    });
  }

  retrieve(databaseId: string): Promise<JsonObject> {
    return this.c.get(`/databases/${databaseId}`);
  }

  update(databaseId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.patch(`/databases/${databaseId}`, params);
  }

  archive(databaseId: string): Promise<JsonObject> {
    return this.c.post(`/databases/${databaseId}/archive`);
  }
}

class DatabaseAgents {
  constructor(private readonly c: Transport) {}

  list(databaseId: string): Promise<JsonObject[]> {
    return this.c.get(`/databases/${databaseId}/agents`);
  }

  attach(databaseId: string, params: { agent_id: string; enabled?: boolean }): Promise<JsonObject> {
    return this.c.post(`/databases/${databaseId}/agents`, params);
  }

  detach(databaseId: string, agentId: string): Promise<void> {
    return this.c.delete(`/databases/${databaseId}/agents/${agentId}`);
  }
}

class DatabaseRows {
  constructor(private readonly c: Transport) {}

  list(
    databaseId: string,
    params: { cursor?: string; limit?: number; q?: string } = {},
  ): Promise<JsonObject> {
    return this.c.get(`/databases/${databaseId}/rows`, params);
  }

  export(
    databaseId: string,
    params: { format?: "csv" | "json" | "ndjson" | "zip"; q?: string } = {},
  ): Promise<ArrayBuffer> {
    return this.c.getBinary(`/databases/${databaseId}/export`, params);
  }

  update(databaseId: string, rowId: string, params: JsonObject): Promise<JsonObject> {
    return this.c.patch(`/databases/${databaseId}/rows/${rowId}`, params);
  }

  delete(databaseId: string, rowId: string): Promise<void> {
    return this.c.delete(`/databases/${databaseId}/rows/${rowId}`);
  }
}

export class KnowledgeBases {
  readonly files: KnowledgeBaseFiles;

  constructor(private readonly c: Transport) {
    this.files = new KnowledgeBaseFiles(c);
  }

  async create(params: { org_id?: string; project_id?: string; name: string; description?: string }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    const { org_id: _o, project_id: _p, ...body } = params;
    return this.c.post(`/orgs/${orgId}/projects/${projectId}/knowledge-bases`, body);
  }

  async list(
    params: PaginationParams & Scope & { search?: string } = {},
  ): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/knowledge-bases`, {
      ...pageQuery(params),
      search: params.search,
    });
  }

  async retrieve(kbId: string, params: Scope = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/knowledge-bases/${kbId}`);
  }

  async update(kbId: string, params: Scope & { name?: string; description?: string }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    const { org_id: _o, project_id: _p, ...body } = params;
    return this.c.patch(`/orgs/${orgId}/projects/${projectId}/knowledge-bases/${kbId}`, body);
  }

  async delete(kbId: string, params: Scope = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.delete(`/orgs/${orgId}/projects/${projectId}/knowledge-bases/${kbId}`);
  }

  async search(
    kbId: string,
    params: Scope & { query: string; top_k?: number },
  ): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.post(`/orgs/${orgId}/projects/${projectId}/knowledge-bases/${kbId}/search`, {
      query: params.query,
      top_k: params.top_k,
    });
  }
}

class KnowledgeBaseFiles {
  constructor(private readonly c: Transport) {}

  async list(kbId: string, params: PaginationParams & Scope = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/knowledge-bases/${kbId}/files`, pageQuery(params));
  }

  async upload(kbId: string, file: UploadFile, params: Scope = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.postForm(
      `/orgs/${orgId}/projects/${projectId}/knowledge-bases/${kbId}/files`,
      fileToForm(file),
    );
  }

  async delete(kbId: string, fileId: string, params: Scope = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.delete(`/orgs/${orgId}/projects/${projectId}/knowledge-bases/${kbId}/files/${fileId}`);
  }
}

export class AudioAssets {
  constructor(private readonly c: Transport) {}

  async list(params: PaginationParams & Scope = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.get(`/orgs/${orgId}/projects/${projectId}/audio-assets`, pageQuery(params));
  }

  async upload(params: Scope & { name: string; file: UploadFile }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const projectId = await this.c.requireProjectId(params.project_id);
    return this.c.postForm(
      `/orgs/${orgId}/projects/${projectId}/audio-assets`,
      fileToForm(params.file, { name: params.name }),
    );
  }

  archive(assetId: string): Promise<JsonObject> {
    return this.c.post(`/audio-assets/${assetId}/archive`);
  }
}

export type { Query };
