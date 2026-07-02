import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response
} from "playwright-core";

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

export class PlaywrightBackend implements BrowserBackend {
  private browser?: Browser;
  private defaultContext?: BrowserContext;
  private readonly pages = new Map<string, Page>();
  private readonly contexts = new Map<string, BrowserContext>();
  private readonly pageContexts = new Map<string, string>();
  private readonly requestIds = new WeakMap<Request, string>();
  private readonly responses = new Map<string, Response>();
  private readonly networkLog = new Map<string, NetworkEvent[]>();
  private readonly consoleLog = new Map<string, ConsoleEvent[]>();
  private nextPageId = 0;
  private nextContextId = 0;
  private nextRequestId = 0;
  private tracingContextId?: string;

  constructor(private readonly endpoint: string) {}

  async connect(): Promise<void> {
    if (this.browser) {
      return;
    }
    this.browser = await chromium.connectOverCDP(this.endpoint);
    this.defaultContext = this.browser.contexts()[0] ?? (await this.browser.newContext({}));
    const contextId = this.rememberContext(this.defaultContext, "default");
    for (const page of this.defaultContext.pages()) {
      this.rememberPage(page, contextId);
    }
  }

  async close(): Promise<void> {
    for (const context of this.contexts.values()) {
      await context.close().catch(() => undefined);
    }
    await this.browser?.close().catch(() => undefined);
    this.pages.clear();
    this.contexts.clear();
    this.pageContexts.clear();
    this.networkLog.clear();
    this.consoleLog.clear();
    this.responses.clear();
    this.defaultContext = undefined;
    this.browser = undefined;
  }

  async newPage(url?: string, contextId?: string): Promise<BrowserPage> {
    const context = await this.getContext(contextId);
    const page = await context.newPage();
    const pageId = this.rememberPage(page, contextId ?? this.contextIdFor(context));
    if (url) {
      await page.goto(url);
    }
    return this.describePage(pageId, page);
  }

  async listPages(): Promise<BrowserPage[]> {
    await this.ensureBrowser();
    return Promise.all(
      [...this.pages.entries()].map(([pageId, page]) => this.describePage(pageId, page))
    );
  }

  async navigate(pageId: string, url: string): Promise<BrowserPage> {
    const page = this.getPage(pageId);
    await page.goto(url);
    return this.describePage(pageId, page);
  }

  async reload(pageId: string): Promise<BrowserPage> {
    const page = this.getPage(pageId);
    await page.reload();
    return this.describePage(pageId, page);
  }

  async goBack(pageId: string): Promise<BrowserPage> {
    const page = this.getPage(pageId);
    await page.goBack();
    return this.describePage(pageId, page);
  }

  async goForward(pageId: string): Promise<BrowserPage> {
    const page = this.getPage(pageId);
    await page.goForward();
    return this.describePage(pageId, page);
  }

  async pageInfo(pageId: string): Promise<PageInfo> {
    const page = this.getPage(pageId);
    const info = await page.evaluate(() => ({
      readyState: document.readyState,
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent,
      isMobile: /Mobi|Android/i.test(navigator.userAgent)
    }));
    return {
      pageId,
      url: page.url(),
      title: await page.title().catch(() => ""),
      contextId: this.pageContexts.get(pageId),
      readyState: info.readyState,
      viewport: {
        width: info.width,
        height: info.height,
        deviceScaleFactor: info.deviceScaleFactor,
        isMobile: info.isMobile
      },
      userAgent: info.userAgent
    };
  }

  async title(pageId: string): Promise<string> {
    return this.getPage(pageId).title();
  }

  async textContent(pageId: string, selector: string): Promise<string | null> {
    return this.getPage(pageId).locator(selector).first().textContent();
  }

  async content(pageId: string): Promise<string> {
    return this.getPage(pageId).content();
  }

  async evaluate(pageId: string, expression: string): Promise<unknown> {
    return this.getPage(pageId).evaluate(expression);
  }

  async waitForSelector(pageId: string, selector: string, options: WaitForSelectorOptions = {}): Promise<void> {
    await this.getPage(pageId).locator(selector).first().waitFor({
      state: options.visible ? "visible" : "attached",
      timeout: options.timeoutMs
    });
  }

