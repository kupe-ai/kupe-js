import type { Transport } from "../api-client.js";
import { fileToForm } from "../api-client.js";
import type { JsonObject, Page, PaginationParams, UploadFile } from "../types.js";
import { pageQuery } from "./core.js";

export class Phones {
  readonly compliance: PhoneCompliance;
  readonly ucc: PhoneUcc;

  constructor(private readonly c: Transport) {
    this.compliance = new PhoneCompliance(c);
    this.ucc = new PhoneUcc(c);
  }

  async search(params: { org_id?: string; country_iso: "US" | "IN" | string; pattern?: string }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/plivo/numbers/search`, {
      country_iso: params.country_iso,
      pattern: params.pattern,
    });
  }

  async buy(params: {
    org_id?: string;
    number: string;
    country_iso: "US" | "IN" | string;
    compliance_application_id?: string;
  }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const { org_id: _o, ...body } = params;
    return this.c.post(`/orgs/${orgId}/plivo/numbers/purchase`, body);
  }

  async create(params: {
    org_id?: string;
    provider: "twilio" | "plivo" | "exotel";
    account_sid: string;
    api_key: string;
    from_number: string;
    label?: string;
    exotel_subdomain?: string;
    is_default?: boolean;
  }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const { org_id: _o, ...body } = params;
    return this.c.post(`/orgs/${orgId}/telephony-accounts`, body);
  }

  async list(params: { org_id?: string } = {}): Promise<JsonObject[]> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/telephony-accounts`);
  }

  retrieve(accountId: string): Promise<JsonObject> {
    return this.c.get(`/telephony-accounts/${accountId}`);
  }

  update(accountId: string, params: { label?: string }): Promise<JsonObject> {
    return this.c.patch(`/telephony-accounts/${accountId}`, params);
  }

  delete(accountId: string): Promise<void> {
    return this.c.delete(`/telephony-accounts/${accountId}`);
  }
}

class PhoneCompliance {
  constructor(private readonly c: Transport) {}

  async requirements(params: { org_id?: string } = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/plivo/compliance/requirements`);
  }

  async status(params: { org_id?: string } = {}): Promise<JsonObject | null> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/plivo/compliance`);
  }

  async submit(params: { org_id?: string } & JsonObject): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    const { org_id: _o, ...body } = params;
    return this.c.post(`/orgs/${orgId}/plivo/compliance`, body);
  }

  async refresh(params: { org_id?: string } = {}): Promise<JsonObject | null> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.post(`/orgs/${orgId}/plivo/compliance/refresh`);
  }
}

class PhoneUcc {
  constructor(private readonly c: Transport) {}

