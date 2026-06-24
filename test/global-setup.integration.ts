import { ensurePlaywrightBrowsers } from "../scripts/ensure-playwright-browsers.js";

export default function globalSetup(): void {
  ensurePlaywrightBrowsers();
}