  async waitForUrl(pageId: string, matcher: UrlMatcher, timeoutMs = 5_000): Promise<string> {
    const page = this.getPage(pageId);
    await page.waitForURL((url) => matchesUrl(url.toString(), matcher), { timeout: timeoutMs });
    return page.url();
  }

  async waitForLoadState(pageId: string, state: LoadState, timeoutMs = 10_000): Promise<void> {
    await this.getPage(pageId).waitForLoadState(state, { timeout: timeoutMs });
  }

  async waitForExpression(
    pageId: string,
    expression: string,
    timeoutMs = 5_000,
    pollMs = 100
  ): Promise<unknown> {
    const handle = await this.getPage(pageId).waitForFunction(expression, undefined, {
      timeout: timeoutMs,
      polling: pollMs
    });
    return handle.jsonValue();
  }

  async click(pageId: string, selector: string): Promise<void> {
    await this.getPage(pageId).locator(selector).first().click();
  }

  async fill(pageId: string, selector: string, value: string): Promise<void> {
    await this.getPage(pageId).locator(selector).first().fill(value);
  }

  async press(pageId: string, key: string): Promise<void> {
    await this.getPage(pageId).keyboard.press(key);
  }

  async hover(pageId: string, selector: string): Promise<void> {
    await this.getPage(pageId).locator(selector).first().hover();
  }

  async selectOption(pageId: string, selector: string, values: string[]): Promise<string[]> {
    return this.getPage(pageId).locator(selector).first().selectOption(values);
  }

  async dragAndDrop(pageId: string, sourceSelector: string, targetSelector: string): Promise<void> {
    await this.getPage(pageId).dragAndDrop(sourceSelector, targetSelector);
  }

  async uploadFile(pageId: string, selector: string, paths: string[]): Promise<void> {
    await this.getPage(pageId).locator(selector).first().setInputFiles(paths);
  }

  async focus(pageId: string, selector: string): Promise<void> {
    await this.getPage(pageId).locator(selector).first().focus();
  }

  async blur(pageId: string, selector: string): Promise<void> {
    await this.getPage(pageId).locator(selector).first().blur();
  }

  async screenshot(pageId: string, fullPage = false): Promise<{ data: string; mimeType: string }> {
    const data = await this.getPage(pageId).screenshot({ fullPage });
    return { data: data.toString("base64"), mimeType: "image/png" };
  }

  async networkEvents(pageId: string, limit = 50): Promise<NetworkEvent[]> {
    return tail(this.networkLog.get(pageId) ?? [], limit);
  }

  async responseBody(_pageId: string, requestId: string): Promise<{ body: string; base64Encoded: boolean }> {
    const response = this.responses.get(requestId);
    if (!response) {
      throw new Error(`Unknown requestId: ${requestId}`);
    }
    const body = await response.body();
    return { body: body.toString("base64"), base64Encoded: true };
  }

  async consoleEvents(pageId: string, limit = 50): Promise<ConsoleEvent[]> {
    return tail(this.consoleLog.get(pageId) ?? [], limit);
  }

  async cookies(pageId: string): Promise<BrowserCookie[]> {
    return this.getPage(pageId).context().cookies([this.getPage(pageId).url()]);
  }

  async setCookie(pageId: string, cookie: BrowserCookie): Promise<void> {
    await this.getPage(pageId).context().addCookies([{ url: this.getPage(pageId).url(), ...cookie } as any]);
  }

  async clearCookies(pageId: string): Promise<void> {
    await this.getPage(pageId).context().clearCookies();
  }

