import { readFileSync } from "node:fs";

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
    expect(registered).toHaveLength(52);
    expect(registered).toContain("browser_page_info");
    expect(registered).toContain("browser_network_events");
    expect(registered).toContain("browser_accessibility_snapshot");
  });

  test("keeps README tool tables aligned with the registered tool surface", () => {
    expect(readToolNamesFromReadme("../README.md")).toEqual(BROWSER_TOOL_NAMES);
    expect(readToolNamesFromReadme("../README.zh-CN.md")).toEqual(BROWSER_TOOL_NAMES);
  });
});

function readToolNamesFromReadme(path: string): string[] {
  const readme = readFileSync(new URL(path, import.meta.url), "utf8");
  return [...readme.matchAll(/^\| `(browser_[^`]+)` \|/gm)].map((match) => match[1]);
}
