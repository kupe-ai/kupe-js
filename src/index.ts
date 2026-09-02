export { Kupe } from "./client.js";
export {
  KupeError,
  APIError,
  APIConnectionError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  RateLimitError,
} from "./errors.js";
export { RealtimeConnection, realtimeWebsocketUrl, base64Pcm16Seconds, PCM16_SAMPLE_RATE } from "./realtime.js";
export { ThinkSpark } from "./thinkspark.js";
export type { Decision, ThinkSparkOptions } from "./thinkspark.js";
export type {
  RealtimeSocket,
  RealtimeSocketConstructor,
  RealtimeConnectOptions,
  RealtimeEchoOptions,
  EchoSuppression,
} from "./realtime.js";
export { DEFAULT_BASE_URL, joinUrl, normalizeBaseUrl, toV1Path } from "./http.js";
export type {
  Agent,
  AgentCreateParams,
  AgentUpdateParams,
  AuthKind,
  CreateRealtimeSessionParams,
  CreateSessionParams,
  JsonObject,
  JsonValue,
  KupeOptions,
  Me,
  Page,
  PaginationParams,
  RealtimeEvent,
  RealtimeSession,
  Session,
  UploadFile,
} from "./types.js";
