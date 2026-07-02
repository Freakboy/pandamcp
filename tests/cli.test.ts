import { describe, expect, test } from "vitest";

import { formatStartupInfo, parseCliOptions } from "../src/cli-options.js";

describe("parseCliOptions", () => {
  test("supports all transports and HTTP CDP endpoint", () => {
    const options = parseCliOptions([
      "--transport",
      "all",
      "--port",
      "3333",
      "-u",
      "http://127.0.0.1:9222"
    ]);

    expect(options.transport).toBe("all");
    expect(options.port).toBe(3333);
    expect(options.cdpEndpoint).toBe("http://127.0.0.1:9222");
    expect(options.backend).toBe("raw-cdp");
  });

  test("supports direct WebSocket endpoint and backend override", () => {
    const options = parseCliOptions([
      "--transport",
      "stdio",
      "-w",
      "ws://127.0.0.1:9222/",
      "--backend",
      "playwright"
    ]);

    expect(options.transport).toBe("stdio");
    expect(options.cdpEndpoint).toBe("ws://127.0.0.1:9222/");
    expect(options.backend).toBe("playwright");
  });

  test("supports short aliases for common options", () => {
    const options = parseCliOptions([
      "-t",
      "mcp",
      "-b",
      "raw-cdp",
      "-p",
      "4444",
      "-H",
      "0.0.0.0",
      "-s",
      "https://example.com"
    ]);

    expect(options.transport).toBe("mcp");
    expect(options.backend).toBe("raw-cdp");
    expect(options.port).toBe(4444);
    expect(options.host).toBe("0.0.0.0");
    expect(options.startUrl).toBe("https://example.com");
  });

  test("supports version aliases", () => {
    expect(parseCliOptions(["-v"]).version).toBe(true);
    expect(parseCliOptions(["--version"]).version).toBe(true);
  });

  test("formats startup information", () => {
    const lines = formatStartupInfo(
      {
        transport: "all",
        backend: "raw-cdp",
        cdpEndpoint: "http://127.0.0.1:9222",
        host: "127.0.0.1",
        port: 3333,
        startUrl: "https://example.com"
      },
      {
        version: "0.1.1",
        toolCount: 52
      }
    );

    expect(lines).toEqual([
      "PandaMCP 0.1.1",
      "Transport: all",
      "Backend: raw-cdp",
      "CDP endpoint: http://127.0.0.1:9222",
      "Start URL: https://example.com",
      "Tools: 52 browser_* tools",
      "HTTP server: http://127.0.0.1:3333",
      "SSE endpoint: http://127.0.0.1:3333/sse",
      "MCP endpoint: http://127.0.0.1:3333/mcp",
      "Use -h or --help for options."
    ]);
  });

  test("rejects invalid transport values", () => {
    expect(() => parseCliOptions(["--transport", "socket"])).toThrow(
      "Invalid --transport value"
    );
  });
});
