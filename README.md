# PandaMCP

[中文文档](./README.zh-CN.md)

PandaMCP is a local MCP server for CDP-compatible browsers. It exposes one unified browser tool layer through:

- `stdio`
- legacy SSE: `GET /sse` and `POST /messages`
- Streamable HTTP: `POST /mcp`

The default backend is raw browser-level CDP. Playwright is available as an optional backend with the same tool surface.

## Short Options

The CLI supports short aliases for the common options:

- `-t, --transport`
- `-b, --backend`
- `-u, --url`
- `-w, --ws`
- `-H, --host`
- `-p, --port`
- `-s, --start-url`

## Why PandaMCP

PandaMCP was created for the gap between generic MCP browser tools and [Lightpanda](https://lightpanda.io/docs/)-style CDP endpoints.

Lightpanda is an AI-native browser with CDP support, and it also ships its own MCP mode. That native MCP is useful, but it is a Lightpanda-specific tool surface. PandaMCP exists for the other case: you already have MCP clients or agents that expect a more generic browser automation tool layer, and you want to connect them to a Lightpanda CDP server without depending on Chrome's exact DevTools target behavior.

Common pain points it addresses:

- Lightpanda can run as a CDP server for clients such as Playwright, Puppeteer, and Chromedp, but generic MCP browser servers often assume Chrome's exact `/json/list` and `/json/new` behavior.
- In local testing, the Lightpanda CDP endpoint exposed a browser-level WebSocket and could be driven with `Target.createTarget`, `Target.attachToTarget`, and `Page.navigate`, while generic Chrome-oriented MCP tooling failed to attach.
- Lightpanda's native MCP tool names and semantics are not the same as generic browser MCP tools, so existing agents may need a compatibility layer instead of a new workflow.
- Lightpanda's MCP documentation uses stdio locally and suggests an extra bridge for HTTP transport; PandaMCP exposes stdio, legacy SSE, and Streamable HTTP directly.
- Browser automation tools can become tied to one backend, such as Playwright, even when raw CDP is enough or more reliable for a specific endpoint.
- Agents need stable, discoverable browser tools instead of transport-specific, browser-specific, or backend-specific commands.

PandaMCP keeps these concerns separate:

- MCP transport is selectable: `stdio`, `sse`, `mcp`, or `all`.
- CDP connection is selectable: HTTP endpoint with `-u` or direct WebSocket with `-w`.
- Browser backend is selectable: raw CDP by default, Playwright when requested.
- Tool names stay the same regardless of transport or backend.

This is useful for local browser agents, Lightpanda-style CDP endpoints, headless browser experiments, and clients that need one MCP configuration to cover multiple protocol generations.

## Install

```bash
npm install
npm run build
```

## Use With npx

After the package is published to npm, run it without a local checkout:

```bash
npx pandamcp -t stdio -u http://127.0.0.1:9222
```

For MCP clients that spawn stdio servers, configure `npx` as the command:

```json
{
  "mcpServers": {
    "pandamcp": {
      "command": "npx",
      "args": [
        "-y",
        "pandamcp",
        "-t",
        "stdio",
        "-u",
        "http://127.0.0.1:9222"
      ]
    }
  }
}
```

For HTTP transports:

```bash
npx pandamcp -t all -p 3333 -u http://127.0.0.1:9222
```

## Publish to npm

Make sure you are logged in:

```bash
npm whoami
```

Run checks and inspect the publish contents:

```bash
npm test
npm run typecheck
npm pack --dry-run
```

Publish:

```bash
npm publish
```

`prepack` runs `npm run build` before `npm pack` and `npm publish`, so the package always includes fresh `dist/` output.

## Usage

Connect through a CDP HTTP endpoint:

```bash
pandamcp -t sse -p 3333 -u http://127.0.0.1:9222
```

Connect through a direct CDP WebSocket endpoint:

```bash
pandamcp -t mcp -p 3333 -w ws://127.0.0.1:9222/
```

Run over stdio:

```bash
pandamcp -t stdio -u http://127.0.0.1:9222
```

Expose stdio, SSE, and Streamable HTTP in one process:

```bash
pandamcp -t all -p 3333 -u http://127.0.0.1:9222
```

Use Playwright's `chromium.connectOverCDP` backend instead of raw CDP:

```bash
pandamcp -t mcp -b playwright -u http://127.0.0.1:9222
```

## HTTP Endpoints

When `--transport sse` or `--transport all` is enabled:

- `GET http://127.0.0.1:3333/sse`
- `POST http://127.0.0.1:3333/messages?sessionId=...`

When `--transport mcp` or `--transport all` is enabled:

- `POST http://127.0.0.1:3333/mcp`

## Tools

| Tool | Purpose |
| --- | --- |
| `browser_new_page` | Create a new page, optionally opening a URL immediately. |
| `browser_list_pages` | List known pages with `pageId`, URL, and title. |
| `browser_navigate` | Navigate an existing page, or create one when `pageId` is omitted. |
| `browser_reload` | Reload the current page. |
| `browser_back` | Navigate one entry back in page history. |
| `browser_forward` | Navigate one entry forward in page history. |
| `browser_page_info` | Read URL, title, ready state, viewport, and user agent. |
| `browser_title` | Read the current page title. |
| `browser_body_text` | Read the document body text directly, without requiring a selector. |
| `browser_text` | Read `textContent` from the first element matching a CSS selector. |
| `browser_content` | Read the current page HTML. |
| `browser_evaluate` | Evaluate a JavaScript expression in the page. |
| `browser_wait_for_text` | Poll the page body until it contains the requested text. |
| `browser_wait_for_selector` | Wait for a selector to be attached or visible. |
| `browser_wait_for_url` | Wait for exact, contains, or regex URL matching. |
| `browser_wait_for_load_state` | Wait for `domcontentloaded`, `load`, or `networkidle`. |
| `browser_wait_for_expression` | Poll a JavaScript expression until it returns a truthy value. |
| `browser_click` | Click the first element matching a CSS selector. |
| `browser_fill` | Set the value of the first element matching a CSS selector. |
| `browser_press` | Dispatch key events for the active element. |
| `browser_hover` | Move the mouse over the first matching selector. |
| `browser_select_option` | Select one or more values in a `<select>` element. |
| `browser_drag_and_drop` | Drag a source selector to a target selector. |
| `browser_upload_file` | Set files on a file input. |
| `browser_focus` | Focus the first matching selector. |
| `browser_blur` | Blur the first matching selector. |
| `browser_screenshot` | Capture a PNG screenshot as base64 data. |
| `browser_network_events` | Read recent request, response, and failure events. |
| `browser_response_body` | Read a captured response body by `requestId`. |
| `browser_console_events` | Read recent console messages and page errors. |
| `browser_cookies` | Read cookies visible to the current page URL. |
| `browser_set_cookie` | Set a cookie for the current page URL. |
| `browser_clear_cookies` | Clear browser cookies. |
| `browser_storage` | Read `localStorage` or `sessionStorage`. |
| `browser_set_storage` | Set a `localStorage` or `sessionStorage` item. |
| `browser_clear_storage` | Clear `localStorage` or `sessionStorage`. |
| `browser_grant_permissions` | Grant browser permissions such as geolocation. |
| `browser_reset_permissions` | Reset browser permissions. |
| `browser_set_geolocation` | Override geolocation coordinates. |
| `browser_list_frames` | List the page frame tree. |
| `browser_frame_evaluate` | Evaluate JavaScript in a same-origin iframe selected by CSS selector. |
| `browser_create_context` | Create an isolated browser context. |
| `browser_list_contexts` | List browser contexts known to the backend. |
| `browser_close_context` | Close an isolated browser context. |
| `browser_print_pdf` | Print the page to a base64 PDF. |
| `browser_set_download_behavior` | Configure browser download behavior. |
| `browser_start_tracing` | Start browser tracing for a page. |
| `browser_stop_tracing` | Stop tracing and return trace data. |
| `browser_accessibility_snapshot` | Read the full accessibility tree. |
| `browser_set_blocked_urls` | Block requests using CDP URL patterns. |
| `browser_close_page` | Close a page by `pageId`. |
| `browser_close_browser` | Close the backend browser connection. |

## Coverage And Limits

PandaMCP now exposes the common Chrome/Playwright browser automation surface through MCP: navigation history, page metadata, rich waits, network and console inspection, cookies and web storage, permissions and geolocation, advanced selector input, frames, isolated contexts, downloads, PDF, tracing, accessibility snapshots, and URL blocking.

The remaining limits are mostly browser-backend dependent:

- Lightpanda and other CDP-compatible browsers may not implement every Chrome CDP domain used by the full tool surface.
- `browser_frame_evaluate` is intentionally same-origin when selecting an iframe by CSS selector.
- Drag and drop uses browser events and works for normal web drop handlers, but native/OS-level drag targets can still require browser-specific support.
- `browser_set_blocked_urls` covers practical request blocking with CDP URL patterns; full request mutation/fulfillment interception is not exposed yet.
- Download behavior, PDF, tracing, and accessibility snapshots depend on the underlying browser supporting the corresponding CDP domain.

## Validation

```bash
npm test
npm run typecheck
npm run build
```

## Testing Configuration

Test the setup in three layers.

First, verify the project builds and tests locally:

```bash
cd <path-to-pandamcp>
npm test
npm run typecheck
npm run build
```

Next, verify the CDP endpoint is reachable:

```bash
curl http://127.0.0.1:9222/json/version
```

The response should include `webSocketDebuggerUrl`. Then run a real CDP smoke test:

```bash
node - <<'NODE'
import { createBrowserService } from './dist/browser/factory.js';

const service = createBrowserService({
  backend: 'raw-cdp',
  cdpEndpoint: 'http://127.0.0.1:9222'
});

await service.connect();
const page = await service.navigate({ url: 'https://www.google.com' });
console.log(await service.title(page.pageId));
await service.closePage(page.pageId).catch(() => undefined);
await service.close();
NODE
```

Expected output includes `Google`.

Finally, verify MCP transport configuration.

For stdio clients, use this MCP server config:

```json
{
  "mcpServers": {
    "pandamcp": {
      "command": "node",
      "args": [
        "<path-to-pandamcp>/dist/cli.js",
        "-t",
        "stdio",
        "-u",
        "http://127.0.0.1:9222"
      ]
    }
  }
}
```

For SSE and Streamable HTTP, start the server manually:

```bash
node <path-to-pandamcp>/dist/cli.js -t all -p 3333 -u http://127.0.0.1:9222
```

Check the Streamable HTTP endpoint:

```bash
curl -i http://127.0.0.1:3333/mcp
```

`405 Method Not Allowed` for `GET /mcp` is expected. It means the endpoint exists; MCP messages use `POST /mcp`.

Check the SSE endpoint:

```bash
curl -i --max-time 1 http://127.0.0.1:3333/sse
```

Expected output includes:

```text
event: endpoint
data: /messages?sessionId=...
```

You can also inspect the stdio server with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node <path-to-pandamcp>/dist/cli.js -t stdio -u http://127.0.0.1:9222
```

The tool list should include `browser_navigate`, `browser_title`, `browser_text`, and the other `browser_*` tools.
