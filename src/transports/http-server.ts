import http from "node:http";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { BrowserService } from "../browser/browser-service.js";
import { createPandaMcpServer } from "../mcp/server.js";
import type { TransportMode } from "../cli-options.js";

export interface HttpTransportOptions {
  host: string;
  port: number;
  transport: Extract<TransportMode, "sse" | "mcp" | "all">;
  service: BrowserService;
}

export async function startHttpTransports(options: HttpTransportOptions): Promise<http.Server> {
  const app = createMcpExpressApp();
  const sseSessions = new Map<
    string,
    { transport: SSEServerTransport; server: ReturnType<typeof createPandaMcpServer> }
  >();

  if (options.transport === "sse" || options.transport === "all") {
    app.get("/sse", async (_req, res) => {
      const transport = new SSEServerTransport("/messages", res);
      const server = createPandaMcpServer(options.service);
      sseSessions.set(transport.sessionId, { transport, server });
      transport.onclose = () => {
        sseSessions.delete(transport.sessionId);
      };
      await server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      const sessionId = String(req.query.sessionId ?? "");
      const session = sseSessions.get(sessionId);
      if (!session) {
        res.status(404).send("SSE session not found");
        return;
      }
      await session.transport.handlePostMessage(req, res, req.body);
    });
  }

  if (options.transport === "mcp" || options.transport === "all") {
    app.post("/mcp", async (req, res) => {
      const server = createPandaMcpServer(options.service);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    });

    app.get("/mcp", (_req, res) => {
      res.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null
      });
    });
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(options.port, options.host, () => resolve(server));
    server.on("error", reject);
  });
}
