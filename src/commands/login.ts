/** 交互式登录：打开持久化 Profile 浏览器，验证 Cookie 后写入 auth-state.json。 */
import readline from "node:readline";
import { getProfilePathForPlatform, loadConfig } from "../config.js";
import {
  openLoginBrowser,
  type StagehandDriver,
} from "../drivers/stagehand-driver.js";
import type { Platform } from "../types/content.js";
import { PLATFORMS } from "../types/search.js";

const LOGIN_CHECK_URL = "https://www.douyin.com/";

export async function runInteractiveLogin(platform: Platform): Promise<void> {
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  const config = loadConfig();
  const profileDir = getProfilePathForPlatform(config, platform);

  console.log(`Profile 目录: ${profileDir}`);
  console.log(`浏览器: ${config.BROWSER_CHANNEL || "chromium 默认"}`);
  console.log("正在打开浏览器，请完成登录（扫码或手机号）…");
  console.log("登录成功后，确认页面右上角已显示头像，再回到终端继续。\n");

  let driver: StagehandDriver | null = null;
  try {
    driver = await openLoginBrowser(platform);
    await driver.goto(LOGIN_CHECK_URL);
    await driver.wait(3000);

    await waitForEnter("登录完成后按 Enter 保存登录态并退出浏览器…");

    await driver.wait(2000);
    const loggedIn = await driver.isLoggedIn();
    await driver.saveAuthState();

    if (loggedIn) {
      console.log(`登录态已保存: ${profileDir}`);
      console.log(`备份文件: ${driver.getAuthStatePath()}`);
    } else {
      console.warn(
        "未检测到登录 Cookie（sessionid）。若页面仍显示登录按钮，请重新运行 npm run login。",
      );
    }
  } finally {
    if (driver) {
      await driver.close();
    }
  }
}

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}
