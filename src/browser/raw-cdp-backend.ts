import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type {
  AccessibilityNode,
  BrowserBackend,
  BrowserContextInfo,
  BrowserCookie,
  BrowserPage,
  ConsoleEvent,
  DownloadBehavior,
  FrameInfo,
  LoadState,
  NetworkEvent,
  PageInfo,
  StorageEntry,
  StorageType,
  UrlMatcher,
  WaitForSelectorOptions
} from "./types.js";
import { CdpConnection, type CdpConnectionOptions, type CdpMessage } from "./raw-cdp-connection.js";

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
  exceptionDetails?: {
    text?: string;
    exception?: { description?: string };
  };
}

interface TargetInfo {
  targetId: string;
  url?: string;
  title?: string;
  type?: string;
  browserContextId?: string;
}

interface TargetsResult {
  targetInfos?: TargetInfo[];
}

interface BrowserContextsResult {
  browserContextIds?: string[];
}

interface CreateBrowserContextResult {
  browserContextId: string;
}

interface HistoryResult {
  currentIndex: number;
  entries: Array<{ id: number }>;
}

interface LayoutMetricsResult {
  contentSize?: { x?: number; y?: number; width: number; height: number };
}

interface FrameTreeNode {
  frame: {
    id: string;
    parentId?: string;
    url?: string;
    name?: string;
    mimeType?: string;
  };
  childFrames?: FrameTreeNode[];
}

interface FrameTreeResult {
  frameTree: FrameTreeNode;
}

export class RawCdpBackend implements BrowserBackend {
  private readonly connection: CdpConnection;
  private readonly pages = new Map<string, { targetId: string; sessionId: string; contextId?: string }>();
  private readonly networkLog = new Map<string, NetworkEvent[]>();
  private readonly consoleLog = new Map<string, ConsoleEvent[]>();
  private tracingPageId?: string;
  private tracingFallbackStartedAt?: number;
  private unsubscribeEvents?: () => void;
  private readonly automaticLoadTimeoutMs = 30_000;

  constructor(options: CdpConnectionOptions) {
    this.connection = new CdpConnection(options);
  }

  async connect(): Promise<void> {
    await this.connection.connect();
    this.unsubscribeEvents ??= this.connection.onEvent((message) => this.recordEvent(message));
  }

  async close(): Promise<void> {
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = undefined;
    this.connection.close();
    this.pages.clear();
    this.networkLog.clear();
    this.consoleLog.clear();
  }

  async newPage(url?: string, contextId?: string): Promise<BrowserPage> {
    const { target, reused } = await this.createTargetOrReuseExisting(url, contextId);
    const page = await this.ensureAttached(target.targetId, target.browserContextId ?? contextId);

    if (url) {
      if (reused) {
        await this.connection.call("Page.navigate", { url }, page.sessionId);
      }
      await this.waitForPageLoad(target.targetId);
      const info = await this.pageInfo(target.targetId);
      return { pageId: target.targetId, url: info.url || url, title: info.title, contextId: page.contextId };
    }

    return { pageId: target.targetId, url: "about:blank", title: "", contextId: page.contextId };
  }

  async listPages(): Promise<BrowserPage[]> {
    const targets = await this.connection.call<TargetsResult>("Target.getTargets");
    return (targets.targetInfos ?? [])
      .filter((target) => target.type === "page" || !target.type)
      .map((target) => ({
        pageId: target.targetId,
        url: target.url ?? "",
        title: target.title ?? "",
        contextId: target.browserContextId
      }));
  }

  async navigate(pageId: string, url: string): Promise<BrowserPage> {
    const page = await this.ensureAttached(pageId);
    await this.connection.call("Page.navigate", { url }, page.sessionId);
    await this.waitForPageLoad(pageId);
    const info = await this.pageInfo(pageId);
    return { pageId, url: info.url || url, title: info.title, contextId: page.contextId };
  }

  async reload(pageId: string): Promise<BrowserPage> {
    const page = await this.ensureAttached(pageId);
    await this.connection.call("Page.reload", {}, page.sessionId);
    await this.waitForPageLoad(pageId);
    return this.pageInfo(pageId);
  }

  async goBack(pageId: string): Promise<BrowserPage> {
    return this.navigateHistory(pageId, -1);
  }

