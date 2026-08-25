/** Shared request/response shapes. Extra API fields are allowed. */

export type JsonValue = unknown;
export type JsonObject = Record<string, unknown>;

export type AuthKind = "api_key" | "jwt";

export type PaginationParams = {
  limit?: number;
  offset?: number;
};

export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type Me = {
  org_id: string;
  project_id: string;
  auth: AuthKind;
  [key: string]: unknown;
};

export type Query = Record<string, string | number | boolean | null | undefined>;

export type KupeOptions = {
  apiKey?: string;
  baseUrl?: string;
  orgId?: string;
  projectId?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  WebSocket?: import("./realtime.js").RealtimeSocketConstructor;
};

export type Agent = {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  system_prompt: string;
  greeting?: string | null;
  llm_id: string;
  stt_id: string;
  tts_id: string;
  tts_voice_id?: string | null;
  config?: JsonObject;
  flow_definition?: JsonObject;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  auto_database_id?: string | null;
  [key: string]: unknown;
};

export type AgentCreateParams = {
  name: string;
  system_prompt: string;
  greeting?: string | null;
  llm_id?: string | null;
  stt_id?: string | null;
  tts_id?: string | null;
  tts_voice_id?: string | null;
  config?: JsonObject;
  flow_definition?: JsonObject;
};

export type AgentUpdateParams = Partial<AgentCreateParams>;

export type RealtimeSession = {
  id: string;
  object?: string;
  model?: string;
  modalities?: string[];
  instructions?: string;
  voice?: string;
  input_audio_format?: string;
  output_audio_format?: string;
  tools?: JsonObject[];
  client_secret: { value: string; expires_at: number };
  websocket_url: string;
  session_id?: string | null;
  agent_id?: string | null;
  [key: string]: unknown;
};

export type CreateRealtimeSessionParams = {
  agent_id?: string;
  id?: string;
  name?: string;
  org_id?: string;
  project_id?: string;
  voice?: string;
  voice_id?: string;
  prompt?: string;
  instructions?: string;
  greeting?: string;
  greetings?: string;
  tools?: JsonObject[];
  mcp?: JsonObject | JsonObject[];
  variables?: Record<string, string>;
};

export type RealtimeEvent = {
  type: string;
  transcript?: string;
  delta?: string;
  [key: string]: unknown;
};

export type Session = {
  session_id: string;
  org_id: string;
  project_id: string;
  channel: string;
  direction: "web" | "inbound" | "outbound" | string;
  status: string;
  [key: string]: unknown;
};

export type CreateSessionParams = {
  org_id?: string;
  project_id?: string;
  agent_id?: string;
  llm_id?: string;
  stt_id?: string;
  tts_id?: string;
  post_call_analysis_ids?: string[];
  variables?: Record<string, string>;
  channel?: "web" | "telephony";
  provider?: "twilio" | "plivo" | "exotel";
  record?: boolean;
};

export type BinaryBody = ArrayBuffer | Uint8Array | Blob | Buffer;

export type UploadFile = {
  data: BinaryBody;
  filename: string;
  contentType?: string;
};
