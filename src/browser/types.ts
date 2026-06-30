export interface BrowserPage {
  pageId: string;
  url: string;
  title: string;
}

export interface BrowserBackend {
  connect(): Promise<void>;
  close(): Promise<void>;
  newPage(url?: string): Promise<BrowserPage>;
  listPages(): Promise<BrowserPage[]>;
  navigate(pageId: string, url: string): Promise<BrowserPage>;
  title(pageId: string): Promise<string>;
  textContent(pageId: string, selector: string): Promise<string | null>;
  content(pageId: string): Promise<string>;
  evaluate(pageId: string, expression: string): Promise<unknown>;
  click(pageId: string, selector: string): Promise<void>;
  fill(pageId: string, selector: string, value: string): Promise<void>;
  press(pageId: string, key: string): Promise<void>;
  screenshot(pageId: string, fullPage?: boolean): Promise<{ data: string; mimeType: string }>;
  closePage(pageId: string): Promise<void>;
}

export interface NavigateInput {
  pageId?: string;
  url: string;
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
