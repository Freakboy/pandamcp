#!/usr/bin/env node
import type http from "node:http";

import { createBrowserService } from "./browser/factory.js";
import { helpText, parseCliOptions } from "./cli-options.js";
import { startHttpTransports } from "./transports/http-server.js";
import { serveStdio } from "./transports/stdio.js";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const service = createBrowserService({
    backend: options.backend,
    cdpEndpoint: options.cdpEndpoint
  });
  let httpServer: http.Server | undefined;

  process.once("SIGINT", () => {
    httpServer?.close();
    void service.close().finally(() => process.exit(0));
  });

  await service.connect();
  if (options.startUrl) {
    await service.newPage(options.startUrl);
  }

  if (options.transport === "stdio") {
    await serveStdio(service);
    return;
  }

  if (options.transport === "all") {
    await serveStdio(service);
  }

  const httpTransport =
    options.transport === "all" ? "all" : options.transport === "sse" ? "sse" : "mcp";
  httpServer = await startHttpTransports({
    host: options.host,
    port: options.port,
    transport: httpTransport,
    service
  });

  console.error(`PandaMCP listening on http://${options.host}:${options.port}`);
  if (httpTransport === "sse" || httpTransport === "all") {
    console.error(`SSE endpoint: http://${options.host}:${options.port}/sse`);
  }
  if (httpTransport === "mcp" || httpTransport === "all") {
    console.error(`MCP endpoint: http://${options.host}:${options.port}/mcp`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.message.startsWith("Usage:")) {
    console.error(helpText());
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});
