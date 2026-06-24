import path from "node:path";
import fs from "node:fs/promises";
import { Stagehand } from "@browserbasehq/stagehand";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Response,
} from "playwright-core";
import {
  loadConfig,
  getProfilePathForPlatform,
  type AppConfig,
} from "../config.js";
import type { Platform } from "../types/content.js";
import type { BrowserDriver, ResponseHandler } from "./browser-driver.js";
import { readCdpWebSocketUrl } from "./cdp-utils.js";

const AUTH_STATE_FILE = "auth-state.json";

export class StagehandDriver implements BrowserDriver {
  private stagehand!: Stagehand;
  private context!: BrowserContext;
  private page!: Page;
  private responseHandlers = new Set<ResponseHandler>();
  private boundResponseHandler: ((response: Response) => void) | null = null;
  private closed = false;
  private readonly profileDir: string;

  private constructor(
    private readonly config: AppConfig,
    private readonly platform: Platform,
  ) {
    this.profileDir = getProfilePathForPlatform(config, platform);
  }

  static async create(platform: Platform): Promise<StagehandDriver> {
    const config = loadConfig();
    const driver = new StagehandDriver(config, platform);
    await driver.init();
    return driver;
  }

  private async init(): Promise<void> {
    await fs.mkdir(this.profileDir, { recursive: true });

    const cacheDir = path.join(this.config.cacheDir, this.platform);
    await fs.mkdir(cacheDir, { recursive: true });

    const channel = this.config.BROWSER_CHANNEL || undefined;

    // Playwright 持久化 Profile：登录 Cookie 由 context 生命周期管理
    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless: this.config.HEADLESS,
      channel,
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--remote-debugging-port=0",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    this.page = this.context.pages()[0] ?? (await this.context.newPage());

    const cdpUrl = await readCdpWebSocketUrl(this.profileDir);

    // Stagehand 仅附着已有浏览器，不再自行 launch/kill Chrome
    this.stagehand = new Stagehand({
      env: "LOCAL",
      model: {
        modelName: this.config.LLM_MODEL,
        apiKey: this.config.LLM_API_KEY,
        baseURL: this.config.LLM_BASE_URL,
      },
      cacheDir,
      localBrowserLaunchOptions: {
        cdpUrl,
        preserveUserDataDir: true,
      },
    });

    await this.stagehand.init();

    this.boundResponseHandler = (response: Response) => {
      for (const handler of this.responseHandlers) {
        void handler(response);
      }
    };
    this.page.on("response", this.boundResponseHandler);
  }

  getProfileDir(): string {
    return this.profileDir;
  }

  getAuthStatePath(): string {
    return path.join(this.profileDir, AUTH_STATE_FILE);
  }

  async saveAuthState(): Promise<void> {
    await this.context.storageState({ path: this.getAuthStatePath() });
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page
        .waitForLoadState("domcontentloaded", { timeout: 8000 })
        .catch(() => undefined);
      return await this.page.evaluate(`() => {
        if (document.cookie.indexOf("sessionid=") !== -1) return true;
        const avatar = document.querySelector(
          '[data-e2e="user-avatar"], [class*="avatar"][class*="user"], a[href*="/user/"]'
        );
        if (avatar) return true;
        const loginBtn = document.querySelector('[data-e2e="login-button"], [class*="login"]');
        return !loginBtn;
      }`);
    } catch {
      return false;
    }
  }

  async act(instruction: string): Promise<void> {
    await this.stagehand.act(instruction, { page: this.page });
  }

  async extract<T>(
    instruction: string,
    schema: import("zod").ZodType<T>,
  ): Promise<T> {
    return this.stagehand.extract(instruction, schema, { page: this.page });
  }

  onResponse(handler: ResponseHandler): void {
    this.responseHandlers.add(handler);
  }

  offResponse(handler: ResponseHandler): void {
    this.responseHandlers.delete(handler);
  }

  async scroll(deltaY = 800): Promise<void> {
    await this.page.mouse.wheel(0, deltaY);
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  }

  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async screenshot(screenshotPath?: string): Promise<Buffer> {
    return this.page.screenshot({ path: screenshotPath, fullPage: false });
  }

  async evaluate<T>(fn: () => T): Promise<T> {
    return this.page.evaluate(fn);
  }

  async evaluateScript<T>(script: string): Promise<T> {
    const trimmed = script.trim();
    const expression = trimmed.startsWith("()") ? `(${trimmed})()` : trimmed;
    return this.page.evaluate(expression);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.boundResponseHandler) {
      this.page.off("response", this.boundResponseHandler);
    }
    this.responseHandlers.clear();

    try {
      await this.saveAuthState();
    } catch {
      // storageState 失败不阻断关闭
    }

    try {
      await this.context.close();
    } catch {
      // ignore
    }

    try {
      await this.stagehand.close();
    } catch {
      // ignore
    }
  }
}

export async function createStagehandDriver(
  platform: Platform,
): Promise<BrowserDriver> {
  return StagehandDriver.create(platform);
}

export async function openLoginBrowser(platform: Platform): Promise<StagehandDriver> {
  return StagehandDriver.create(platform);
}
