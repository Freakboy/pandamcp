export interface CdpSocket {
  addEventListener(event: string, listener: (event: { data: string }) => void): void;
  removeEventListener(event: string, listener: (event: { data: string }) => void): void;
  send(payload: string): void;
  close(): void;
}

export interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string; code?: number };
  sessionId?: string;
}

export interface CdpConnectionOptions {
  endpoint: string;
  connectSocket?: (webSocketUrl: string) => Promise<CdpSocket>;
  timeoutMs?: number;
}

export class CdpConnection {
  private nextId = 0;
  private socket?: CdpSocket;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();

  constructor(private readonly options: CdpConnectionOptions) {}

  async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    const webSocketUrl = await resolveWebSocketUrl(this.options.endpoint);
    this.socket = this.options.connectSocket
      ? await this.options.connectSocket(webSocketUrl)
      : await connectWebSocket(webSocketUrl);
    this.socket.addEventListener("message", this.handleMessage);
  }

  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<T> {
    if (!this.socket) {
      throw new Error("CDP socket is not connected");
    }

    const id = ++this.nextId;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }

    const response = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP call timed out: ${method}`));
      }, this.options.timeoutMs ?? 10_000);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });
    });

    this.socket.send(JSON.stringify(payload));
    return response;
  }

  close(): void {
    this.socket?.removeEventListener("message", this.handleMessage);
    this.socket?.close();
    this.socket = undefined;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`CDP connection closed before response ${id}`));
    }
    this.pending.clear();
  }

  private readonly handleMessage = (event: { data: string }): void => {
    const message = JSON.parse(event.data) as CdpMessage;
    if (!message.id) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? `CDP error ${message.error.code}`));
    } else {
      pending.resolve(message.result);
    }
  };
}

async function resolveWebSocketUrl(endpoint: string): Promise<string> {
  if (endpoint.startsWith("ws://") || endpoint.startsWith("wss://")) {
    return endpoint;
  }

  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const response = await fetch(`${base}/json/version`);
  if (!response.ok) {
    throw new Error(`Failed to read CDP version from ${base}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!body.webSocketDebuggerUrl) {
    throw new Error(`CDP version response from ${base} did not include webSocketDebuggerUrl`);
  }
  return body.webSocketDebuggerUrl.replace("ws://0.0.0.0", "ws://127.0.0.1");
}

function connectWebSocket(webSocketUrl: string): Promise<CdpSocket> {
  const socket = new WebSocket(webSocketUrl) as unknown as CdpSocket;
  return new Promise((resolve, reject) => {
    const onOpen = () => resolve(socket);
    const onError = () => reject(new Error(`Failed to connect CDP WebSocket: ${webSocketUrl}`));
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
  });
}
