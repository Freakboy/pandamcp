import type { BrowserBackend, BrowserPage } from "./types.js";
import { CdpConnection, type CdpConnectionOptions } from "./raw-cdp-connection.js";

interface TargetResult {
  targetId: string;
}

interface AttachResult {
  sessionId: string;
}

interface RuntimeEvaluateResult {
  result?: {
    value?: unknown;
    unserializableValue?: string;
    description?: string;
  };
}

interface TargetInfo {
  targetId: string;
  url?: string;
  title?: string;
  type?: string;
}

interface TargetsResult {
  targetInfos?: TargetInfo[];
}

export class RawCdpBackend implements BrowserBackend {
  private readonly connection: CdpConnection;
  private readonly pages = new Map<string, { targetId: string; sessionId: string }>();

  constructor(options: CdpConnectionOptions) {
    this.connection = new CdpConnection(options);
  }

  connect(): Promise<void> {
    return this.connection.connect();
  }

  async close(): Promise<void> {
    this.connection.close();
  }

  async newPage(url?: string): Promise<BrowserPage> {
    const target = await this.connection.call<TargetResult>("Target.createTarget", {
      url: "about:blank"
    });
    const attached = await this.connection.call<AttachResult>("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true
    });

    this.pages.set(target.targetId, {
      targetId: target.targetId,
      sessionId: attached.sessionId
    });

    await this.connection.call("Page.enable", {}, attached.sessionId);
    await this.connection.call("Runtime.enable", {}, attached.sessionId);

    if (url) {
      return this.navigate(target.targetId, url);
    }

    return { pageId: target.targetId, url: "about:blank", title: "" };
  }

  async listPages(): Promise<BrowserPage[]> {
    const targets = await this.connection.call<TargetsResult>("Target.getTargets");
    return (targets.targetInfos ?? [])
      .filter((target) => target.type === "page" || !target.type)
      .map((target) => ({
        pageId: target.targetId,
        url: target.url ?? "",
        title: target.title ?? ""
      }));
  }

  async navigate(pageId: string, url: string): Promise<BrowserPage> {
    const page = await this.ensureAttached(pageId);
    await this.connection.call("Page.navigate", { url }, page.sessionId);
    return { pageId, url, title: await this.title(pageId) };
  }

  async title(pageId: string): Promise<string> {
    const value = await this.evaluateInPage(pageId, "document.title");
    return value == null ? "" : String(value);
  }

  async textContent(pageId: string, selector: string): Promise<string | null> {
    const value = await this.evaluateInPage(
      pageId,
      `document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`
    );
    return value == null ? null : String(value);
  }

  async content(pageId: string): Promise<string> {
    const value = await this.evaluateInPage(pageId, "document.documentElement.outerHTML");
    return value == null ? "" : String(value);
  }

  async evaluate(pageId: string, expression: string): Promise<unknown> {
    return this.evaluateInPage(pageId, expression);
  }

  async click(pageId: string, selector: string): Promise<void> {
    await this.evaluateInPage(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector not found: ${escapeForJs(selector)}");
        element.click();
        return true;
      })()`
    );
  }

  async fill(pageId: string, selector: string, value: string): Promise<void> {
    await this.evaluateInPage(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector not found: ${escapeForJs(selector)}");
        element.focus();
        element.value = ${JSON.stringify(value)};
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`
    );
  }

  async press(pageId: string, key: string): Promise<void> {
    await this.evaluateInPage(
      pageId,
      `(() => {
        const target = document.activeElement || document.body;
        target.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }));
        target.dispatchEvent(new KeyboardEvent("keyup", { key: ${JSON.stringify(key)}, bubbles: true }));
        return true;
      })()`
    );
  }

  async screenshot(
    pageId: string,
    _fullPage = false
  ): Promise<{ data: string; mimeType: string }> {
    const page = await this.ensureAttached(pageId);
    const result = await this.connection.call<{ data?: string }>(
      "Page.captureScreenshot",
      { format: "png" },
      page.sessionId
    );
    return { data: result.data ?? "", mimeType: "image/png" };
  }

  async closePage(pageId: string): Promise<void> {
    await this.connection.call("Target.closeTarget", { targetId: pageId });
    this.pages.delete(pageId);
  }

  private async evaluateInPage(pageId: string, expression: string): Promise<unknown> {
    const page = await this.ensureAttached(pageId);
    const result = await this.connection.call<RuntimeEvaluateResult>(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true
      },
      page.sessionId
    );
    return result.result?.value ?? result.result?.unserializableValue ?? result.result?.description;
  }

  private async ensureAttached(
    pageId: string
  ): Promise<{ targetId: string; sessionId: string }> {
    const existing = this.pages.get(pageId);
    if (existing) {
      return existing;
    }

    const attached = await this.connection.call<AttachResult>("Target.attachToTarget", {
      targetId: pageId,
      flatten: true
    });
    const page = { targetId: pageId, sessionId: attached.sessionId };
    this.pages.set(pageId, page);
    return page;
  }
}

function escapeForJs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
