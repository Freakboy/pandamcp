import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

import type { BrowserBackend, BrowserPage } from "./types.js";

export class PlaywrightBackend implements BrowserBackend {
  private browser?: Browser;
  private context?: BrowserContext;
  private readonly pages = new Map<string, Page>();
  private nextPageId = 0;

  constructor(private readonly endpoint: string) {}

  async connect(): Promise<void> {
    if (this.browser) {
      return;
    }
    this.browser = await chromium.connectOverCDP(this.endpoint);
    this.context = this.browser.contexts()[0] ?? (await this.browser.newContext({}));
    for (const page of this.context.pages()) {
      this.rememberPage(page);
    }
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.pages.clear();
    this.context = undefined;
    this.browser = undefined;
  }

  async newPage(url?: string): Promise<BrowserPage> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    const pageId = this.rememberPage(page);
    if (url) {
      await page.goto(url);
    }
    return this.describePage(pageId, page);
  }

  async listPages(): Promise<BrowserPage[]> {
    await this.ensureContext();
    return Promise.all(
      [...this.pages.entries()].map(([pageId, page]) => this.describePage(pageId, page))
    );
  }

  async navigate(pageId: string, url: string): Promise<BrowserPage> {
    const page = this.getPage(pageId);
    await page.goto(url);
    return this.describePage(pageId, page);
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

  async click(pageId: string, selector: string): Promise<void> {
    await this.getPage(pageId).locator(selector).first().click();
  }

  async fill(pageId: string, selector: string, value: string): Promise<void> {
    await this.getPage(pageId).locator(selector).first().fill(value);
  }

  async press(pageId: string, key: string): Promise<void> {
    await this.getPage(pageId).keyboard.press(key);
  }

  async screenshot(pageId: string, fullPage = false): Promise<{ data: string; mimeType: string }> {
    const data = await this.getPage(pageId).screenshot({ fullPage });
    return { data: data.toString("base64"), mimeType: "image/png" };
  }

  async closePage(pageId: string): Promise<void> {
    await this.getPage(pageId).close();
    this.pages.delete(pageId);
  }

  private async ensureContext(): Promise<BrowserContext> {
    await this.connect();
    if (!this.context) {
      throw new Error("Playwright context is not available");
    }
    return this.context;
  }

  private getPage(pageId: string): Page {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Unknown pageId: ${pageId}`);
    }
    return page;
  }

  private rememberPage(page: Page): string {
    const existing = [...this.pages.entries()].find(([, value]) => value === page);
    if (existing) {
      return existing[0];
    }
    const pageId = `pw-${++this.nextPageId}`;
    this.pages.set(pageId, page);
    return pageId;
  }

  private async describePage(pageId: string, page: Page): Promise<BrowserPage> {
    return {
      pageId,
      url: page.url(),
      title: await page.title().catch(() => "")
    };
  }
}