  async goForward(pageId: string): Promise<BrowserPage> {
    return this.navigateHistory(pageId, 1);
  }

  async pageInfo(pageId: string): Promise<PageInfo> {
    const page = await this.ensureAttached(pageId);
    const value = (await this.evaluateInPage(
      pageId,
      `(() => ({
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          deviceScaleFactor: window.devicePixelRatio || 1,
          isMobile: /Mobi|Android/i.test(navigator.userAgent)
        },
        userAgent: navigator.userAgent
      }))()`
    )) as Partial<PageInfo> | null;

    return {
      pageId,
      url: value?.url ?? "",
      title: value?.title ?? "",
      readyState: value?.readyState ?? "",
      viewport: value?.viewport ?? {
        width: 0,
        height: 0,
        deviceScaleFactor: 1,
        isMobile: false
      },
      userAgent: value?.userAgent ?? "",
      contextId: page.contextId
    };
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

  async waitForSelector(
    pageId: string,
    selector: string,
    options: WaitForSelectorOptions = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const pollMs = options.pollMs ?? 100;
    await this.waitForExpression(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        if (!${JSON.stringify(options.visible ?? false)}) return true;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      })()`,
      timeoutMs,
      pollMs
    );
  }

  async waitForUrl(pageId: string, matcher: UrlMatcher, timeoutMs = 5_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const url = String(await this.evaluateInPage(pageId, "location.href"));
      if (matchesUrl(url, matcher)) {
        return url;
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for URL to match ${JSON.stringify(matcher)}`);
  }

  async waitForLoadState(pageId: string, state: LoadState, timeoutMs = 10_000): Promise<void> {
    if (state === "networkidle") {
      await this.waitForNetworkIdle(pageId, timeoutMs);
      return;
    }
    const expected = state === "domcontentloaded" ? "interactive" : "complete";
    await this.waitForExpression(
      pageId,
      `document.readyState === ${JSON.stringify(expected)} || document.readyState === "complete"`,
      timeoutMs,
      100
    );
  }

  async waitForExpression(
    pageId: string,
    expression: string,
    timeoutMs = 5_000,
    pollMs = 100
  ): Promise<unknown> {
    const deadline = Date.now() + timeoutMs;
    let lastValue: unknown;
    while (Date.now() <= deadline) {
      lastValue = await this.evaluateInPage(pageId, expression);
      if (lastValue) {
        return lastValue;
      }
      await sleep(pollMs);
    }
    throw new Error(`Timed out waiting for expression: ${expression}`);
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

  async hover(pageId: string, selector: string): Promise<void> {
    const page = await this.ensureAttached(pageId);
    const point = await this.elementCenter(pageId, selector);
    await this.connection.call(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: point.x, y: point.y },
      page.sessionId
    );
  }

  async selectOption(pageId: string, selector: string, values: string[]): Promise<string[]> {
    const result = await this.evaluateInPage(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector not found: ${escapeForJs(selector)}");
        const values = ${JSON.stringify(values)};
        for (const option of element.options ?? []) {
          option.selected = values.includes(option.value);
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return Array.from(element.selectedOptions ?? []).map((option) => option.value);
      })()`
    );
    return Array.isArray(result) ? result.map(String) : [];
  }

  async dragAndDrop(pageId: string, sourceSelector: string, targetSelector: string): Promise<void> {
    await this.evaluateInPage(
      pageId,
      `(() => {
        const source = document.querySelector(${JSON.stringify(sourceSelector)});
        const target = document.querySelector(${JSON.stringify(targetSelector)});
        if (!source) throw new Error("Source selector not found: ${escapeForJs(sourceSelector)}");
        if (!target) throw new Error("Target selector not found: ${escapeForJs(targetSelector)}");
        const dataTransfer = new DataTransfer();
        for (const [element, type] of [[source, "dragstart"], [target, "dragenter"], [target, "dragover"], [target, "drop"], [source, "dragend"]]) {
          element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
        }
        return true;
      })()`
    );
  }

  async uploadFile(pageId: string, selector: string, paths: string[]): Promise<void> {
    const page = await this.ensureAttached(pageId);
    try {
      const root = await this.connection.call<{ root?: { nodeId?: number } }>(
        "DOM.getDocument",
        {},
        page.sessionId
      );
      const rootNodeId = root.root?.nodeId;
      if (!rootNodeId) {
        throw new Error("Unable to read DOM root for file upload");
      }
      const node = await this.connection.call<{ nodeId?: number }>(
        "DOM.querySelector",
        { nodeId: rootNodeId, selector },
        page.sessionId
      );
      if (!node.nodeId) {
        throw new Error(`Selector not found: ${selector}`);
      }
      await this.connection.call("DOM.setFileInputFiles", { nodeId: node.nodeId, files: paths }, page.sessionId);
      if ((await this.fileInputFileCount(pageId, selector)) !== paths.length) {
        await this.injectFileInputFiles(pageId, selector, paths);
      }
    } catch (error) {
      if (!isFileUploadFallbackError(error)) {
        throw error;
      }
      await this.injectFileInputFiles(pageId, selector, paths);
    }
  }

  async focus(pageId: string, selector: string): Promise<void> {
    await this.evaluateInPage(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector not found: ${escapeForJs(selector)}");
        element.focus();
        return true;
      })()`
    );
  }

  async blur(pageId: string, selector: string): Promise<void> {
    await this.evaluateInPage(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector not found: ${escapeForJs(selector)}");
        element.blur();
        return true;
      })()`
    );
  }

  async screenshot(pageId: string, fullPage = false): Promise<{ data: string; mimeType: string }> {
    const page = await this.ensureAttached(pageId);
    const params: Record<string, unknown> = { format: "png" };
    if (fullPage) {
      const metrics = await this.connection.call<LayoutMetricsResult>("Page.getLayoutMetrics", {}, page.sessionId);
      const size = metrics.contentSize;
      if (size) {
        params.captureBeyondViewport = true;
        params.clip = {
          x: size.x ?? 0,
          y: size.y ?? 0,
          width: size.width,
          height: size.height,
          scale: 1
        };
      }
    }
    const result = await this.connection.call<{ data?: string }>(
      "Page.captureScreenshot",
      params,
      page.sessionId
    );
    return { data: result.data ?? "", mimeType: "image/png" };
  }

  async networkEvents(pageId: string, limit = 50): Promise<NetworkEvent[]> {
    return tail(this.networkLog.get(pageId) ?? [], limit);
  }

  async responseBody(pageId: string, requestId: string): Promise<{ body: string; base64Encoded: boolean }> {
    const page = await this.ensureAttached(pageId);
    return this.connection.call<{ body: string; base64Encoded: boolean }>(
      "Network.getResponseBody",
      { requestId },
      page.sessionId
    );
  }

  async consoleEvents(pageId: string, limit = 50): Promise<ConsoleEvent[]> {
    return tail(this.consoleLog.get(pageId) ?? [], limit);
  }

  async cookies(pageId: string): Promise<BrowserCookie[]> {
    const page = await this.ensureAttached(pageId);
    const info = await this.pageInfo(pageId);
    const result = await this.connection.call<{ cookies?: BrowserCookie[] }>(
      "Network.getCookies",
      { urls: [info.url] },
      page.sessionId
    );
    return result.cookies ?? [];
  }

  async setCookie(pageId: string, cookie: BrowserCookie): Promise<void> {
    const page = await this.ensureAttached(pageId);
    const info = await this.pageInfo(pageId);
    await this.connection.call("Network.setCookie", { url: info.url, ...cookie }, page.sessionId);
  }

  async clearCookies(_pageId: string): Promise<void> {
    await this.connection.call("Network.clearBrowserCookies");
  }

  async storage(pageId: string, type: StorageType): Promise<StorageEntry[]> {
    const result = await this.evaluateInPage(
      pageId,
      `Array.from({ length: ${type}.length }, (_, index) => {
        const key = ${type}.key(index);
        return key == null ? null : { key, value: ${type}.getItem(key) ?? "" };
      }).filter(Boolean)`
    );
    return Array.isArray(result) ? (result as StorageEntry[]) : [];
  }

  async setStorage(pageId: string, type: StorageType, key: string, value: string): Promise<void> {
    await this.evaluateInPage(pageId, `${type}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}); true`);
  }

  async clearStorage(pageId: string, type: StorageType): Promise<void> {
    await this.evaluateInPage(pageId, `${type}.clear(); true`);
  }

  async grantPermissions(pageId: string, permissions: string[]): Promise<void> {
    const info = await this.pageInfo(pageId);
    await this.connection.call("Browser.grantPermissions", {
      origin: originFor(info.url),
      permissions
    });
  }

  async resetPermissions(_pageId: string): Promise<void> {
    await this.connection.call("Browser.resetPermissions");
  }

  async setGeolocation(pageId: string, latitude: number, longitude: number, accuracy = 100): Promise<void> {
    const page = await this.ensureAttached(pageId);
    await this.connection.call(
      "Emulation.setGeolocationOverride",
      { latitude, longitude, accuracy },
      page.sessionId
    );
  }

  async listFrames(pageId: string): Promise<FrameInfo[]> {
    const page = await this.ensureAttached(pageId);
    const result = await this.connection.call<FrameTreeResult>("Page.getFrameTree", {}, page.sessionId);
    const frames: FrameInfo[] = [];
    visitFrameTree(result.frameTree, frames);
    return frames;
  }

  async frameEvaluate(pageId: string, frameSelector: string, expression: string): Promise<unknown> {
    return this.evaluateInPage(
      pageId,
      `(() => {
        const frame = document.querySelector(${JSON.stringify(frameSelector)});
        if (!frame) throw new Error("Frame selector not found: ${escapeForJs(frameSelector)}");
        if (!frame.contentWindow) throw new Error("Frame contentWindow is not available");
        if (typeof frame.contentWindow.eval === "function") {
          return frame.contentWindow.eval(${JSON.stringify(expression)});
        }
        return Function("window", "document", "return (" + ${JSON.stringify(expression)} + ");")(
          frame.contentWindow,
          frame.contentDocument
        );
      })()`
    );
  }

  async createContext(): Promise<BrowserContextInfo> {
    const result = await this.connection.call<CreateBrowserContextResult>("Target.createBrowserContext");
    return { contextId: result.browserContextId, isDefault: false };
  }

  async listContexts(): Promise<BrowserContextInfo[]> {
    const result = await this.connection.call<BrowserContextsResult>("Target.getBrowserContexts");
    return [
      { contextId: "default", isDefault: true },
      ...(result.browserContextIds ?? []).map((contextId) => ({ contextId, isDefault: false }))
    ];
  }

  async closeContext(contextId: string): Promise<void> {
    if (contextId === "default") {
      throw new Error("The default browser context cannot be closed");
    }
    await this.connection.call("Target.disposeBrowserContext", { browserContextId: contextId });
  }

  async printPdf(pageId: string): Promise<{ data: string; mimeType: "application/pdf" }> {
    const page = await this.ensureAttached(pageId);
    const result = await this.connection.call<{ data?: string }>("Page.printToPDF", {}, page.sessionId);
    return { data: result.data ?? "", mimeType: "application/pdf" };
  }

  async setDownloadBehavior(behavior: DownloadBehavior, downloadPath?: string): Promise<void> {
    await this.connection.call("Browser.setDownloadBehavior", {
      behavior,
      ...(downloadPath ? { downloadPath } : {})
    });
  }

  async startTracing(pageId: string): Promise<void> {
    const page = await this.ensureAttached(pageId);
    try {
      await this.connection.call(
        "Tracing.start",
        {
          transferMode: "ReturnAsStream",
          categories: "devtools.timeline,v8,blink.user_timing"
        },
        page.sessionId
      );
      this.tracingFallbackStartedAt = undefined;
    } catch (error) {
      if (!isUnsupportedCdpError(error)) {
        throw error;
      }
      this.tracingFallbackStartedAt = Date.now();
      await this.evaluateInPage(
        pageId,
        `performance.mark("__pandamcp_trace_start"); true`
      ).catch(() => undefined);
    }
    this.tracingPageId = pageId;
  }

  async stopTracing(pageId: string): Promise<{ data: string; mimeType: "application/json" }> {
    if (this.tracingPageId && this.tracingPageId !== pageId) {
      throw new Error(`Tracing is active for a different page: ${this.tracingPageId}`);
    }
    const page = await this.ensureAttached(pageId);
    if (this.tracingFallbackStartedAt !== undefined) {
      const startedAt = this.tracingFallbackStartedAt;
      const payload = await this.evaluateInPage(
        pageId,
        `(() => ({
          fallback: "performance",
          startedAt: ${JSON.stringify(startedAt)},
          stoppedAt: Date.now(),
          timeOrigin: performance.timeOrigin,
          entries: performance.getEntries().map((entry) => ({
            name: entry.name,
            entryType: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration
          }))
        }))()`
      );
      this.tracingPageId = undefined;
      this.tracingFallbackStartedAt = undefined;
      return { data: JSON.stringify(payload, null, 2), mimeType: "application/json" };
    }
    const completed = this.connection.waitForEvent(
      (message) => message.method === "Tracing.tracingComplete" && message.sessionId === page.sessionId,
      15_000
    );
    await this.connection.call("Tracing.end", {}, page.sessionId);
    const event = await completed;
    const stream = (event.params as { stream?: string } | undefined)?.stream;
    const data = stream ? await this.readStream(stream) : "";
    this.tracingPageId = undefined;
    return { data, mimeType: "application/json" };
  }

  async accessibilitySnapshot(pageId: string): Promise<AccessibilityNode[]> {
    const page = await this.ensureAttached(pageId);
    const result = await this.connection.call<{ nodes?: AccessibilityNode[] }>(
      "Accessibility.getFullAXTree",
      {},
      page.sessionId
    );
    return result.nodes ?? [];
  }

  async setBlockedUrls(pageId: string, patterns: string[]): Promise<void> {
    const page = await this.ensureAttached(pageId);
    await this.connection.call("Network.setBlockedURLs", { urls: patterns }, page.sessionId);
  }

  async closePage(pageId: string): Promise<void> {
    await this.connection.call("Target.closeTarget", { targetId: pageId });
    this.pages.delete(pageId);
    this.networkLog.delete(pageId);
    this.consoleLog.delete(pageId);
  }

  private async navigateHistory(pageId: string, delta: -1 | 1): Promise<BrowserPage> {
    const page = await this.ensureAttached(pageId);
    const history = await this.connection.call<HistoryResult>("Page.getNavigationHistory", {}, page.sessionId);
    const target = history.entries[history.currentIndex + delta];
    if (!target) {
      throw new Error(delta < 0 ? "No previous history entry" : "No next history entry");
    }
    await this.connection.call("Page.navigateToHistoryEntry", { entryId: target.id }, page.sessionId);
    await this.waitForLoadState(pageId, "domcontentloaded", 10_000).catch(() => undefined);
    return this.pageInfo(pageId);
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
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          `Evaluation failed: ${expression}`
      );
    }
    return result.result?.value ?? result.result?.unserializableValue ?? result.result?.description;
  }

  private async ensureAttached(
    pageId: string,
    contextId?: string
  ): Promise<{ targetId: string; sessionId: string; contextId?: string }> {
    const existing = this.pages.get(pageId);
    if (existing) {
      return existing;
    }
    return this.attach(pageId, contextId);
  }

  private async waitForPageLoad(pageId: string): Promise<void> {
    const page = await this.ensureAttached(pageId);
    const loadEvent = this.waitForPageLoadEvent(page.sessionId, this.automaticLoadTimeoutMs);
    try {
      if (await this.isDocumentComplete(pageId)) {
        return;
      }
      await loadEvent.promise;
    } finally {
      loadEvent.cancel();
    }
  }

  private async isDocumentComplete(pageId: string): Promise<boolean> {
    return (await this.evaluateInPage(pageId, `document.readyState === "complete"`)) === true;
  }

  private waitForPageLoadEvent(
    sessionId: string,
    timeoutMs: number
  ): { promise: Promise<void>; cancel: () => void } {
    let settled = false;
    let unsubscribe = (): void => undefined;
    let timer: NodeJS.Timeout;

    const promise = new Promise<void>((resolve, reject) => {
      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        callback();
      };

      timer = setTimeout(() => {
        finish(() => reject(new Error("Timed out waiting for page load")));
      }, timeoutMs);

      unsubscribe = this.connection.onEvent((message) => {
        if (message.method === "Page.loadEventFired" && message.sessionId === sessionId) {
          finish(resolve);
        }
      });
    });

    return {
      promise,
      cancel: () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        unsubscribe();
      }
    };
  }

  private async createTargetOrReuseExisting(
    url?: string,
    contextId?: string
  ): Promise<{ target: TargetInfo; reused: boolean }> {
    try {
      const target = await this.connection.call<TargetResult>("Target.createTarget", {
        url: url ?? "about:blank",
        ...(contextId ? { browserContextId: contextId } : {})
      });
      return { target: { targetId: target.targetId, browserContextId: contextId }, reused: false };
    } catch (error) {
      if (!isTargetAlreadyLoadedError(error)) {
        throw error;
      }
    }

    const targets = await this.connection.call<TargetsResult>("Target.getTargets");
    const target = (targets.targetInfos ?? []).find(
      (candidate) =>
        (candidate.type === "page" || !candidate.type) &&
        (!contextId || candidate.browserContextId === contextId)
    );
    if (!target) {
      throw new Error("TargetAlreadyLoaded, and no existing page target was available to reuse");
    }
    return { target, reused: true };
  }

  private async attach(
    pageId: string,
    contextId?: string
  ): Promise<{ targetId: string; sessionId: string; contextId?: string }> {
    const attached = await this.connection.call<AttachResult>("Target.attachToTarget", {
      targetId: pageId,
      flatten: true
    });
    const page = { targetId: pageId, sessionId: attached.sessionId, contextId };
    this.pages.set(pageId, page);
    this.networkLog.set(pageId, []);
    this.consoleLog.set(pageId, []);

    for (const method of ["Page.enable", "Runtime.enable", "Network.enable", "DOM.enable", "Log.enable"]) {
      await this.connection.call(method, {}, attached.sessionId).catch(() => undefined);
    }

    return page;
  }

  private recordEvent(message: CdpMessage): void {
    if (!message.method || !message.sessionId) {
      return;
    }
    const pageId = [...this.pages.entries()].find(([, page]) => page.sessionId === message.sessionId)?.[0];
    if (!pageId) {
      return;
    }
    const params = (message.params ?? {}) as Record<string, any>;

    if (message.method === "Network.requestWillBeSent") {
      this.pushNetwork(pageId, {
        type: "request",
        requestId: String(params.requestId),
        url: String(params.request?.url ?? ""),
        method: params.request?.method,
        timestamp: params.timestamp
      });
    } else if (message.method === "Network.responseReceived") {
      this.pushNetwork(pageId, {
        type: "response",
        requestId: String(params.requestId),
        url: String(params.response?.url ?? ""),
        status: params.response?.status,
        statusText: params.response?.statusText,
        mimeType: params.response?.mimeType,
        timestamp: params.timestamp
      });
    } else if (message.method === "Network.loadingFailed") {
      this.pushNetwork(pageId, {
        type: "failed",
        requestId: String(params.requestId),
        url: "",
        errorText: params.errorText,
        timestamp: params.timestamp
      });
    } else if (message.method === "Runtime.consoleAPICalled") {
      this.pushConsole(pageId, {
        type: "console",
        level: String(params.type ?? "log"),
        text: (params.args ?? []).map((arg: { value?: unknown; description?: string }) => arg.value ?? arg.description ?? "").join(" "),
        timestamp: params.timestamp
      });
    } else if (message.method === "Runtime.exceptionThrown") {
      const details = params.exceptionDetails ?? {};
      this.pushConsole(pageId, {
        type: "error",
        level: "error",
        text: String(details.exception?.description ?? details.text ?? "Page exception"),
        url: details.url,
        lineNumber: details.lineNumber,
        columnNumber: details.columnNumber,
        timestamp: params.timestamp
      });
    } else if (message.method === "Log.entryAdded") {
      const entry = params.entry ?? {};
      this.pushConsole(pageId, {
        type: entry.level === "error" ? "error" : "console",
        level: String(entry.level ?? "log"),
        text: String(entry.text ?? ""),
        url: entry.url,
        lineNumber: entry.lineNumber,
        timestamp: entry.timestamp
      });
    }
  }

  private pushNetwork(pageId: string, event: NetworkEvent): void {
    const events = this.networkLog.get(pageId) ?? [];
    events.push(event);
    this.networkLog.set(pageId, tail(events, 500));
  }

  private pushConsole(pageId: string, event: ConsoleEvent): void {
    const events = this.consoleLog.get(pageId) ?? [];
    events.push(event);
    this.consoleLog.set(pageId, tail(events, 500));
  }

  private async elementCenter(pageId: string, selector: string): Promise<{ x: number; y: number }> {
    const value = await this.evaluateInPage(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector not found: ${escapeForJs(selector)}");
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`
    );
    if (!value || typeof value !== "object" || !("x" in value) || !("y" in value)) {
      throw new Error(`Unable to resolve element position for selector: ${selector}`);
    }
    return value as { x: number; y: number };
  }

  private async injectFileInputFiles(pageId: string, selector: string, paths: string[]): Promise<void> {
    const files = await Promise.all(
      paths.map(async (path) => ({
        name: basename(path),
        base64: (await readFile(path)).toString("base64")
      }))
    );

    await this.evaluateInPage(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector not found: ${escapeForJs(selector)}");
        if (!(element instanceof HTMLInputElement) || element.type !== "file") {
          throw new Error("Selector is not a file input: ${escapeForJs(selector)}");
        }
        const dataTransfer = new DataTransfer();
        for (const file of ${JSON.stringify(files)}) {
          const binary = atob(file.base64);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          dataTransfer.items.add(new File([bytes], file.name));
        }
        element.files = dataTransfer.files;
        if (element.files.length !== ${files.length}) {
          Object.defineProperty(element, "files", {
            configurable: true,
            value: dataTransfer.files
          });
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`
    );
  }

  private async fileInputFileCount(pageId: string, selector: string): Promise<number> {
    const count = await this.evaluateInPage(
      pageId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector not found: ${escapeForJs(selector)}");
        if (!(element instanceof HTMLInputElement) || element.type !== "file") {
          throw new Error("Selector is not a file input: ${escapeForJs(selector)}");
        }
        return element.files.length;
      })()`
    );
    return typeof count === "number" ? count : 0;
  }

  private async waitForNetworkIdle(pageId: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    let lastCount = this.networkLog.get(pageId)?.length ?? 0;
    let stableSince = Date.now();
    while (Date.now() - start <= timeoutMs) {
      const count = this.networkLog.get(pageId)?.length ?? 0;
      if (count !== lastCount) {
        lastCount = count;
        stableSince = Date.now();
      }
      if (Date.now() - stableSince >= 500) {
        return;
      }
      await sleep(100);
    }
    throw new Error("Timed out waiting for network idle");
  }

  private async readStream(stream: string): Promise<string> {
    const chunks: string[] = [];
    let eof = false;
    while (!eof) {
      const result = await this.connection.call<{ data?: string; eof?: boolean }>("IO.read", { handle: stream });
      chunks.push(result.data ?? "");
      eof = result.eof ?? false;
    }
    await this.connection.call("IO.close", { handle: stream }).catch(() => undefined);
    return chunks.join("");
  }
}