  async storage(pageId: string, type: StorageType): Promise<StorageEntry[]> {
    return this.getPage(pageId).evaluate((storageType) => {
      const storage = storageType === "localStorage" ? localStorage : sessionStorage;
      return Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index);
        return key == null ? null : { key, value: storage.getItem(key) ?? "" };
      }).filter((entry): entry is StorageEntry => entry !== null);
    }, type);
  }

  async setStorage(pageId: string, type: StorageType, key: string, value: string): Promise<void> {
    await this.getPage(pageId).evaluate(
      ({ storageType, itemKey, itemValue }) => {
        const storage = storageType === "localStorage" ? localStorage : sessionStorage;
        storage.setItem(itemKey, itemValue);
      },
      { storageType: type, itemKey: key, itemValue: value }
    );
  }

  async clearStorage(pageId: string, type: StorageType): Promise<void> {
    await this.getPage(pageId).evaluate((storageType) => {
      const storage = storageType === "localStorage" ? localStorage : sessionStorage;
      storage.clear();
    }, type);
  }

  async grantPermissions(pageId: string, permissions: string[]): Promise<void> {
    const page = this.getPage(pageId);
    await page.context().grantPermissions(permissions, { origin: originFor(page.url()) });
  }

  async resetPermissions(pageId: string): Promise<void> {
    await this.getPage(pageId).context().clearPermissions();
  }

  async setGeolocation(pageId: string, latitude: number, longitude: number, accuracy = 100): Promise<void> {
    await this.getPage(pageId).context().setGeolocation({ latitude, longitude, accuracy });
  }

  async listFrames(pageId: string): Promise<FrameInfo[]> {
    return this.getPage(pageId).frames().map((frame) => ({
      frameId: frame.url(),
      parentFrameId: frame.parentFrame()?.url(),
      url: frame.url(),
      name: frame.name()
    }));
  }

  async frameEvaluate(pageId: string, frameSelector: string, expression: string): Promise<unknown> {
    const handle = await this.getPage(pageId).locator(frameSelector).first().elementHandle();
    const frame = await handle?.contentFrame();
    if (!frame) {
      throw new Error(`Frame selector not found or not an iframe: ${frameSelector}`);
    }
    return frame.evaluate(expression);
  }

  async createContext(): Promise<BrowserContextInfo> {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({});
    const contextId = this.rememberContext(context);
    return { contextId, isDefault: false };
  }

  async listContexts(): Promise<{ contextId: string; isDefault: boolean }[]> {
    await this.ensureBrowser();
    return [...this.contexts.entries()].map(([contextId, context]) => ({
      contextId,
      isDefault: context === this.defaultContext
    }));
  }

  async closeContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Unknown contextId: ${contextId}`);
    }
    if (context === this.defaultContext) {
      throw new Error("The default browser context cannot be closed");
    }
    await context.close();
    this.contexts.delete(contextId);
  }

  async printPdf(pageId: string): Promise<{ data: string; mimeType: "application/pdf" }> {
    const data = await this.getPage(pageId).pdf();
    return { data: data.toString("base64"), mimeType: "application/pdf" };
  }

  async setDownloadBehavior(behavior: DownloadBehavior, downloadPath?: string): Promise<void> {
    const context = await this.ensureContext();
    const page = context.pages()[0] ?? (await context.newPage());
    const session = await context.newCDPSession(page);
    await session.send("Browser.setDownloadBehavior", {
      behavior,
      ...(downloadPath ? { downloadPath } : {})
    });
  }

  async startTracing(pageId: string): Promise<void> {
    const page = this.getPage(pageId);
    await page.context().tracing.start({ screenshots: false, snapshots: true });
    this.tracingContextId = this.contextIdFor(page.context());
  }

  async stopTracing(pageId: string): Promise<{ data: string; mimeType: "application/json" }> {
    const page = this.getPage(pageId);
    const contextId = this.contextIdFor(page.context());
    if (this.tracingContextId && this.tracingContextId !== contextId) {
      throw new Error(`Tracing is active for a different context: ${this.tracingContextId}`);
    }
    const dir = await mkdtemp(join(tmpdir(), "pandamcp-trace-"));
    const path = join(dir, "trace.zip");
    await page.context().tracing.stop({ path });
    const data = await readFile(path);
    await rm(dir, { recursive: true, force: true });
    this.tracingContextId = undefined;
    return { data: data.toString("base64"), mimeType: "application/json" };
  }

  async accessibilitySnapshot(pageId: string): Promise<AccessibilityNode[]> {
    const context = this.getPage(pageId).context();
    const session = await context.newCDPSession(this.getPage(pageId));
    const result = await session.send("Accessibility.getFullAXTree");
    return (result.nodes ?? []) as unknown as AccessibilityNode[];
  }

  async setBlockedUrls(pageId: string, patterns: string[]): Promise<void> {
    const page = this.getPage(pageId);
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => undefined);
    for (const pattern of patterns) {
      await page.route(pattern, (route) => route.abort());
    }
  }

  async closePage(pageId: string): Promise<void> {
    await this.getPage(pageId).close();
    this.pages.delete(pageId);
    this.pageContexts.delete(pageId);
  }

  private async ensureBrowser(): Promise<Browser> {
    await this.connect();
    if (!this.browser) {
      throw new Error("Playwright browser is not available");
    }
    return this.browser;
  }

  private async ensureContext(): Promise<BrowserContext> {
    await this.connect();
    if (!this.defaultContext) {
      throw new Error("Playwright context is not available");
    }
    return this.defaultContext;
  }

  private async getContext(contextId?: string): Promise<BrowserContext> {
    await this.ensureBrowser();
    if (!contextId || contextId === "default") {
      return this.ensureContext();
    }
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Unknown contextId: ${contextId}`);
    }
    return context;
  }

  private getPage(pageId: string): Page {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Unknown pageId: ${pageId}`);
    }
    return page;
  }

  private rememberContext(context: BrowserContext, explicitId?: string): string {
    const existing = [...this.contexts.entries()].find(([, value]) => value === context);
    if (existing) {
      return existing[0];
    }
    const contextId = explicitId ?? `pw-context-${++this.nextContextId}`;
    this.contexts.set(contextId, context);
    return contextId;
  }

  private contextIdFor(context: BrowserContext): string {
    return this.rememberContext(context, context === this.defaultContext ? "default" : undefined);
  }

  private rememberPage(page: Page, contextId: string): string {
    const existing = [...this.pages.entries()].find(([, value]) => value === page);
    if (existing) {
      return existing[0];
    }
    const pageId = `pw-${++this.nextPageId}`;
    this.pages.set(pageId, page);
    this.pageContexts.set(pageId, contextId);
    this.networkLog.set(pageId, []);
    this.consoleLog.set(pageId, []);
    page.on("request", (request) => this.recordRequest(pageId, request));
    page.on("response", (response) => this.recordResponse(pageId, response));
    page.on("requestfailed", (request) => this.recordRequestFailed(pageId, request));
    page.on("console", (message) => this.recordConsole(pageId, message));
    page.on("pageerror", (error) =>
      this.pushConsole(pageId, { type: "error", level: "error", text: error.message, timestamp: Date.now() })
    );
    return pageId;
  }

  private async describePage(pageId: string, page: Page): Promise<BrowserPage> {
    return {
      pageId,
      url: page.url(),
      title: await page.title().catch(() => ""),
      contextId: this.pageContexts.get(pageId)
    };
  }

  private recordRequest(pageId: string, request: Request): void {
    const requestId = `pw-req-${++this.nextRequestId}`;
    this.requestIds.set(request, requestId);
    this.pushNetwork(pageId, {
      type: "request",
      requestId,
      url: request.url(),
      method: request.method(),
      timestamp: Date.now()
    });
  }

  private recordResponse(pageId: string, response: Response): void {
    const requestId = this.requestIds.get(response.request()) ?? `pw-req-${++this.nextRequestId}`;
    this.responses.set(requestId, response);
    this.pushNetwork(pageId, {
      type: "response",
      requestId,
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      timestamp: Date.now()
    });
  }

  private recordRequestFailed(pageId: string, request: Request): void {
    const requestId = this.requestIds.get(request) ?? `pw-req-${++this.nextRequestId}`;
    this.pushNetwork(pageId, {
      type: "failed",
      requestId,
      url: request.url(),
      method: request.method(),
      errorText: request.failure()?.errorText,
      timestamp: Date.now()
    });
  }

  private recordConsole(pageId: string, message: ConsoleMessage): void {
    this.pushConsole(pageId, {
      type: message.type() === "error" ? "error" : "console",
      level: message.type(),
      text: message.text(),
      timestamp: Date.now(),
      url: message.location().url,
      lineNumber: message.location().lineNumber,
      columnNumber: message.location().columnNumber
    });
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

function originFor(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function tail<T>(items: T[], limit: number): T[] {
  return items.slice(Math.max(0, items.length - Math.max(0, limit)));
}
