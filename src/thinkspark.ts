// Kupe-ThinkSpark-Realtime — local audio-in, decision-out streaming.
//
//   npm install kupe-sdk
//   pip install kupe[thinkspark]   (runs the model; this class just streams to/from it)
//
// Not a floor controller. Just: give it audio, get decisions back.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface Decision {
  flag: string;
  spoken: string;
  latencyMs: number;
}

export interface ThinkSparkOptions {
  model?: string;
  device?: "auto" | "cuda" | "mps" | "cpu";
  sampleRate?: number;
}

const DEFAULT_MODEL = "anuj-inavlabs/Kupe-ThinkSpark-Realtime-270M";

/** Streams 80ms audio frames through Kupe-ThinkSpark-Realtime-270M via a local Python
 * runtime (`pip install kupe[thinkspark]`). Feed it audio from anywhere — a mic
 * capture library, a call leg, a file — get decisions back. */
export class ThinkSpark {
  private readonly model: string;
  private readonly device: string;
  private readonly sampleRate: number;

  constructor(opts: ThinkSparkOptions = {}) {
    this.model = opts.model ?? DEFAULT_MODEL;
    this.device = opts.device ?? "auto";
    this.sampleRate = opts.sampleRate ?? 24_000;
  }

  /** source: an async iterable of Float32Array frames (any chunk size — mic, call
   * audio, a file reader). Pass "mic" to read the default microphone. */
  async *stream(source: AsyncIterable<Float32Array> | "mic"): AsyncGenerator<Decision> {
    const proc = spawn("python3", [
      "-m", "kupe.thinkspark_bridge",
      "--model", this.model,
      "--device", this.device,
      "--sample-rate", String(this.sampleRate),
      ...(source === "mic" ? ["--source", "mic"] : ["--source", "stdin"]),
    ]);

    const lines = createInterface({ input: proc.stdout });
    const decisions = (async function* () {
      for await (const line of lines) {
        if (!line.trim()) continue;
        const d = JSON.parse(line);
        yield { flag: d.flag, spoken: d.spoken ?? "", latencyMs: d.latency_ms } as Decision;
      }
    })();

    if (source !== "mic") {
      (async () => {
        for await (const frame of source) {
          proc.stdin.write(Buffer.from(frame.buffer));
        }
        proc.stdin.end();
      })();
    }

    yield* decisions;
  }
}
