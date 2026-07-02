# PandaMCP 中文文档

[English README](./README.md)

PandaMCP 是一个本地 MCP 服务，用来把 CDP 兼容浏览器暴露给 MCP 客户端。它在同一套浏览器工具层之上同时支持：

- `stdio`
- legacy SSE：`GET /sse` 和 `POST /messages`
- Streamable HTTP：`POST /mcp`

默认后端是 raw browser-level CDP，不强制依赖 Playwright。需要时也可以通过 `--backend playwright` 切换到 Playwright 的 `chromium.connectOverCDP` 后端。

## 短参数

CLI 支持常用选项的短参数：

- `-t, --transport`
- `-b, --backend`
- `-u, --url`
- `-w, --ws`
- `-H, --host`
- `-p, --port`
- `-s, --start-url`

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

## 通过 npx 使用

发布到 npm 后，可以不克隆仓库直接运行：

```bash
npx pandamcp -t stdio -u http://127.0.0.1:9222
```

如果 MCP 客户端通过 stdio 启动 server，可以把 `npx` 配成 command：

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

HTTP transport 可以这样启动：

```bash
npx pandamcp -t all -p 3333 -u http://127.0.0.1:9222
```

## 发布到 npm

确认已经登录 npm：

```bash
npm whoami
```

运行检查并查看发布内容：

```bash
npm test
npm run typecheck
npm pack --dry-run
```

发布：

```bash
npm publish
```

`prepack` 会在 `npm pack` 和 `npm publish` 前自动运行 `npm run build`，确保发布包中包含最新的 `dist/` 输出。

## 使用方式

通过 CDP HTTP endpoint 连接：

```bash
pandamcp -t sse -p 3333 -u http://127.0.0.1:9222
```

通过 CDP WebSocket endpoint 直连：

```bash
pandamcp -t mcp -p 3333 -w ws://127.0.0.1:9222/
```

使用 stdio：

```bash
pandamcp -t stdio -u http://127.0.0.1:9222
```

在同一个进程里同时暴露 stdio、SSE 和 Streamable HTTP：

```bash
pandamcp -t all -p 3333 -u http://127.0.0.1:9222
```

改用 Playwright 后端：

```bash
pandamcp -t mcp -b playwright -u http://127.0.0.1:9222
```

## HTTP 端点

启用 `--transport sse` 或 `--transport all` 时：

- `GET http://127.0.0.1:3333/sse`
- `POST http://127.0.0.1:3333/messages?sessionId=...`

启用 `--transport mcp` 或 `--transport all` 时：

- `POST http://127.0.0.1:3333/mcp`

## 工具列表

