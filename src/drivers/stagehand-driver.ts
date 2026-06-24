import path from "node:path";
import fs from "node:fs/promises";
import { Stagehand } from "@browserbasehq/stagehand";
import { chromium, type Page, type Response } from "playwright-core";
import { loadConfig, getProfilePathForPlatform, type AppConfig } from "../config.js";
import type { Platform } from "../types/content.js";
import type { BrowserDriver, ResponseHandler } from "./browser-driver.js";

export class StagehandDriver implements BrowserDriver {
  private stagehand!: Stagehand;
  private page!: Page;
  private browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null =
    null;
  private responseHandlers = new Set<ResponseHandler>();
  private boundResponseHandler: ((response: Response) => void) | null = null;

  private constructor(
    private readonly config: AppConfig,
    private readonly platform: Platform,
  ) {}

  static async create(platform: Platform): Promise<StagehandDriver> {
    const config = loadConfig();
    const driver = new StagehandDriver(config, platform);
    await driver.init();
    return driver;
  }

  private async init(): Promise<void> {
    const profileDir = getProfilePathForPlatform(this.config, this.platform);
    await fs.mkdir(profileDir, { recursive: true });

    const cacheDir = path.join(this.config.cacheDir, this.platform);
    await fs.mkdir(cacheDir, { recursive: true });

    this.stagehand = new Stagehand({
      env: "LOCAL",
      model: {
        modelName: this.config.LLM_MODEL,
        apiKey: this.config.LLM_API_KEY,
        baseURL: this.config.LLM_BASE_URL,
      },
      cacheDir,
      localBrowserLaunchOptions: {
        headless: this.config.HEADLESS,
        viewport: { width: 1440, height: 900 },
        userDataDir: profileDir,
      },
    });

    await this.stagehand.init();

    this.browser = await chromium.connectOverCDP({
      wsEndpoint: this.stagehand.connectURL(),
    });

    const context = this.browser.contexts()[0];
    if (!context) {
      throw new Error("无法获取 Playwright browser context");
    }

    this.page = context.pages()[0] ?? (await context.newPage());

    this.boundResponseHandler = (response: Response) => {
      for (const handler of this.responseHandlers) {
        void handler(response);
      }
    };
    this.page.on("response", this.boundResponseHandler);
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

  async screenshot(path?: string): Promise<Buffer> {
    return this.page.screenshot({ path, fullPage: false });
  }

  async close(): Promise<void> {
    if (this.boundResponseHandler) {
      this.page.off("response", this.boundResponseHandler);
    }
    this.responseHandlers.clear();
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
    }
    await this.stagehand.close();
  }
}

export async function createStagehandDriver(
  platform: Platform,
): Promise<BrowserDriver> {
  return StagehandDriver.create(platform);
}
