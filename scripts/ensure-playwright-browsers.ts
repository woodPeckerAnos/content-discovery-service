import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function chromiumReady(): boolean {
  try {
    const executable = chromium.executablePath();
    return Boolean(executable && fs.existsSync(executable));
  } catch {
    return false;
  }
}

/**
 * 确保 playwright-core 对应的 Chromium 已下载到本机缓存。
 * 集成测试与 Stagehand 均依赖此浏览器。
 */
export function ensurePlaywrightBrowsers(): void {
  if (chromiumReady()) {
    return;
  }

  console.log("未检测到 Playwright Chromium，正在安装（仅首次需要）…");

  const cli = path.join(projectRoot, "node_modules/playwright-core/cli.js");
  const result = spawnSync(process.execPath, [cli, "install", "chromium"], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      "Playwright Chromium 安装失败。请手动运行: node node_modules/playwright-core/cli.js install chromium",
    );
  }

  if (!chromiumReady()) {
    throw new Error(
      "Chromium 安装后仍不可用。请检查网络后重试: npm run setup:browsers",
    );
  }

  console.log("Playwright Chromium 已就绪。");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensurePlaywrightBrowsers();
}
