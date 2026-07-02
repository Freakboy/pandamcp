import { z } from "zod";

import type { BrowserService } from "../browser/browser-service.js";

export const BROWSER_TOOL_NAMES = [
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
] as const;

interface ToolServer {
  // The SDK uses overloads and conditional Zod inference here; the tool module only
  // needs the shared call shape so tests can capture registrations.
  registerTool: (name: string, config: object, handler: (...args: any[]) => Promise<ToolResult>) => unknown;
}

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

export function registerBrowserTools(server: ToolServer, service: BrowserService): void {
  server.registerTool(
    "browser_new_page",
    {
      title: "New page",
      description: "Create a new browser page, optionally navigating to a URL.",
      inputSchema: {
        url: z.string().url().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ url }) => asToolResult(await service.newPage(url as string | undefined))
  );

  server.registerTool(
    "browser_list_pages",
    {
      title: "List pages",
      description: "List known browser pages.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => asToolResult(await service.listPages())
  );

  server.registerTool(
    "browser_navigate",
    {
      title: "Navigate",
      description: "Navigate a browser page. If pageId is omitted, a new page is created.",
      inputSchema: {
        pageId: z.string().optional(),
        url: z.string().url()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, url }) =>
      asToolResult(await service.navigate({ pageId: pageId as string | undefined, url: url as string }))
  );

  server.registerTool(
    "browser_title",
    {
      title: "Page title",
      description: "Read the page title.",
      inputSchema: {
        pageId: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId }) => asToolResult(await service.title(pageId as string))
  );

  server.registerTool(
    "browser_body_text",
    {
      title: "Body text",
      description: "Read the visible document body text without requiring a CSS selector.",
      inputSchema: {
        pageId: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId }) => asToolResult(await service.bodyText(pageId as string))
  );

  server.registerTool(
    "browser_text",
    {
      title: "Selector text",
      description: "Read textContent for a CSS selector.",
      inputSchema: {
        pageId: z.string(),
        selector: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, selector }) =>
      asToolResult(await service.textContent({ pageId: pageId as string, selector: selector as string }))
  );

  server.registerTool(
    "browser_content",
    {
      title: "Page HTML",
      description: "Read the current page HTML.",
      inputSchema: {
        pageId: z.string()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId }) => asToolResult(await service.content(pageId as string))
  );

  server.registerTool(
    "browser_evaluate",
    {
      title: "Evaluate JavaScript",
      description: "Evaluate a JavaScript expression in a page and return a JSON-serializable result.",
      inputSchema: {
        pageId: z.string(),
        expression: z.string()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, expression }) =>
      asToolResult(
        await service.evaluate({ pageId: pageId as string, expression: expression as string })
      )
  );

  server.registerTool(
    "browser_click",
    {
      title: "Click selector",
      description: "Click the first element matching a CSS selector.",
      inputSchema: {
        pageId: z.string(),
        selector: z.string()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, selector }) =>
      asToolResult(await service.click({ pageId: pageId as string, selector: selector as string }))
  );

  server.registerTool(
    "browser_fill",
    {
      title: "Fill selector",
      description: "Set the value of the first element matching a CSS selector.",
      inputSchema: {
        pageId: z.string(),
        selector: z.string(),
        value: z.string()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, selector, value }) =>
      asToolResult(
        await service.fill({
          pageId: pageId as string,
          selector: selector as string,
          value: value as string
        })
      )
  );

  server.registerTool(
    "browser_press",
    {
      title: "Press key",
      description: "Dispatch keydown and keyup events for the active element.",
      inputSchema: {
        pageId: z.string(),
        key: z.string()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, key }) =>
      asToolResult(await service.press({ pageId: pageId as string, key: key as string }))
  );

  server.registerTool(
    "browser_screenshot",
    {
      title: "Screenshot",
      description: "Capture a PNG screenshot and return base64 data.",
      inputSchema: {
        pageId: z.string(),
        fullPage: z.boolean().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, fullPage }) =>
      asToolResult(
        await service.screenshot({ pageId: pageId as string, fullPage: fullPage as boolean | undefined })
      )
  );

  server.registerTool(
    "browser_wait_for_text",
    {
      title: "Wait for text",
      description: "Poll the page body until it contains the requested text.",
      inputSchema: {
        pageId: z.string(),
        text: z.string(),
        timeoutMs: z.number().int().positive().optional(),
        pollMs: z.number().int().positive().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, text, timeoutMs, pollMs }) =>
      asToolResult(
        await service.waitForText({
          pageId: pageId as string,
          text: text as string,
          timeoutMs: timeoutMs as number | undefined,
          pollMs: pollMs as number | undefined
        })
      )
  );

  server.registerTool(
    "browser_close_page",
    {
      title: "Close page",
      description: "Close a page by pageId.",
      inputSchema: {
        pageId: z.string()
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
    },
    async ({ pageId }) => asToolResult(await service.closePage(pageId as string))
  );

  server.registerTool(
    "browser_close_browser",
    {
      title: "Close browser connection",
      description: "Close the backend browser connection.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
    },
    async () => {
      await service.close();
      return asToolResult({ closed: true });
    }
  );
}

function asToolResult(value: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
