#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import type http from "node:http";

import { createBrowserService } from "./browser/factory.js";
import { formatStartupInfo, helpText, parseCliOptions } from "./cli-options.js";
import { BROWSER_TOOL_NAMES } from "./mcp/tools.js";
import { startHttpTransports } from "./transports/http-server.js";
import { serveStdio } from "./transports/stdio.js";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const version = await packageVersion();

  if (options.version) {
    console.log(version);
    return;
  }

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

  for (const line of formatStartupInfo(options, { version, toolCount: BROWSER_TOOL_NAMES.length })) {
    console.error(line);
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

}

main().catch((error: unknown) => {
  if (error instanceof Error && error.message.startsWith("Usage:")) {
    console.error(helpText());
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});

async function packageVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  ) as { version?: string };
  return packageJson.version ?? "0.0.0";
}
