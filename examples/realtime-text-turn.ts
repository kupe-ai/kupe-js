/**
 * Mint a Kupe realtime session and run one text turn over WebSocket.
 *
 *   KUPE_API_KEY=sk-kupe-... npx tsx examples/realtime-text-turn.ts
 */
import { Kupe } from "../src/index.js";

const agentId = process.env.KUPE_AGENT_ID ?? "agt_collections_demo";
const voice = process.env.KUPE_VOICE ?? "priya";

const kupe = new Kupe();
const session = await kupe.realtime.sessions.create({
  agent_id: agentId,
  voice,
});
console.log(`session ok — voice=${voice} ws=${session.websocket_url}`);

const rt = await kupe.realtime.connect(session);
rt.send_text("Hi — remind them EMI is due tomorrow.");

for await (const event of rt) {
  if (event.type === "response.output_audio.delta") continue;
  if (event.type === "response.output_audio_transcript.done") {
    console.log("agent:", event.transcript);
    continue;
  }
  if (event.type === "error") {
    console.error("error:", event);
    break;
  }
  if (
    event.type === "session.created" ||
    event.type === "response.created" ||
    event.type === "response.done" ||
    event.type === "response.output_audio.done"
  ) {
    console.log("event:", event.type);
  }
  if (event.type === "response.done") {
    rt.close();
  }
}
