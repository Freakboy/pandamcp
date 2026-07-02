import { z } from "zod";

import type { BrowserService } from "../browser/browser-service.js";

export const BROWSER_TOOL_NAMES = [
  "browser_new_page",
  "browser_list_pages",
  "browser_navigate",
  "browser_reload",
  "browser_back",
  "browser_forward",
  "browser_page_info",
  "browser_title",
  "browser_body_text",
  "browser_text",
  "browser_content",
  "browser_evaluate",
  "browser_wait_for_text",
  "browser_wait_for_selector",
  "browser_wait_for_url",
  "browser_wait_for_load_state",
  "browser_wait_for_expression",
  "browser_click",
  "browser_fill",
  "browser_press",
  "browser_hover",
  "browser_select_option",
  "browser_drag_and_drop",
  "browser_upload_file",
  "browser_focus",
  "browser_blur",
  "browser_screenshot",
  "browser_network_events",
  "browser_response_body",
  "browser_console_events",
  "browser_cookies",
  "browser_set_cookie",
  "browser_clear_cookies",
  "browser_storage",
  "browser_set_storage",
  "browser_clear_storage",
  "browser_grant_permissions",
  "browser_reset_permissions",
  "browser_set_geolocation",
  "browser_list_frames",
  "browser_frame_evaluate",
  "browser_create_context",
  "browser_list_contexts",
  "browser_close_context",
  "browser_print_pdf",
  "browser_set_download_behavior",
  "browser_start_tracing",
  "browser_stop_tracing",
  "browser_accessibility_snapshot",
  "browser_set_blocked_urls",
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

const pageId = z.string();
const selector = z.string();
const storageType = z.enum(["localStorage", "sessionStorage"]);
const loadState = z.enum(["domcontentloaded", "load", "networkidle"]);
const downloadBehavior = z.enum(["allow", "deny", "default"]);
const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.string().optional()
});