| 工具 | 作用 |
| --- | --- |
| `browser_new_page` | 新建页面，可选地立即打开一个 URL。 |
| `browser_list_pages` | 列出已知页面，包含 `pageId`、URL 和标题。 |
| `browser_navigate` | 导航已有页面；如果省略 `pageId`，会先新建页面。 |
| `browser_reload` | 重新加载当前页面。 |
| `browser_back` | 后退一个页面历史记录。 |
| `browser_forward` | 前进一个页面历史记录。 |
| `browser_page_info` | 读取 URL、标题、ready state、viewport 和 user agent。 |
| `browser_title` | 读取当前页面标题。 |
| `browser_body_text` | 直接读取文档正文文本，不需要调用方传 CSS selector。 |
| `browser_text` | 读取第一个匹配 CSS selector 的元素 `textContent`。 |
| `browser_content` | 读取当前页面 HTML。 |
| `browser_evaluate` | 在页面里执行 JavaScript 表达式。 |
| `browser_wait_for_text` | 轮询页面正文，直到包含指定文本。 |
| `browser_wait_for_selector` | 等待 selector 挂载，或等待其可见。 |
| `browser_wait_for_url` | 等待 URL 精确匹配、包含匹配或正则匹配。 |
| `browser_wait_for_load_state` | 等待 `domcontentloaded`、`load` 或 `networkidle`。 |
| `browser_wait_for_expression` | 轮询 JavaScript 表达式，直到返回 truthy 值。 |
| `browser_click` | 点击第一个匹配 CSS selector 的元素。 |
| `browser_fill` | 设置第一个匹配 CSS selector 的元素值。 |
| `browser_press` | 给当前 active element 发送键盘事件。 |
| `browser_hover` | 将鼠标移动到第一个匹配 selector 的元素上。 |
| `browser_select_option` | 在 `<select>` 元素里选择一个或多个值。 |
| `browser_drag_and_drop` | 将源 selector 拖放到目标 selector。 |
| `browser_upload_file` | 给 file input 设置本地文件。 |
| `browser_focus` | 聚焦第一个匹配 selector 的元素。 |
| `browser_blur` | 让第一个匹配 selector 的元素失焦。 |
| `browser_screenshot` | 截取 PNG 图片并返回 base64 数据。 |
| `browser_network_events` | 读取最近的 request、response 和 failure 事件。 |
| `browser_response_body` | 通过 `requestId` 读取已捕获响应 body。 |
| `browser_console_events` | 读取最近的 console 消息和页面错误。 |
| `browser_cookies` | 读取当前页面 URL 可见的 cookies。 |
| `browser_set_cookie` | 给当前页面 URL 设置 cookie。 |
| `browser_clear_cookies` | 清除浏览器 cookies。 |
| `browser_storage` | 读取 `localStorage` 或 `sessionStorage`。 |
| `browser_set_storage` | 设置 `localStorage` 或 `sessionStorage` 项。 |
| `browser_clear_storage` | 清空 `localStorage` 或 `sessionStorage`。 |
| `browser_grant_permissions` | 授权浏览器权限，例如 geolocation。 |
| `browser_reset_permissions` | 重置浏览器权限。 |
| `browser_set_geolocation` | 覆盖地理位置坐标。 |
| `browser_list_frames` | 列出页面 frame tree。 |
| `browser_frame_evaluate` | 在 CSS selector 选中的同源 iframe 中执行 JavaScript。 |
| `browser_create_context` | 创建隔离浏览器上下文。 |
| `browser_list_contexts` | 列出后端已知浏览器上下文。 |
| `browser_close_context` | 关闭隔离浏览器上下文。 |
| `browser_print_pdf` | 将页面打印为 base64 PDF。 |
| `browser_set_download_behavior` | 配置浏览器下载行为。 |
| `browser_start_tracing` | 开始页面 tracing。 |
| `browser_stop_tracing` | 停止 tracing 并返回 trace 数据。 |
| `browser_accessibility_snapshot` | 读取完整 accessibility tree。 |
| `browser_set_blocked_urls` | 使用 CDP URL pattern 阻断请求。 |
| `browser_close_page` | 根据 `pageId` 关闭页面。 |
| `browser_close_browser` | 关闭后端浏览器连接。 |

## 覆盖范围与限制

PandaMCP 现在已经把常见 Chrome/Playwright 浏览器自动化能力暴露为 MCP 工具：页面历史、页面元信息、丰富等待、网络和控制台检查、cookies 和 web storage、权限和地理位置、高级 selector 输入、frames、隔离上下文、downloads、PDF、tracing、accessibility snapshot 以及 URL blocking。

剩余限制主要取决于底层浏览器后端：

- Lightpanda 和其他 CDP 兼容浏览器不一定实现完整 Chrome CDP domain。
- `browser_frame_evaluate` 通过 CSS selector 选择 iframe 时刻意限制为同源 iframe。
- drag and drop 使用浏览器事件，适用于常见 Web drop handler；原生/系统级拖放仍依赖浏览器支持。
- `browser_set_blocked_urls` 覆盖实用的 URL pattern 请求阻断；完整请求改写/fulfill interception 暂未暴露。
- 下载行为、PDF、tracing 和 accessibility snapshot 依赖底层浏览器支持相应 CDP domain。

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
        "-t",
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
node <path-to-pandamcp>/dist/cli.js -t all -p 3333 -u http://127.0.0.1:9222
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
npx @modelcontextprotocol/inspector node <path-to-pandamcp>/dist/cli.js -t stdio -u http://127.0.0.1:9222
```

工具列表中应包含 `browser_navigate`、`browser_title`、`browser_text` 以及其他 `browser_*` 工具。
