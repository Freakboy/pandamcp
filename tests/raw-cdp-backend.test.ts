import { describe, expect, test } from "vitest";

import { RawCdpBackend } from "../src/browser/raw-cdp-backend.js";
import type { CdpSocket } from "../src/browser/raw-cdp-connection.js";

class FakeSocket implements CdpSocket {
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<string, Set<(event: { data: string }) => void>>();

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

  private respond(message: { id: number; method: string }): void {
    const result = responseFor(message);
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
      "Page.navigate",
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

function responseFor(message: { method: string; params?: { expression?: string } }): unknown {
  const method = message.method;
  if (method === "Target.createTarget") {
    return { targetId: "TARGET-1" };
  }
  if (method === "Target.attachToTarget") {
    return { sessionId: "SID-1" };
  }
  if (method === "Runtime.evaluate") {
    return {
      result: {
        value: message.params?.expression === "document.title" ? "Example" : "Hello"
      }
    };
  }
  return {};
}
