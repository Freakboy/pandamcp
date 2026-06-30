# PandaMCP 中文文档

[English README](./README.md)

PandaMCP 是一个本地 MCP 服务，用来把 CDP 兼容浏览器暴露给 MCP 客户端。它在同一套浏览器工具层之上同时支持：

- `stdio`
- legacy SSE：`GET /sse` 和 `POST /messages`
- Streamable HTTP：`POST /mcp`

默认后端是 raw browser-level CDP，不强制依赖 Playwright。需要时也可以通过 `--backend playwright` 切换到 Playwright 的 `chromium.connectOverCDP` 后端。

## 解决的问题

PandaMCP 主要是为了解决通用 MCP 浏览器工具和 [Lightpanda](https://lightpanda.io/docs/) 这类 CDP endpoint 之间的兼容断层。

Lightpanda 是面向 AI 的浏览器，支持 CDP，也提供自己的 MCP 模式。Lightpanda 原生 MCP 很有用，但它是一套 Lightpanda 自己的工具面。PandaMCP 解决的是另一个场景：你已经有依赖通用浏览器自动化工具名的 MCP 客户端或 Agent，希望它们可以连接 Lightpanda CDP server，而不是被 Chrome DevTools target 列表的具体行为卡住。

常见痛点：

- Lightpanda 可以作为 CDP server 供 Playwright、Puppeteer、Chromedp 这类客户端连接，但通用 MCP 浏览器服务往往会假设 Chrome 完整支持 `/json/list` 和 `/json/new`。
- 本地测试中，Lightpanda CDP endpoint 暴露的是 browser-level WebSocket，可以通过 `Target.createTarget`、`Target.attachToTarget` 和 `Page.navigate` 驱动；但面向 Chrome target 列表的通用 MCP 工具会 attach 失败。
- Lightpanda 原生 MCP 的工具名和语义与通用浏览器 MCP 工具不同，已有 Agent 可能更需要一个兼容层，而不是重写工作流。
- Lightpanda MCP 文档中的本地方式是 stdio，HTTP transport 需要额外桥接；PandaMCP 直接暴露 stdio、legacy SSE 和 Streamable HTTP。
- 浏览器自动化工具容易和某个后端强绑定，例如只走 Playwright；但在特定 CDP endpoint 上 raw CDP 可能更直接、更可靠。
- Agent 更需要稳定、可发现的工具名，而不是 transport、browser 或 backend 绑定的临时命令。

PandaMCP 把这些概念拆开：

- MCP transport 可选：`stdio`、`sse`、`mcp` 或 `all`。
- CDP 连接可选：用 `-u` 指定 HTTP endpoint，或用 `-w` 指定 WebSocket endpoint。
- 浏览器后端可选：默认 raw CDP，显式指定时使用 Playwright。
- 工具名保持稳定，不随 transport 或 backend 改变。

这适合本地浏览器 Agent、Lightpanda 风格的 CDP endpoint、headless browser 实验，以及需要兼容多代 MCP 传输协议的客户端配置。

## 安装

```bash
npm install
npm run build
```

## 使用方式

通过 CDP HTTP endpoint 连接：

```bash
pandamcp --transport sse --port 3333 -u http://127.0.0.1:9222
```

通过 CDP WebSocket endpoint 直连：

```bash
pandamcp --transport mcp --port 3333 -w ws://127.0.0.1:9222/
```

使用 stdio：

```bash
pandamcp --transport stdio -u http://127.0.0.1:9222
```

在同一个进程里同时暴露 stdio、SSE 和 Streamable HTTP：

```bash
pandamcp --transport all --port 3333 -u http://127.0.0.1:9222
```

改用 Playwright 后端：

```bash
pandamcp --transport mcp --backend playwright -u http://127.0.0.1:9222
```

## HTTP 端点

启用 `--transport sse` 或 `--transport all` 时：

- `GET http://127.0.0.1:3333/sse`
- `POST http://127.0.0.1:3333/messages?sessionId=...`

启用 `--transport mcp` 或 `--transport all` 时：

- `POST http://127.0.0.1:3333/mcp`

## 工具列表

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

## 基础验证

```bash
npm test
npm run typecheck
npm run build
```

## 配置测试

建议按三层测试配置。

第一层，验证项目本身可以测试、类型检查和构建：

```bash
cd <path-to-pandamcp>
npm test
npm run typecheck
npm run build
```

第二层，验证 CDP endpoint 可访问：

```bash
curl http://127.0.0.1:9222/json/version
```

响应里应该包含 `webSocketDebuggerUrl`。然后跑一次真实 CDP smoke test：

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

预期输出里包含 `Google`。

第三层，验证 MCP transport 配置。

stdio 客户端可以使用下面的 MCP server 配置：

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

SSE 和 Streamable HTTP 可以手动启动服务：

```bash
node <path-to-pandamcp>/dist/cli.js --transport all --port 3333 -u http://127.0.0.1:9222
```

检查 Streamable HTTP endpoint：

```bash
curl -i http://127.0.0.1:3333/mcp
```

`GET /mcp` 返回 `405 Method Not Allowed` 是正常的。这说明 endpoint 存在；MCP 消息应使用 `POST /mcp`。

检查 SSE endpoint：

```bash
curl -i --max-time 1 http://127.0.0.1:3333/sse
```

预期输出包含：

```text
event: endpoint
data: /messages?sessionId=...
```

也可以用 MCP Inspector 检查 stdio 服务：

```bash
npx @modelcontextprotocol/inspector node <path-to-pandamcp>/dist/cli.js --transport stdio -u http://127.0.0.1:9222
```

工具列表中应包含 `browser_navigate`、`browser_title`、`browser_text` 以及其他 `browser_*` 工具。
