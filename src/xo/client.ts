import type {
  PromptRequest,
  PromptResponse,
  XoMessagesResponse,
  XoModel,
  XoSession,
  XoUsage,
  XoWorkspaceRoots,
} from "./types.js";

export interface XoClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Client for the local XO Space API (http://127.0.0.1:5002 by default).
 *
 * Verified empirically before this was written: a bare, header-less GET to
 * /api/config/workspace on loopback returns 200. Requests through 127.0.0.1
 * or localhost require no auth header — this client therefore never reads,
 * sends, or depends on XO_API_KEY.
 */
export class XoClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: XoClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:5002";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async health(): Promise<{ ok: boolean; status: number; body: unknown }> {
    const res = await this.fetchImpl(this.url("/health"));
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON or empty body is fine for a health probe
    }
    return { ok: res.ok, status: res.status, body };
  }

  async discoverWorkspace(): Promise<XoWorkspaceRoots> {
    const res = await this.fetchImpl(this.url("/api/config/workspace"));
    if (!res.ok) throw new Error(`discoverWorkspace failed: HTTP ${res.status}`);
    return (await res.json()) as XoWorkspaceRoots;
  }

  async discoverModelsOrAgents(): Promise<XoModel[]> {
    const res = await this.fetchImpl(this.url("/api/models"));
    if (!res.ok) throw new Error(`discoverModelsOrAgents failed: HTTP ${res.status}`);
    return (await res.json()) as XoModel[];
  }

  async prompt(request: PromptRequest): Promise<PromptResponse> {
    const res = await this.fetchImpl(this.url("/api/chat/prompt"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`prompt failed: HTTP ${res.status} ${detail}`);
    }
    return (await res.json()) as PromptResponse;
  }

  /** Opens the raw SSE stream response for a stream_id. Caller consumes it (see sse.ts). */
  async openStream(streamId: string, signal?: AbortSignal): Promise<Response> {
    const res = await this.fetchImpl(this.url(`/api/chat/stream/${encodeURIComponent(streamId)}`), {
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`openStream failed: HTTP ${res.status}`);
    }
    return res;
  }

  async abort(streamId: string): Promise<void> {
    await this.fetchImpl(this.url("/api/chat/abort"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stream_id: streamId }),
    });
  }

  async getSession(sessionId: string): Promise<XoSession | null> {
    const res = await this.fetchImpl(this.url(`/api/sessions/${encodeURIComponent(sessionId)}`));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getSession failed: HTTP ${res.status}`);
    return (await res.json()) as XoSession;
  }

  async getMessages(sessionId: string): Promise<XoMessagesResponse> {
    const res = await this.fetchImpl(this.url(`/api/messages/${encodeURIComponent(sessionId)}`));
    if (!res.ok) throw new Error(`getMessages failed: HTTP ${res.status}`);
    return (await res.json()) as XoMessagesResponse;
  }

  /** Never throws: usage telemetry is best-effort and marked unavailable rather than fabricated. */
  async getUsage(sessionId: string): Promise<XoUsage> {
    try {
      const res = await this.fetchImpl(this.url(`/api/usage/sessions/${encodeURIComponent(sessionId)}`));
      if (!res.ok) return { available: false, raw: null };
      return { available: true, raw: await res.json() };
    } catch {
      return { available: false, raw: null };
    }
  }
}
