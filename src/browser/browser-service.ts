import type {
  BlockedUrlsInput,
  BrowserBackend,
  BrowserContextInfo,
  BrowserCookie,
  BrowserPage,
  ConsoleEvent,
  DownloadBehaviorInput,
  DragAndDropInput,
  EvaluateInput,
  FillInput,
  FrameEvaluateInput,
  FrameInfo,
  GeolocationInput,
  LimitInput,
  LoadState,
  NetworkEvent,
  NewPageInput,
  NavigateInput,
  PageInfo,
  PageSelectorInput,
  PermissionInput,
  PressInput,
  ResponseBodyInput,
  ScreenshotInput,
  SelectOptionInput,
  SetCookieInput,
  SetStorageInput,
  StorageEntry,
  StorageInput,
  TraceResult,
  UploadFileInput,
  WaitForExpressionInput,
  WaitForLoadStateInput,
  WaitForUrlInput,
  WaitForSelectorInput,
  WaitForTextInput
} from "./types.js";

export class BrowserService {
  constructor(private readonly backend: BrowserBackend) {}

  connect(): Promise<void> {
    return this.backend.connect();
  }

  close(): Promise<void> {
    return this.backend.close();
  }

  newPage(input?: string | NewPageInput): Promise<BrowserPage> {
    if (typeof input === "string" || !input) {
      return this.backend.newPage(input);
    }
    return this.backend.newPage(input.url, input.contextId);
  }

  listPages(): Promise<BrowserPage[]> {
    return this.backend.listPages();
  }

  async navigate(input: NavigateInput): Promise<BrowserPage> {
    if (!input.pageId) {
      return this.backend.newPage(input.url);
    }
    const pageId = input.pageId;
    return this.backend.navigate(pageId, input.url);
  }

  async reload(pageId: string): Promise<BrowserPage> {
    return this.backend.reload(pageId);
  }

  async back(pageId: string): Promise<BrowserPage> {
    return this.backend.goBack(pageId);
  }

  async forward(pageId: string): Promise<BrowserPage> {
    return this.backend.goForward(pageId);
  }

  async pageInfo(pageId: string): Promise<PageInfo> {
    return this.backend.pageInfo(pageId);
  }

  async title(pageId: string): Promise<{ pageId: string; title: string }> {
    return { pageId, title: await this.backend.title(pageId) };
  }

  async bodyText(pageId: string): Promise<{ pageId: string; text: string | null }> {
    return { pageId, text: await this.backend.textContent(pageId, "body") };
  }

  async textContent(
    input: PageSelectorInput
  ): Promise<{ pageId: string; selector: string; text: string | null }> {
    return {
      pageId: input.pageId,
      selector: input.selector,
      text: await this.backend.textContent(input.pageId, input.selector)
    };
  }

  async content(pageId: string): Promise<{ pageId: string; html: string }> {
    return { pageId, html: await this.backend.content(pageId) };
  }

  async evaluate(input: EvaluateInput): Promise<{ pageId: string; result: unknown }> {
    return {
      pageId: input.pageId,
      result: await this.backend.evaluate(input.pageId, input.expression)
    };
  }

  async waitForSelector(
    input: WaitForSelectorInput
  ): Promise<{ pageId: string; selector: string; visible: boolean; found: true }> {
    await this.backend.waitForSelector(input.pageId, input.selector, {
      visible: input.visible,
      timeoutMs: input.timeoutMs,
      pollMs: input.pollMs
    });
    return {
      pageId: input.pageId,
      selector: input.selector,
      visible: input.visible ?? false,
      found: true
    };
  }

  async waitForUrl(input: WaitForUrlInput): Promise<{ pageId: string; url: string; matched: true }> {
    const url = await this.backend.waitForUrl(
      input.pageId,
      { exact: input.exact, contains: input.contains, regex: input.regex },
      input.timeoutMs
    );
    return { pageId: input.pageId, url, matched: true };
  }

  async waitForLoadState(
    input: WaitForLoadStateInput
  ): Promise<{ pageId: string; state: LoadState; reached: true }> {
    await this.backend.waitForLoadState(input.pageId, input.state, input.timeoutMs);
    return { pageId: input.pageId, state: input.state, reached: true };
  }

