import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { BrowserService } from "../browser/browser-service.js";
import { createPandaMcpServer } from "../mcp/server.js";

export async function serveStdio(service: BrowserService): Promise<void> {
  const server = createPandaMcpServer(service);
  await server.connect(new StdioServerTransport());
}