function matchesUrl(url: string, matcher: UrlMatcher): boolean {
  if (matcher.exact !== undefined) {
    return url === matcher.exact;
  }
  if (matcher.contains !== undefined) {
    return url.includes(matcher.contains);
  }
  if (matcher.regex !== undefined) {
    return new RegExp(matcher.regex).test(url);
  }
  return true;
}

function visitFrameTree(node: FrameTreeNode, frames: FrameInfo[]): void {
  frames.push({
    frameId: node.frame.id,
    parentFrameId: node.frame.parentId,
    url: node.frame.url ?? "",
    name: node.frame.name,
    mimeType: node.frame.mimeType
  });
  for (const child of node.childFrames ?? []) {
    visitFrameTree(child, frames);
  }
}

function originFor(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function tail<T>(items: T[], limit: number): T[] {
  return items.slice(Math.max(0, items.length - Math.max(0, limit)));
}

function escapeForJs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function isUnsupportedCdpError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === "UnknownDomain" || message === "UnknownMethod" || message.includes("wasn't found");
}

function isTargetAlreadyLoadedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("TargetAlreadyLoaded");
}

function isFileUploadFallbackError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    isUnsupportedCdpError(error) ||
    message === "FileNotFound" ||
    message === "NodeNotFoundForGivenId" ||
    message.includes("File not found")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