  async waitForExpression(input: WaitForExpressionInput): Promise<{ pageId: string; result: unknown }> {
    return {
      pageId: input.pageId,
      result: await this.backend.waitForExpression(
        input.pageId,
        input.expression,
        input.timeoutMs,
        input.pollMs
      )
    };
  }

  async click(input: PageSelectorInput): Promise<{ pageId: string; selector: string; clicked: true }> {
    await this.backend.click(input.pageId, input.selector);
    return { pageId: input.pageId, selector: input.selector, clicked: true };
  }

  async fill(input: FillInput): Promise<{ pageId: string; selector: string; filled: true }> {
    await this.backend.fill(input.pageId, input.selector, input.value);
    return { pageId: input.pageId, selector: input.selector, filled: true };
  }

  async press(input: PressInput): Promise<{ pageId: string; key: string; pressed: true }> {
    await this.backend.press(input.pageId, input.key);
    return { pageId: input.pageId, key: input.key, pressed: true };
  }

  async hover(input: PageSelectorInput): Promise<{ pageId: string; selector: string; hovered: true }> {
    await this.backend.hover(input.pageId, input.selector);
    return { pageId: input.pageId, selector: input.selector, hovered: true };
  }

  async selectOption(
    input: SelectOptionInput
  ): Promise<{ pageId: string; selector: string; values: string[] }> {
    return {
      pageId: input.pageId,
      selector: input.selector,
      values: await this.backend.selectOption(input.pageId, input.selector, input.values)
    };
  }

  async dragAndDrop(input: DragAndDropInput): Promise<{
    pageId: string;
    sourceSelector: string;
    targetSelector: string;
    dragged: true;
  }> {
    await this.backend.dragAndDrop(input.pageId, input.sourceSelector, input.targetSelector);
    return {
      pageId: input.pageId,
      sourceSelector: input.sourceSelector,
      targetSelector: input.targetSelector,
      dragged: true
    };
  }

  async uploadFile(input: UploadFileInput): Promise<{
    pageId: string;
    selector: string;
    paths: string[];
    uploaded: true;
  }> {
    await this.backend.uploadFile(input.pageId, input.selector, input.paths);
    return { pageId: input.pageId, selector: input.selector, paths: input.paths, uploaded: true };
  }

  async focus(input: PageSelectorInput): Promise<{ pageId: string; selector: string; focused: true }> {
    await this.backend.focus(input.pageId, input.selector);
    return { pageId: input.pageId, selector: input.selector, focused: true };
  }

  async blur(input: PageSelectorInput): Promise<{ pageId: string; selector: string; blurred: true }> {
    await this.backend.blur(input.pageId, input.selector);
    return { pageId: input.pageId, selector: input.selector, blurred: true };
  }

  async screenshot(
    input: ScreenshotInput
  ): Promise<{ pageId: string; data: string; mimeType: string }> {
    const screenshot = await this.backend.screenshot(input.pageId, input.fullPage);
    return { pageId: input.pageId, ...screenshot };
  }