export function registerBrowserTools(server: ToolServer, service: BrowserService): void {
  server.registerTool(
    "browser_new_page",
    {
      title: "New page",
      description: "Create a new browser page, optionally navigating to a URL and/or using a browser context.",
      inputSchema: {
        url: z.string().url().optional(),
        contextId: z.string().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ url, contextId }) => asToolResult(await service.newPage({ url, contextId }))
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
        pageId: pageId.optional(),
        url: z.string().url()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, url }) => asToolResult(await service.navigate({ pageId, url }))
  );

  simplePageTool(server, "browser_reload", "Reload page", "Reload the current page.", (id) => service.reload(id), false);
  simplePageTool(server, "browser_back", "Go back", "Navigate one entry back in page history.", (id) => service.back(id), false);
  simplePageTool(server, "browser_forward", "Go forward", "Navigate one entry forward in page history.", (id) => service.forward(id), false);
  simplePageTool(server, "browser_page_info", "Page info", "Read URL, title, readyState, viewport, and user agent.", (id) => service.pageInfo(id), true);
  simplePageTool(server, "browser_title", "Page title", "Read the page title.", (id) => service.title(id), true);
  simplePageTool(server, "browser_body_text", "Body text", "Read document body text without requiring a CSS selector.", (id) => service.bodyText(id), true);

  server.registerTool(
    "browser_text",
    {
      title: "Selector text",
      description: "Read textContent for a CSS selector.",
      inputSchema: { pageId, selector },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, selector }) => asToolResult(await service.textContent({ pageId, selector }))
  );

  simplePageTool(server, "browser_content", "Page HTML", "Read the current page HTML.", (id) => service.content(id), true);

  server.registerTool(
    "browser_evaluate",
    {
      title: "Evaluate JavaScript",
      description: "Evaluate a JavaScript expression in a page and return a JSON-serializable result.",
      inputSchema: { pageId, expression: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, expression }) => asToolResult(await service.evaluate({ pageId, expression }))
  );

  server.registerTool(
    "browser_wait_for_text",
    {
      title: "Wait for text",
      description: "Poll the page body until it contains the requested text.",
      inputSchema: {
        pageId,
        text: z.string(),
        timeoutMs: z.number().int().positive().optional(),
        pollMs: z.number().int().positive().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, text, timeoutMs, pollMs }) =>
      asToolResult(await service.waitForText({ pageId, text, timeoutMs, pollMs }))
  );

  server.registerTool(
    "browser_wait_for_selector",
    {
      title: "Wait for selector",
      description: "Wait until a CSS selector exists, optionally requiring it to be visible.",
      inputSchema: {
        pageId,
        selector,
        visible: z.boolean().optional(),
        timeoutMs: z.number().int().positive().optional(),
        pollMs: z.number().int().positive().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, selector, visible, timeoutMs, pollMs }) =>
      asToolResult(await service.waitForSelector({ pageId, selector, visible, timeoutMs, pollMs }))
  );

  server.registerTool(
    "browser_wait_for_url",
    {
      title: "Wait for URL",
      description: "Wait until the current URL matches exact, contains, or regex criteria.",
      inputSchema: {
        pageId,
        exact: z.string().optional(),
        contains: z.string().optional(),
        regex: z.string().optional(),
        timeoutMs: z.number().int().positive().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (input) => asToolResult(await service.waitForUrl(input))
  );

  server.registerTool(
    "browser_wait_for_load_state",
    {
      title: "Wait for load state",
      description: "Wait for domcontentloaded, load, or networkidle.",
      inputSchema: {
        pageId,
        state: loadState,
        timeoutMs: z.number().int().positive().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, state, timeoutMs }) => asToolResult(await service.waitForLoadState({ pageId, state, timeoutMs }))
  );

  server.registerTool(
    "browser_wait_for_expression",
    {
      title: "Wait for expression",
      description: "Poll a JavaScript expression until it returns a truthy value.",
      inputSchema: {
        pageId,
        expression: z.string(),
        timeoutMs: z.number().int().positive().optional(),
        pollMs: z.number().int().positive().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, expression, timeoutMs, pollMs }) =>
      asToolResult(await service.waitForExpression({ pageId, expression, timeoutMs, pollMs }))
  );

  selectorAction(server, "browser_click", "Click selector", "Click the first element matching a CSS selector.", (input) => service.click(input));
  server.registerTool(
    "browser_fill",
    {
      title: "Fill selector",
      description: "Set the value of the first element matching a CSS selector.",
      inputSchema: { pageId, selector, value: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, selector, value }) => asToolResult(await service.fill({ pageId, selector, value }))
  );
  server.registerTool(
    "browser_press",
    {
      title: "Press key",
      description: "Dispatch keydown and keyup events for the active element.",
      inputSchema: { pageId, key: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, key }) => asToolResult(await service.press({ pageId, key }))
  );
  selectorAction(server, "browser_hover", "Hover selector", "Move the mouse over the first matching selector.", (input) => service.hover(input));
  server.registerTool(
    "browser_select_option",
    {
      title: "Select option",
      description: "Select one or more values in a select element.",
      inputSchema: { pageId, selector, values: z.array(z.string()).min(1) },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, selector, values }) => asToolResult(await service.selectOption({ pageId, selector, values }))
  );
  server.registerTool(
    "browser_drag_and_drop",
    {
      title: "Drag and drop",
      description: "Drag a source selector to a target selector.",
      inputSchema: { pageId, sourceSelector: z.string(), targetSelector: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, sourceSelector, targetSelector }) =>
      asToolResult(await service.dragAndDrop({ pageId, sourceSelector, targetSelector }))
  );
  server.registerTool(
    "browser_upload_file",
    {
      title: "Upload file",
      description: "Set files on a file input element. Paths must be local paths visible to the MCP server.",
      inputSchema: { pageId, selector, paths: z.array(z.string()).min(1) },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, selector, paths }) => asToolResult(await service.uploadFile({ pageId, selector, paths }))
  );
  selectorAction(server, "browser_focus", "Focus selector", "Focus the first matching selector.", (input) => service.focus(input));
  selectorAction(server, "browser_blur", "Blur selector", "Blur the first matching selector.", (input) => service.blur(input));

  server.registerTool(
    "browser_screenshot",
    {
      title: "Screenshot",
      description: "Capture a PNG screenshot and return base64 data.",
      inputSchema: { pageId, fullPage: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, fullPage }) => asToolResult(await service.screenshot({ pageId, fullPage }))
  );

  limitTool(server, "browser_network_events", "Network events", "Read recent request/response/failure events.", (input) => service.networkEvents(input));
  server.registerTool(
    "browser_response_body",
    {
      title: "Response body",
      description: "Read a captured response body by requestId from network events.",
      inputSchema: { pageId, requestId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, requestId }) => asToolResult(await service.responseBody({ pageId, requestId }))
  );
  limitTool(server, "browser_console_events", "Console events", "Read recent console messages and page errors.", (input) => service.consoleEvents(input));

  simplePageTool(server, "browser_cookies", "Cookies", "Read cookies visible to the current page URL.", (id) => service.cookies(id), true);
  server.registerTool(
    "browser_set_cookie",
    {
      title: "Set cookie",
      description: "Set a cookie for the current page URL.",
      inputSchema: { pageId, cookie: cookieSchema },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, cookie }) => asToolResult(await service.setCookie({ pageId, cookie }))
  );
  simplePageTool(server, "browser_clear_cookies", "Clear cookies", "Clear browser cookies.", (id) => service.clearCookies(id), false);
  server.registerTool(
    "browser_storage",
    {
      title: "Read storage",
      description: "Read localStorage or sessionStorage entries.",
      inputSchema: { pageId, type: storageType },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, type }) => asToolResult(await service.storage({ pageId, type }))
  );
  server.registerTool(
    "browser_set_storage",
    {
      title: "Set storage",
      description: "Set a localStorage or sessionStorage item.",
      inputSchema: { pageId, type: storageType, key: z.string(), value: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, type, key, value }) => asToolResult(await service.setStorage({ pageId, type, key, value }))
  );
  server.registerTool(
    "browser_clear_storage",
    {
      title: "Clear storage",
      description: "Clear localStorage or sessionStorage.",
      inputSchema: { pageId, type: storageType },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
    },
    async ({ pageId, type }) => asToolResult(await service.clearStorage({ pageId, type }))
  );

  server.registerTool(
    "browser_grant_permissions",
    {
      title: "Grant permissions",
      description: "Grant browser permissions such as geolocation for the current page origin.",
      inputSchema: { pageId, permissions: z.array(z.string()).min(1) },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, permissions }) => asToolResult(await service.grantPermissions({ pageId, permissions }))
  );
  simplePageTool(server, "browser_reset_permissions", "Reset permissions", "Reset browser permissions.", (id) => service.resetPermissions(id), false);
  server.registerTool(
    "browser_set_geolocation",
    {
      title: "Set geolocation",
      description: "Override geolocation coordinates for the page.",
      inputSchema: {
        pageId,
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number().positive().optional()
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, latitude, longitude, accuracy }) =>
      asToolResult(await service.setGeolocation({ pageId, latitude, longitude, accuracy }))
  );

  simplePageTool(server, "browser_list_frames", "List frames", "List the page frame tree.", (id) => service.listFrames(id), true);
  server.registerTool(
    "browser_frame_evaluate",
    {
      title: "Frame evaluate",
      description: "Evaluate JavaScript in a same-origin iframe selected by CSS selector.",
      inputSchema: { pageId, frameSelector: z.string(), expression: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, frameSelector, expression }) =>
      asToolResult(await service.frameEvaluate({ pageId, frameSelector, expression }))
  );
  server.registerTool(
    "browser_create_context",
    {
      title: "Create context",
      description: "Create an isolated browser context.",
      inputSchema: {},
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async () => asToolResult(await service.createContext())
  );
  server.registerTool(
    "browser_list_contexts",
    {
      title: "List contexts",
      description: "List browser contexts known to the backend.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => asToolResult(await service.listContexts())
  );
  server.registerTool(
    "browser_close_context",
    {
      title: "Close context",
      description: "Close an isolated browser context.",
      inputSchema: { contextId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
    },
    async ({ contextId }) => asToolResult(await service.closeContext(contextId))
  );

  simplePageTool(server, "browser_print_pdf", "Print PDF", "Print the page to a base64 PDF.", (id) => service.printPdf(id), true);
  server.registerTool(
    "browser_set_download_behavior",
    {
      title: "Set download behavior",
      description: "Set browser download behavior. Use allow with downloadPath to save downloads.",
      inputSchema: { behavior: downloadBehavior, downloadPath: z.string().optional() },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ behavior, downloadPath }) => asToolResult(await service.setDownloadBehavior({ behavior, downloadPath }))
  );
  simplePageTool(server, "browser_start_tracing", "Start tracing", "Start browser tracing for a page.", (id) => service.startTracing(id), false);
  simplePageTool(server, "browser_stop_tracing", "Stop tracing", "Stop tracing and return trace data.", (id) => service.stopTracing(id), true);
  simplePageTool(server, "browser_accessibility_snapshot", "Accessibility snapshot", "Read the full accessibility tree.", (id) => service.accessibilitySnapshot(id), true);
  server.registerTool(
    "browser_set_blocked_urls",
    {
      title: "Set blocked URLs",
      description: "Block requests whose URLs match CDP URL patterns.",
      inputSchema: { pageId, patterns: z.array(z.string()) },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, patterns }) => asToolResult(await service.setBlockedUrls({ pageId, patterns }))
  );

  simplePageTool(server, "browser_close_page", "Close page", "Close a page by pageId.", (id) => service.closePage(id), false, true);

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

function simplePageTool(
  server: ToolServer,
  name: string,
  title: string,
  description: string,
  handler: (pageId: string) => Promise<unknown>,
  readOnlyHint: boolean,
  destructiveHint = false
): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: { pageId },
      annotations: { readOnlyHint, destructiveHint, openWorldHint: true }
    },
    async ({ pageId }) => asToolResult(await handler(pageId))
  );
}

function selectorAction(
  server: ToolServer,
  name: string,
  title: string,
  description: string,
  handler: (input: { pageId: string; selector: string }) => Promise<unknown>
): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: { pageId, selector },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ pageId, selector }) => asToolResult(await handler({ pageId, selector }))
  );
}

function limitTool(
  server: ToolServer,
  name: string,
  title: string,
  description: string,
  handler: (input: { pageId: string; limit?: number }) => Promise<unknown>
): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: {
        pageId,
        limit: z.number().int().positive().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ pageId, limit }) => asToolResult(await handler({ pageId, limit }))
  );
}

function asToolResult(value: unknown): ToolResult {
  const structuredContent = isRecord(value) ? value : { result: value };
  return {
    structuredContent,
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
