export type TransportMode = "stdio" | "sse" | "mcp" | "all";
export type BackendMode = "raw-cdp" | "playwright" | "auto";

export interface CliOptions {
  transport: TransportMode;
  backend: BackendMode;
  cdpEndpoint: string;
  host: string;
  port: number;
  startUrl?: string;
}

const transports = new Set<TransportMode>(["stdio", "sse", "mcp", "all"]);
const backends = new Set<BackendMode>(["raw-cdp", "playwright", "auto"]);

export function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    transport: "stdio",
    backend: "raw-cdp",
    cdpEndpoint: "http://127.0.0.1:9222",
    host: "127.0.0.1",
    port: 3333
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-t" || arg === "--transport") {
      options.transport = readEnum(argv, (index += 1), "--transport", transports);
    } else if (arg === "-b" || arg === "--backend") {
      options.backend = readEnum(argv, (index += 1), "--backend", backends);
    } else if (arg === "-p" || arg === "--port") {
      options.port = readPort(argv, (index += 1));
    } else if (arg === "-H" || arg === "--host") {
      options.host = readValue(argv, (index += 1), "--host");
    } else if (arg === "-u" || arg === "--url" || arg === "--cdp-endpoint") {
      options.cdpEndpoint = readValue(argv, (index += 1), arg);
    } else if (arg === "-w" || arg === "--ws") {
      options.cdpEndpoint = readValue(argv, (index += 1), arg);
    } else if (arg === "-s" || arg === "--start-url") {
      options.startUrl = readValue(argv, (index += 1), "--start-url");
    } else if (arg === "-h" || arg === "--help") {
      throw new Error(helpText());
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function helpText(): string {
  return [
    "Usage: pandamcp [-t stdio|sse|mcp|all] [-u http://127.0.0.1:9222] [-w ws://127.0.0.1:9222/]",
    "",
    "Options:",
    "  -t, --transport <mode>   MCP transport: stdio, sse, mcp, or all. Default: stdio",
    "  -b, --backend <mode>     Browser backend: raw-cdp, playwright, or auto. Default: raw-cdp",
    "  -u, --url <url>          CDP HTTP endpoint. Default: http://127.0.0.1:9222",
    "  -w, --ws <url>           CDP WebSocket endpoint.",
    "  -H, --host <host>        HTTP bind host. Default: 127.0.0.1",
    "  -p, --port <port>        HTTP bind port. Default: 3333",
    "  -s, --start-url <url>    Optional page to open during startup."
  ].join("\n");
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readPort(argv: string[], index: number): number {
  const raw = readValue(argv, index, "--port");
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid --port value");
  }
  return port;
}

function readEnum<T extends string>(
  argv: string[],
  index: number,
  flag: string,
  values: Set<T>
): T {
  const raw = readValue(argv, index, flag);
  if (!values.has(raw as T)) {
    throw new Error(`Invalid ${flag} value: ${raw}`);
  }
  return raw as T;
}
