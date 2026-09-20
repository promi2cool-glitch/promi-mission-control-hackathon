import type { XoSseEvent, XoSseEventType } from "./types.js";
import { KNOWN_SSE_EVENT_TYPES } from "./types.js";

function classify(rawType: string): XoSseEventType {
  return (KNOWN_SSE_EVENT_TYPES as readonly string[]).includes(rawType)
    ? (rawType as XoSseEventType)
    : "unknown";
}

/**
 * Parses one raw SSE event block (already split on the blank-line delimiter)
 * into a normalized XoSseEvent. Never throws: a `data:` payload that isn't
 * valid JSON is preserved as a string with `parse_error` set, rather than
 * dropped or allowed to crash the stream consumer. Returns null for an
 * effectively empty block (e.g. a bare keepalive comment).
 */
export function parseSseEventBlock(block: string): XoSseEvent | null {
  let id: string | null = null;
  let rawType = "message";
  const dataLines: string[] = [];
  let sawField = false;

  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    sawField = true;
    if (field === "id") id = value;
    else if (field === "event") rawType = value;
    else if (field === "data") dataLines.push(value);
  }

  if (!sawField) return null;

  const rawData = dataLines.join("\n");
  let data: unknown = null;
  let parse_error: string | null = null;
  if (rawData.length > 0) {
    try {
      data = JSON.parse(rawData);
    } catch (e) {
      data = rawData;
      parse_error = e instanceof Error ? e.message : "invalid JSON in data field";
    }
  }

  return {
    type: classify(rawType),
    raw_type: rawType,
    id,
    data,
    parse_error,
    received_at: new Date().toISOString(),
  };
}

/** Incrementally buffers raw SSE text and yields complete parsed events as they arrive. */
export class SseBuffer {
  private buffer = "";

  push(chunk: string): XoSseEvent[] {
    this.buffer += chunk;
    const events: XoSseEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const event = parseSseEventBlock(block);
      if (event) events.push(event);
    }
    return events;
  }
}

/**
 * Consumes a fetch Response body as an SSE stream, yielding normalized
 * events as they arrive. Purely mechanical — see dispatch.ts for the
 * done/agent-error/timeout state machine built on top of this.
 */
export async function* consumeSseStream(response: Response): AsyncGenerator<XoSseEvent> {
  if (!response.body) {
    throw new Error("consumeSseStream: response has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const buffer = new SseBuffer();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        for (const event of buffer.push(decoder.decode(value, { stream: true }))) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
