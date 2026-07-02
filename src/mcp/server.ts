import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BrowserService } from "../browser/browser-service.js";
import { packageVersion } from "../version.js";
import { registerBrowserTools } from "./tools.js";

export function createPandaMcpServer(service: BrowserService): McpServer {
  const server = new McpServer(
    {
      name: "pandamcp",
      version: packageVersion()
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  registerBrowserTools(server, service);
  return server;
}
