import { describe, expect, test } from "vitest";

import { BrowserService } from "../src/browser/browser-service.js";
import type { BrowserBackend } from "../src/browser/types.js";

class FakeBackend {
  connectCount = 0;
  closeCount = 0;
  lastTextSelector?: string;
  lastNewPageUrl?: string;

  async connect() {
    this.connectCount += 1;
  }

  async close() {
    this.closeCount += 1;
  }
  async closePage() {}

  async newPage(url?: string) {
    this.lastNewPageUrl = url;
    return { pageId: "page-1", url: url ?? "about:blank", title: "" };
  }

  async listPages() {
    return [{ pageId: "page-1", url: "about:blank", title: "" }];
  }

  async navigate(pageId: string, url: string) {
    return { pageId, url, title: "Example" };
  }

  async title() {
    return "Example";
  }

  async textContent(_pageId: string, selector: string) {
    this.lastTextSelector = selector;
    return "Hello";
  }

  async content() {
    return "<html>Hello</html>";
  }

  async evaluate() {
    return { ok: true };
  }

  async click() {}
  async fill() {}
  async press() {}

  async screenshot() {
    return { data: "base64", mimeType: "image/png" };
  }
}

function backend(): BrowserBackend {
  return new FakeBackend() as unknown as BrowserBackend;
}

describe("BrowserService", () => {
  test("creates a page before navigation when pageId is omitted", async () => {
    const fakeBackend = new FakeBackend();
    const service = new BrowserService(fakeBackend as unknown as BrowserBackend);
    const result = await service.navigate({ url: "https://example.com" });

    expect(result.pageId).toBe("page-1");
    expect(result.url).toBe("https://example.com");
    expect(fakeBackend.lastNewPageUrl).toBe("https://example.com");
  });

  test("normalizes locator text calls", async () => {
    const service = new BrowserService(backend());

    await expect(
      service.textContent({ pageId: "page-1", selector: "h1" })
    ).resolves.toEqual({
      pageId: "page-1",
      selector: "h1",
      text: "Hello"
    });
  });

  test("reads body text directly", async () => {
    const backend = new FakeBackend();
    const service = new BrowserService(backend as unknown as BrowserBackend);

    await expect(service.bodyText("page-1")).resolves.toEqual({
      pageId: "page-1",
      text: "Hello"
    });
    expect(backend.lastTextSelector).toBe("body");
  });

  test("returns evaluate results with page context", async () => {
    const service = new BrowserService(backend());

    await expect(
      service.evaluate({ pageId: "page-1", expression: "location.href" })
    ).resolves.toEqual({
      pageId: "page-1",
      result: { ok: true }
    });
  });

  test("reconnects automatically after the browser is closed", async () => {
    const backend = new FakeBackend();
    const service = new BrowserService(backend as unknown as BrowserBackend);

    await service.connect();
    await service.close();
    await expect(service.listPages()).resolves.toEqual([
      { pageId: "page-1", url: "about:blank", title: "" }
    ]);

    expect(backend.connectCount).toBe(2);
    expect(backend.closeCount).toBe(1);
  });
});