  async list(
    params: { org_id?: string; status?: string; from_number?: string } = {},
  ): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/plivo/ucc`, {
      status: params.status,
      from_number: params.from_number,
    });
  }

  async summary(params: { org_id?: string } = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/plivo/ucc/summary`);
  }

  async retrieve(referenceId: string, params: { org_id?: string } = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/plivo/ucc/${referenceId}`);
  }

  async submitProof(
    referenceId: string,
    params: { org_id?: string; file: UploadFile },
  ): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.postForm(
      `/orgs/${orgId}/plivo/ucc/${referenceId}/proof`,
      fileToForm(params.file),
    );
  }

  async sync(params: { org_id?: string } = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.post(`/orgs/${orgId}/plivo/ucc/sync`);
  }
}

export class Voices {
  constructor(private readonly c: Transport) {}

  list(params: { provider_id?: string; provider?: string } = {}): Promise<{ items: JsonObject[] }> {
    return this.c.get("/voices", params);
  }

  /** Cloned voices owned by the signed-in user. JWT only. */
  async listMine(params: { provider?: string } = {}): Promise<{ items: JsonObject[] }> {
    await this.c.requireJwt("Listing your cloned voices");
    return this.list(params);
  }

  async clone(params: { name: string; sample: UploadFile; is_public?: boolean }): Promise<JsonObject> {
    await this.c.requireJwt("Voice clone");
    return this.c.postForm(
      "/voices/clone",
      fileToForm(params.sample, {
        name: params.name,
        is_public: params.is_public ? "true" : "false",
      }, "sample"),
    );
  }

  async update(voiceId: string, params: { name?: string; is_public?: boolean } = {}): Promise<JsonObject> {
    await this.c.requireJwt("Voice update");
    const form = new FormData();
    if (params.name !== undefined) form.append("name", params.name);
    if (params.is_public !== undefined) form.append("is_public", String(params.is_public));
    return this.c.patchForm(`/voices/${voiceId}`, form);
  }

  async delete(voiceId: string, params: { fallback_voice_id?: string } = {}): Promise<void> {
    await this.c.requireJwt("Voice delete");
    return this.c.delete(`/voices/${voiceId}`, params);
  }

  async usage(voiceId: string): Promise<JsonObject> {
    await this.c.requireJwt("Voice usage");
    return this.c.get(`/voices/${voiceId}/usage`);
  }

  preview(voiceId: string): Promise<ArrayBuffer> {
    return this.c.getBinary(`/voices/${voiceId}/preview`);
  }

  async speak(
    voiceId: string,
    params: { text: string; org_id?: string; language?: string; speed?: number; pitch?: number },
  ): Promise<ArrayBuffer> {
    await this.c.requireJwt("Voice speak");
    const org_id = await this.c.requireOrgId(params.org_id);
    return this.c.postBinary(`/voices/${voiceId}/speak`, { ...params, org_id });
  }
}

export class Providers {
  constructor(private readonly c: Transport) {}

  list(): Promise<JsonObject> {
    return this.c.get("/providers");
  }
}

export class Logs {
  constructor(private readonly c: Transport) {}

  async sessions(params: PaginationParams & { org_id?: string } = {}): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/sessions`, pageQuery(params));
  }

  transcript(sessionId: string): Promise<JsonObject> {
    return this.c.get(`/sessions/${sessionId}/transcript`);
  }

  recording(sessionId: string): Promise<JsonObject> {
    return this.c.get(`/sessions/${sessionId}/recording`);
  }

  async recordings(params: PaginationParams & { org_id?: string } = {}): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/recordings`, pageQuery(params));
  }

  playbackUrl(recordingId: string): Promise<JsonObject> {
    return this.c.get(`/recordings/${recordingId}/playback-url`);
  }

  async toolCallEvents(
    params: PaginationParams & { org_id?: string; agent_id?: string } = {},
  ): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/tool-call-events`, {
      ...pageQuery(params),
      agent_id: params.agent_id,
    });
  }

  async toolCallStats(agentId: string, params: { org_id?: string } = {}): Promise<JsonObject[]> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/agents/${agentId}/tool-call-stats`);
  }
}

export class Billing {
  readonly invoices: BillingInvoices;

  constructor(private readonly c: Transport) {
    this.invoices = new BillingInvoices(c);
  }

  async wallet(params: { org_id?: string; currency?: string } = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/billing/wallet`, { currency: params.currency });
  }
}

class BillingInvoices {
  constructor(private readonly c: Transport) {}

  async list(
    params: PaginationParams & { org_id?: string; currency?: string } = {},
  ): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/billing/invoices`, {
      ...pageQuery(params),
      currency: params.currency,
    });
  }

  async pdf(invoiceId: string, params: { org_id?: string } = {}): Promise<ArrayBuffer> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.getBinary(`/orgs/${orgId}/billing/invoices/${invoiceId}/pdf`);
  }
}

/** Usage: `cost-summary` + `daily` only. Per-service breakdown is not exposed. */
export class Usage {
  constructor(private readonly c: Transport) {}

  async costSummary(
    params: { org_id?: string; start_date?: string; end_date?: string; currency?: string } = {},
  ): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/usage/cost-summary`, {
      start_date: params.start_date,
      end_date: params.end_date,
      currency: params.currency,
    });
  }

  async daily(
    params: { start_date: string; end_date: string; org_id?: string; currency?: string } & PaginationParams,
  ): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/usage/daily`, {
      ...pageQuery(params),
      start_date: params.start_date,
      end_date: params.end_date,
      currency: params.currency,
    });
  }
}

export class Orgs {
  constructor(private readonly c: Transport) {}

  create(params: { name: string }): Promise<JsonObject> {
    return this.c.post("/orgs", params);
  }

  list(params: PaginationParams = {}): Promise<Page<JsonObject>> {
    return this.c.get("/orgs", pageQuery(params));
  }

  retrieve(orgId?: string): Promise<JsonObject> {
    return this.c.requireOrgId(orgId).then((id) => this.c.get(`/orgs/${id}`));
  }

  update(params: { org_id?: string; country?: string; timezone?: string }): Promise<JsonObject> {
    return this.c.requireOrgId(params.org_id).then((id) => {
      const { org_id: _o, ...body } = params;
      return this.c.patch(`/orgs/${id}`, body);
    });
  }

  async balance(params: { org_id?: string } = {}): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/balance`);
  }
}

export class Projects {
  constructor(private readonly c: Transport) {}

  async create(params: { org_id?: string; name: string }): Promise<JsonObject> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.post(`/orgs/${orgId}/projects`, { name: params.name });
  }

  async list(params: PaginationParams & { org_id?: string } = {}): Promise<Page<JsonObject>> {
    const orgId = await this.c.requireOrgId(params.org_id);
    return this.c.get(`/orgs/${orgId}/projects`, pageQuery(params));
  }

  archive(projectId: string): Promise<JsonObject> {
    return this.c.post(`/projects/${projectId}/archive`);
  }
}
