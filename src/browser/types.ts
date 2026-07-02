export interface BrowserPage {
  pageId: string;
  url: string;
  title: string;
  contextId?: string;
}

export interface BrowserContextInfo {
  contextId: string;
  isDefault: boolean;
}

export interface PageInfo extends BrowserPage {
  readyState: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    isMobile: boolean;
  };
  userAgent: string;
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface StorageEntry {
  key: string;
  value: string;
}

export interface NetworkEvent {
  type: "request" | "response" | "failed";
  requestId: string;
  url: string;
  method?: string;
  status?: number;
  statusText?: string;
  mimeType?: string;
  errorText?: string;
  timestamp?: number;
}

export interface ConsoleEvent {
  type: "console" | "error";
  level: string;
  text: string;
  timestamp?: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface FrameInfo {
  frameId: string;
  parentFrameId?: string;
  url: string;
  name?: string;
  mimeType?: string;
}

export interface PdfResult {
  data: string;
  mimeType: "application/pdf";
}

export interface TraceResult {
  data: string;
  mimeType: "application/json";
}

export interface AccessibilityNode {
  [key: string]: unknown;
}

export interface BrowserBackend {
  connect(): Promise<void>;
  close(): Promise<void>;
  newPage(url?: string, contextId?: string): Promise<BrowserPage>;
  listPages(): Promise<BrowserPage[]>;
  navigate(pageId: string, url: string): Promise<BrowserPage>;
  reload(pageId: string): Promise<BrowserPage>;
  goBack(pageId: string): Promise<BrowserPage>;
  goForward(pageId: string): Promise<BrowserPage>;
  pageInfo(pageId: string): Promise<PageInfo>;
  title(pageId: string): Promise<string>;
  textContent(pageId: string, selector: string): Promise<string | null>;
  content(pageId: string): Promise<string>;
  evaluate(pageId: string, expression: string): Promise<unknown>;
  waitForSelector(pageId: string, selector: string, options?: WaitForSelectorOptions): Promise<void>;
  waitForUrl(pageId: string, matcher: UrlMatcher, timeoutMs?: number): Promise<string>;
  waitForLoadState(pageId: string, state: LoadState, timeoutMs?: number): Promise<void>;
  waitForExpression(pageId: string, expression: string, timeoutMs?: number, pollMs?: number): Promise<unknown>;
  click(pageId: string, selector: string): Promise<void>;
  fill(pageId: string, selector: string, value: string): Promise<void>;
  press(pageId: string, key: string): Promise<void>;
  hover(pageId: string, selector: string): Promise<void>;
  selectOption(pageId: string, selector: string, values: string[]): Promise<string[]>;
  dragAndDrop(pageId: string, sourceSelector: string, targetSelector: string): Promise<void>;
  uploadFile(pageId: string, selector: string, paths: string[]): Promise<void>;
  focus(pageId: string, selector: string): Promise<void>;
  blur(pageId: string, selector: string): Promise<void>;
  screenshot(pageId: string, fullPage?: boolean): Promise<{ data: string; mimeType: string }>;
  networkEvents(pageId: string, limit?: number): Promise<NetworkEvent[]>;
  responseBody(pageId: string, requestId: string): Promise<{ body: string; base64Encoded: boolean }>;
  consoleEvents(pageId: string, limit?: number): Promise<ConsoleEvent[]>;
  cookies(pageId: string): Promise<BrowserCookie[]>;
  setCookie(pageId: string, cookie: BrowserCookie): Promise<void>;
  clearCookies(pageId: string): Promise<void>;
  storage(pageId: string, type: StorageType): Promise<StorageEntry[]>;
  setStorage(pageId: string, type: StorageType, key: string, value: string): Promise<void>;
  clearStorage(pageId: string, type: StorageType): Promise<void>;
  grantPermissions(pageId: string, permissions: string[]): Promise<void>;
  resetPermissions(pageId: string): Promise<void>;
  setGeolocation(pageId: string, latitude: number, longitude: number, accuracy?: number): Promise<void>;
  listFrames(pageId: string): Promise<FrameInfo[]>;
  frameEvaluate(pageId: string, frameSelector: string, expression: string): Promise<unknown>;
  createContext(): Promise<BrowserContextInfo>;
  listContexts(): Promise<BrowserContextInfo[]>;
  closeContext(contextId: string): Promise<void>;
  printPdf(pageId: string): Promise<PdfResult>;
  setDownloadBehavior(behavior: DownloadBehavior, downloadPath?: string): Promise<void>;
  startTracing(pageId: string): Promise<void>;
  stopTracing(pageId: string): Promise<TraceResult>;
  accessibilitySnapshot(pageId: string): Promise<AccessibilityNode[]>;
  setBlockedUrls(pageId: string, patterns: string[]): Promise<void>;
  closePage(pageId: string): Promise<void>;
}

export type LoadState = "domcontentloaded" | "load" | "networkidle";
export type StorageType = "localStorage" | "sessionStorage";
export type DownloadBehavior = "allow" | "deny" | "default";

export interface WaitForSelectorOptions {
  visible?: boolean;
  timeoutMs?: number;
  pollMs?: number;
}

export interface UrlMatcher {
  exact?: string;
  contains?: string;
  regex?: string;
}

export interface NavigateInput {
  pageId?: string;
  url: string;
}

export interface NewPageInput {
  url?: string;
  contextId?: string;
}

export interface PageSelectorInput {
  pageId: string;
  selector: string;
}

export interface EvaluateInput {
  pageId: string;
  expression: string;
}

export interface FillInput extends PageSelectorInput {
  value: string;
}

export interface PressInput {
  pageId: string;
  key: string;
}

export interface ScreenshotInput {
  pageId: string;
  fullPage?: boolean;
}

export interface WaitForTextInput {
  pageId: string;
  text: string;
  timeoutMs?: number;
  pollMs?: number;
}

export interface WaitForSelectorInput extends PageSelectorInput, WaitForSelectorOptions {}

export interface WaitForUrlInput {
  pageId: string;
  exact?: string;
  contains?: string;
  regex?: string;
  timeoutMs?: number;
}

export interface WaitForLoadStateInput {
  pageId: string;
  state: LoadState;
  timeoutMs?: number;
}

export interface WaitForExpressionInput {
  pageId: string;
  expression: string;
  timeoutMs?: number;
  pollMs?: number;
}

export interface SelectOptionInput extends PageSelectorInput {
  values: string[];
}

export interface DragAndDropInput {
  pageId: string;
  sourceSelector: string;
  targetSelector: string;
}

export interface UploadFileInput extends PageSelectorInput {
  paths: string[];
}

export interface LimitInput {
  pageId: string;
  limit?: number;
}

export interface ResponseBodyInput {
  pageId: string;
  requestId: string;
}

export interface SetCookieInput {
  pageId: string;
  cookie: BrowserCookie;
}

export interface StorageInput {
  pageId: string;
  type: StorageType;
}

export interface SetStorageInput extends StorageInput {
  key: string;
  value: string;
}

export interface PermissionInput {
  pageId: string;
  permissions: string[];
}

export interface GeolocationInput {
  pageId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface FrameEvaluateInput {
  pageId: string;
  frameSelector: string;
  expression: string;
}

export interface PrintPdfInput {
  pageId: string;
}

export interface DownloadBehaviorInput {
  behavior: DownloadBehavior;
  downloadPath?: string;
}

export interface BlockedUrlsInput {
  pageId: string;
  patterns: string[];
}
