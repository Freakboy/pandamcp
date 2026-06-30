# PandaMCP

[中文文档](./README.zh-CN.md)

PandaMCP is a local MCP server for CDP-compatible browsers. It exposes one unified browser tool layer through:

- `stdio`
- legacy SSE: `GET /sse` and `POST /messages`
- Streamable HTTP: `POST /mcp`

The default backend is raw browser-level CDP. Playwright is available as an optional backend with the same tool surface.

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

## Usage

Connect through a CDP HTTP endpoint:

```bash
pandamcp --transport sse --port 3333 -u http://127.0.0.1:9222
```

Connect through a direct CDP WebSocket endpoint:

```bash
pandamcp --transport mcp --port 3333 -w ws://127.0.0.1:9222/
```

Run over stdio:

```bash
pandamcp --transport stdio -u http://127.0.0.1:9222
```

Expose stdio, SSE, and Streamable HTTP in one process:

```bash
pandamcp --transport all --port 3333 -u http://127.0.0.1:9222
```

Use Playwright's `chromium.connectOverCDP` backend instead of raw CDP:

```bash
pandamcp --transport mcp --backend playwright -u http://127.0.0.1:9222
```

## HTTP Endpoints

When `--transport sse` or `--transport all` is enabled:

- `GET http://127.0.0.1:3333/sse`
- `POST http://127.0.0.1:3333/messages?sessionId=...`

When `--transport mcp` or `--transport all` is enabled:

- `POST http://127.0.0.1:3333/mcp`

## Tools

- `browser_new_page`
- `browser_list_pages`
- `browser_navigate`
- `browser_title`
- `browser_text`
- `browser_content`
- `browser_evaluate`
- `browser_click`
- `browser_fill`
- `browser_press`
- `browser_screenshot`
- `browser_wait_for_text`
- `browser_close_page`
- `browser_close_browser`

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
        "--transport",
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
node <path-to-pandamcp>/dist/cli.js --transport all --port 3333 -u http://127.0.0.1:9222
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
npx @modelcontextprotocol/inspector node <path-to-pandamcp>/dist/cli.js --transport stdio -u http://127.0.0.1:9222
```

The tool list should include `browser_navigate`, `browser_title`, `browser_text`, and the other `browser_*` tools.
