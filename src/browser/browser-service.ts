import type {
  BrowserBackend,
  BrowserPage,
  EvaluateInput,
  FillInput,
  NavigateInput,
  PageSelectorInput,
  PressInput,
  ScreenshotInput,
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

  newPage(url?: string): Promise<BrowserPage> {
    return this.backend.newPage(url);
  }

  listPages(): Promise<BrowserPage[]> {
    return this.backend.listPages();
  }

  async navigate(input: NavigateInput): Promise<BrowserPage> {
    const pageId = input.pageId ?? (await this.backend.newPage()).pageId;
    return this.backend.navigate(pageId, input.url);
  }

  async title(pageId: string): Promise<{ pageId: string; title: string }> {
    return { pageId, title: await this.backend.title(pageId) };
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

  async closePage(pageId: string): Promise<{ pageId: string; closed: true }> {
    await this.backend.closePage(pageId);
    return { pageId, closed: true };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