  async waitForText(
    input: WaitForTextInput
  ): Promise<{ pageId: string; text: string; found: true }> {
    const timeoutMs = input.timeoutMs ?? 5_000;
    const pollMs = input.pollMs ?? 100;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const body = await this.backend.textContent(input.pageId, "body");
      if (body?.includes(input.text)) {
        return { pageId: input.pageId, text: input.text, found: true };
      }
      await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for text: ${input.text}`);
  }

  async networkEvents(input: LimitInput): Promise<{ pageId: string; events: NetworkEvent[] }> {
    return {
      pageId: input.pageId,
      events: await this.backend.networkEvents(input.pageId, input.limit)
    };
  }

  async responseBody(
    input: ResponseBodyInput
  ): Promise<{ pageId: string; requestId: string; body: string; base64Encoded: boolean }> {
    const result = await this.backend.responseBody(input.pageId, input.requestId);
    return { pageId: input.pageId, requestId: input.requestId, ...result };
  }

  async consoleEvents(input: LimitInput): Promise<{ pageId: string; events: ConsoleEvent[] }> {
    return {
      pageId: input.pageId,
      events: await this.backend.consoleEvents(input.pageId, input.limit)
    };
  }

  async cookies(pageId: string): Promise<{ pageId: string; cookies: BrowserCookie[] }> {
    return { pageId, cookies: await this.backend.cookies(pageId) };
  }

  async setCookie(input: SetCookieInput): Promise<{ pageId: string; cookie: BrowserCookie; set: true }> {
    await this.backend.setCookie(input.pageId, input.cookie);
    return { pageId: input.pageId, cookie: input.cookie, set: true };
  }

  async clearCookies(pageId: string): Promise<{ pageId: string; cleared: true }> {
    await this.backend.clearCookies(pageId);
    return { pageId, cleared: true };
  }

  async storage(input: StorageInput): Promise<{ pageId: string; type: string; entries: StorageEntry[] }> {
    return {
      pageId: input.pageId,
      type: input.type,
      entries: await this.backend.storage(input.pageId, input.type)
    };
  }

  async setStorage(input: SetStorageInput): Promise<{
    pageId: string;
    type: string;
    key: string;
    set: true;
  }> {
    await this.backend.setStorage(input.pageId, input.type, input.key, input.value);
    return { pageId: input.pageId, type: input.type, key: input.key, set: true };
  }

  async clearStorage(input: StorageInput): Promise<{ pageId: string; type: string; cleared: true }> {
    await this.backend.clearStorage(input.pageId, input.type);
    return { pageId: input.pageId, type: input.type, cleared: true };
  }

  async grantPermissions(input: PermissionInput): Promise<{
    pageId: string;
    permissions: string[];
    granted: true;
  }> {
    await this.backend.grantPermissions(input.pageId, input.permissions);
    return { pageId: input.pageId, permissions: input.permissions, granted: true };
  }

  async resetPermissions(pageId: string): Promise<{ pageId: string; reset: true }> {
    await this.backend.resetPermissions(pageId);
    return { pageId, reset: true };
  }

  async setGeolocation(input: GeolocationInput): Promise<{
    pageId: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    set: true;
  }> {
    const accuracy = input.accuracy ?? 100;
    await this.backend.setGeolocation(input.pageId, input.latitude, input.longitude, accuracy);
    return {
      pageId: input.pageId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy,
      set: true
    };
  }

  async listFrames(pageId: string): Promise<{ pageId: string; frames: FrameInfo[] }> {
    return { pageId, frames: await this.backend.listFrames(pageId) };
  }

  async frameEvaluate(input: FrameEvaluateInput): Promise<{ pageId: string; result: unknown }> {
    return {
      pageId: input.pageId,
      result: await this.backend.frameEvaluate(input.pageId, input.frameSelector, input.expression)
    };
  }

  async createContext(): Promise<BrowserContextInfo> {
    return this.backend.createContext();
  }

  async listContexts(): Promise<{ contexts: BrowserContextInfo[] }> {
    return { contexts: await this.backend.listContexts() };
  }

  async closeContext(contextId: string): Promise<{ contextId: string; closed: true }> {
    await this.backend.closeContext(contextId);
    return { contextId, closed: true };
  }

  async printPdf(pageId: string): Promise<{ pageId: string; data: string; mimeType: "application/pdf" }> {
    const pdf = await this.backend.printPdf(pageId);
    return { pageId, ...pdf };
  }

  async setDownloadBehavior(
    input: DownloadBehaviorInput
  ): Promise<{ behavior: string; downloadPath?: string; set: true }> {
    await this.backend.setDownloadBehavior(input.behavior, input.downloadPath);
    return { behavior: input.behavior, downloadPath: input.downloadPath, set: true };
  }

  async startTracing(pageId: string): Promise<{ pageId: string; tracing: "started" }> {
    await this.backend.startTracing(pageId);
    return { pageId, tracing: "started" };
  }

  async stopTracing(pageId: string): Promise<{ pageId: string } & TraceResult> {
    const trace = await this.backend.stopTracing(pageId);
    return { pageId, ...trace };
  }

  async accessibilitySnapshot(pageId: string): Promise<{ pageId: string; nodes: unknown[] }> {
    return { pageId, nodes: await this.backend.accessibilitySnapshot(pageId) };
  }

  async setBlockedUrls(input: BlockedUrlsInput): Promise<{
    pageId: string;
    patterns: string[];
    set: true;
  }> {
    await this.backend.setBlockedUrls(input.pageId, input.patterns);
    return { pageId: input.pageId, patterns: input.patterns, set: true };
  }

  async closePage(pageId: string): Promise<{ pageId: string; closed: true }> {
    await this.backend.closePage(pageId);
    return { pageId, closed: true };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
