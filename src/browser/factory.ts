import type { BackendMode } from "../cli-options.js";
import { BrowserService } from "./browser-service.js";
import { PlaywrightBackend } from "./playwright-backend.js";
import { RawCdpBackend } from "./raw-cdp-backend.js";
import type { BrowserBackend } from "./types.js";

export interface BrowserServiceOptions {
  backend: BackendMode;
  cdpEndpoint: string;
}

export function createBrowserBackend(options: BrowserServiceOptions): BrowserBackend {
  if (options.backend === "playwright") {
    return new PlaywrightBackend(options.cdpEndpoint);
  }
  return new RawCdpBackend({ endpoint: options.cdpEndpoint });
}

export function createBrowserService(options: BrowserServiceOptions): BrowserService {
  return new BrowserService(createBrowserBackend(options));
}
