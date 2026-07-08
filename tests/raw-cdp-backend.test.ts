import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { RawCdpBackend } from "../src/browser/raw-cdp-backend.js";
import type { CdpSocket } from "../src/browser/raw-cdp-connection.js";

class FakeSocket implements CdpSocket {
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<string, Set<(event: { data: string }) => void>>();

  constructor(private readonly responder: typeof responseFor = responseFor) {}

  addEventListener(event: string, listener: (event: { data: string }) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeEventListener(event: string, listener: (event: { data: string }) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  send(payload: string): void {
    const message = JSON.parse(payload);
    this.sent.push(message);
    queueMicrotask(() => this.respond(message));
  }

  close(): void {}

  emitEvent(message: unknown): void {
    this.emit(message);
  }

  private respond(message: { id: number; method: string }): void {
    const result = this.responder(message);
    if (result instanceof Error) {
      this.emit({ id: message.id, error: { message: result.message }, sessionId: "SID-1" });
      return;
    }
    this.emit({ id: message.id, result, sessionId: "SID-1" });
  }

  private emit(message: unknown): void {
    const event = { data: JSON.stringify(message) };
    for (const listener of this.listeners.get("message") ?? []) {
      listener(event);
    }
  }
}

describe("RawCdpBackend", () => {
  test("creates a target, attaches, enables the page, and navigates", async () => {
    const socket = new FakeSocket();
    const backend = new RawCdpBackend({
      endpoint: "ws://127.0.0.1:9222/",
      connectSocket: async () => socket
    });

    await backend.connect();
    const page = await backend.newPage();
    await backend.navigate(page.pageId, "https://example.com");

    expect(methods(socket.sent)).toEqual([
      "Target.createTarget",
      "Target.attachToTarget",
      "Page.enable",
      "Runtime.enable",
      "Network.enable",
      "DOM.enable",
      "Log.enable",
      "Page.navigate",
      "Runtime.evaluate",
      "Runtime.evaluate"
    ]);
    expect(socket.sent.find(isPageNavigate)).toMatchObject({
      method: "Page.navigate",
      params: { url: "https://example.com" },
      sessionId: "SID-1"
    });
  });

  test("reads title and selector text through Runtime.evaluate", async () => {
    const socket = new FakeSocket();
    const backend = new RawCdpBackend({
      endpoint: "ws://127.0.0.1:9222/",
      connectSocket: async () => socket
    });

    await backend.connect();
    const page = await backend.newPage();

    await expect(backend.title(page.pageId)).resolves.toBe("Example");
    await expect(backend.textContent(page.pageId, "h1")).resolves.toBe("Hello");

    const runtimeCalls = socket.sent.filter(
      (message): message is { method: string; params: { expression: string } } =>
        typeof message === "object" &&
        message !== null &&
        "method" in message &&
        message.method === "Runtime.evaluate"
    );
    expect(runtimeCalls[0].params.expression).toBe("document.title");
    expect(runtimeCalls[1].params.expression).toContain("document.querySelector");
  });

  test("creates URL pages directly through Target.createTarget", async () => {
    const socket = new FakeSocket();
    const backend = new RawCdpBackend({
      endpoint: "ws://127.0.0.1:9222/",
      connectSocket: async () => socket
    });

    await backend.connect();
    await backend.newPage("https://example.com");

    expect(socket.sent[0]).toMatchObject({
      method: "Target.createTarget",
      params: { url: "https://example.com" }
    });
    expect(methods(socket.sent)).not.toContain("Page.navigate");
  });

  test("reuses an existing target when creating a target reports TargetAlreadyLoaded", async () => {
    const socket = new FakeSocket((message) => {
      if (message.method === "Target.createTarget") {
        return new Error("TargetAlreadyLoaded");
      }
      return responseFor(message);
    });
    const backend = new RawCdpBackend({
      endpoint: "ws://127.0.0.1:9222/",
      connectSocket: async () => socket
    });

    await backend.connect();
    const page = await backend.newPage("https://example.com");

    expect(page).toMatchObject({
      pageId: "TARGET-1",
      url: "https://example.com"
    });
    expect(methods(socket.sent)).toEqual([
      "Target.createTarget",
      "Target.getTargets",
      "Target.attachToTarget",
      "Page.enable",
      "Runtime.enable",
      "Network.enable",
      "DOM.enable",
      "Log.enable",
      "Page.navigate",
      "Runtime.evaluate",
      "Runtime.evaluate"
    ]);
  });

  test("waits for the page load event before resolving navigation", async () => {
    const socket = new FakeSocket((message) => {
      if (
        message.method === "Runtime.evaluate" &&
        message.params?.expression === "document.readyState === \"complete\""
      ) {
        return { result: { value: false } };
      }
      return responseFor(message);
    });
    const backend = new RawCdpBackend({
      endpoint: "ws://127.0.0.1:9222/",
      connectSocket: async () => socket
    });

    await backend.connect();
    const page = await backend.newPage();
    const navigation = backend.navigate(page.pageId, "https://example.com");
    let settled = false;
    void navigation.then(() => {
      settled = true;
    });

    await flushAsyncWork();
    expect(settled).toBe(false);

    socket.emitEvent({
      method: "Page.loadEventFired",
      params: { timestamp: 1 },
      sessionId: "SID-1"
    });

    await expect(navigation).resolves.toMatchObject({
      pageId: "TARGET-1",
      url: "https://example.com"
    });
  });

  test("accepts already-complete documents when the load event was missed", async () => {
    const socket = new FakeSocket((message) => {
      if (
        message.method === "Runtime.evaluate" &&
        message.params?.expression === "document.readyState === \"complete\""
      ) {
        return { result: { value: true } };
      }
      return responseFor(message);
    });
    const backend = new RawCdpBackend({
      endpoint: "ws://127.0.0.1:9222/",
      connectSocket: async () => socket
    });

    await backend.connect();
    const page = await backend.newPage();

    await expect(backend.navigate(page.pageId, "https://example.com")).resolves.toMatchObject({
      pageId: "TARGET-1",
      url: "https://example.com"
    });
  });

  test("reads web storage through the Storage key API", async () => {
    const socket = new FakeSocket();
    const backend = new RawCdpBackend({
      endpoint: "ws://127.0.0.1:9222/",
      connectSocket: async () => socket
    });

    await backend.connect();
    const page = await backend.newPage();

    await expect(backend.storage(page.pageId, "localStorage")).resolves.toEqual([
      { key: "pandamcp", value: "ok" }
    ]);
  });

  test("falls back to in-page file assignment when native CDP upload does not populate files", async () => {
    const socket = new FakeSocket();
    const backend = new RawCdpBackend({
      endpoint: "ws://127.0.0.1:9222/",
      connectSocket: async () => socket
    });
    const dir = await mkdtemp(join(tmpdir(), "pandamcp-test-"));
    const filePath = join(dir, "upload.txt");

    await writeFile(filePath, "hello");
    await backend.connect();
    const page = await backend.newPage();
    await backend.uploadFile(page.pageId, "input[type=file]", [filePath]);
    await rm(dir, { recursive: true, force: true });

    expect(methods(socket.sent)).toContain("DOM.setFileInputFiles");
    const fallbackCall = socket.sent.find(
      (message): message is { method: string; params: { expression: string } } =>
        typeof message === "object" &&
        message !== null &&
        "method" in message &&
        message.method === "Runtime.evaluate" &&
        "params" in message &&
        typeof message.params === "object" &&
        message.params !== null &&
        "expression" in message.params &&
        String(message.params.expression).includes("Object.defineProperty(element, \"files\"")
    );
    expect(fallbackCall?.params.expression).toContain("upload.txt");
  });
});

function methods(messages: unknown[]): string[] {
  return messages.map((message) => (message as { method: string }).method);
}

function isPageNavigate(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "method" in message &&
    message.method === "Page.navigate"
  );
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function responseFor(message: { method: string; params?: { expression?: string } }): unknown {
  const method = message.method;
  if (method === "Target.createTarget") {
    return { targetId: "TARGET-1" };
  }
  if (method === "Target.attachToTarget") {
    return { sessionId: "SID-1" };
  }
  if (method === "Target.getTargets") {
    return {
      targetInfos: [
        {
          targetId: "TARGET-1",
          type: "page",
          url: "about:blank",
          title: ""
        }
      ]
    };
  }
  if (method === "DOM.getDocument") {
    return { root: { nodeId: 1 } };
  }
  if (method === "DOM.querySelector") {
    return { nodeId: 2 };
  }
  if (method === "Runtime.evaluate") {
    if (message.params?.expression === "document.readyState === \"complete\"") {
      return {
        result: {
          value: true
        }
      };
    }
    if (message.params?.expression?.includes("element.files.length")) {
      return {
        result: {
          value: 0
        }
      };
    }
    if (message.params?.expression?.includes("Object.defineProperty")) {
      return {
        result: {
          value: true
        }
      };
    }
    if (message.params?.expression?.includes(".key(index)")) {
      return {
        result: {
          value: [{ key: "pandamcp", value: "ok" }]
        }
      };
    }
    return {
      result: {
        value: message.params?.expression === "document.title" ? "Example" : "Hello"
      }
    };
  }
  return {};
}
