# @kupe/sdk

Official TypeScript SDK for the [Kupe](https://kupe.in) voice-agent API.

```bash
npm install @kupe/sdk
```

Set `KUPE_API_KEY` (and optionally `KUPE_BASE_URL`). Paths are always `{base}/v1/...`.

```ts
import { Kupe } from "@kupe/sdk";

const kupe = new Kupe(); // reads KUPE_API_KEY / KUPE_BASE_URL
const session = await kupe.realtime.sessions.create({
  agent_id: "agt_...",
  voice: "priya",
});
const rt = await kupe.realtime.connect(session);
rt.send_text("Hi — remind them EMI is due tomorrow.");
for await (const event of rt) {
  if (event.type === "response.output_audio_transcript.done") {
    console.log(event.transcript);
  }
}
```

`new Kupe()` loads `org_id` / `project_id` from `GET /v1/me` when a method needs them. You can still pass them explicitly.

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
