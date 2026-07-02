import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { createPandaMcpServer } from "../src/mcp/server.js";
import type { BrowserService } from "../src/browser/browser-service.js";

describe("createPandaMcpServer", () => {
  test("uses the package version in MCP server metadata", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { version: string };
    const server = createPandaMcpServer({} as BrowserService) as unknown as {
      server: { _serverInfo: { name: string; version: string } };
    };

    expect(server.server._serverInfo).toEqual({
      name: "pandamcp",
      version: packageJson.version
    });
  });
});
