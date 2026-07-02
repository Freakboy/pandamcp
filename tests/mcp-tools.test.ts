import { describe, expect, test, vi } from "vitest";

import { BROWSER_TOOL_NAMES, registerBrowserTools } from "../src/mcp/tools.js";
import type { BrowserService } from "../src/browser/browser-service.js";

describe("registerBrowserTools", () => {
  test("registers the unified browser tool surface", () => {
    const registered: string[] = [];
    const server = {
      registerTool: vi.fn((name: string) => {
        registered.push(name);
      })
    };

    registerBrowserTools(server, {} as BrowserService);

    expect(registered).toEqual(BROWSER_TOOL_NAMES);
    expect(registered).toEqual([
      "browser_new_page",
      "browser_list_pages",
      "browser_navigate",
      "browser_title",
      "browser_body_text",
      "browser_text",
      "browser_content",
      "browser_evaluate",
      "browser_click",
      "browser_fill",
      "browser_press",
      "browser_screenshot",
      "browser_wait_for_text",
      "browser_close_page",
      "browser_close_browser"
    ]);
  });
});
