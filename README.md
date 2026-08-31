# kupe-sdk

Official TypeScript SDK for the [Kupe](https://docs.kupe.in) voice-agent API.

```bash
npm install kupe-sdk
```

Docs: [https://docs.kupe.in](https://docs.kupe.in)

Set `KUPE_API_KEY` (and optionally `KUPE_BASE_URL`). Paths are always `{base}/v1/...`.

```ts
import { Kupe } from "kupe-sdk";

const kupe = new Kupe(); // reads KUPE_API_KEY / KUPE_BASE_URL
const session = await kupe.realtime.sessions.create({
  name: "Priya",
  voice: "priya",
  prompt: "You collect overdue EMIs. Be warm and brief.",
  greeting: "Hi, this is Priya from the bank.",
});
const rt = await kupe.realtime.connect(session);
rt.send_text("Hi — remind them EMI is due tomorrow.");
for await (const event of rt) {
  if (event.type === "response.output_audio_transcript.done") {
    console.log(event.transcript);
  }
}
```

Pass `name` or `agent_id` (copy it from the agent editor). If `name` is new, Kupe creates the agent with `prompt`, `greeting`, `voice`, and `tools`/`mcp`. An existing name is reused. Pass `voice` (name) or `voice_id` — either one.

`new Kupe()` loads `org_id` / `project_id` from `GET /v1/me` when a method needs them. You can still pass them explicitly.

Realtime audio is PCM16 mono at 24 kHz (`rt.appendAudio(pcm)`). Playing the agent
through open speakers next to the mic makes it hear and answer itself — pass
`kupe.realtime.connect(session, { echoSuppression: "half_duplex" })` to mute the
mic (send silence) while the agent speaks (no barge-in). In the browser keep the default
`"none"` and request the mic with `getUserMedia({ audio: { echoCancellation: true } })`,
which cancels the echo without losing barge-in.

## Resources

| Client | Maps to |
| --- | --- |
| `kupe.agents` | Agents, versions, tools, analyses, memories, tests |
| `kupe.realtime` | Mint session + WebSocket (`send_text`, PCM16 24 kHz) |
| `kupe.sessions` | Web (LiveKit) and telephony sessions |
| `kupe.inbound` | Inbound deployments |
| `kupe.campaigns` | Outbound batches / campaigns |
| `kupe.recipientLists` | Reusable recipient lists |
| `kupe.tools` / `kupe.composio` | Tool catalog + Composio |
| `kupe.analyses` | Post-call analyses |
| `kupe.databases` / `kupe.knowledgeBases` / `kupe.audioAssets` | Data + RAG + audio |
| `kupe.phones` | Search / buy / delete numbers |
| `kupe.voices` / `kupe.providers` | Voices + STT/LLM/TTS catalog |
| `kupe.logs` | Sessions, transcripts, recordings, tool-call events |
| `kupe.billing` | Wallet + invoices (no checkout) |
| `kupe.usage` | `cost-summary` + `daily` only |
| `kupe.orgs` / `kupe.projects` | Org and project helpers |

Voice clone / update / delete require a user JWT — API keys cannot own a voice.

## Build

```bash
npm install
npm test
npm run build
```

Produces dual CJS/ESM plus `.d.ts` in `dist/`.
