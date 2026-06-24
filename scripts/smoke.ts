#!/usr/bin/env node
/**
 * 本地 smoke：不访问抖音，只验证关键浏览器脚本与配置可在本机跑通。
 * 用于在提交前发现 page.evaluate / Playwright / 配置类问题。
 */
import { spawnSync } from "node:child_process";
import { ensurePlaywrightBrowsers } from "./ensure-playwright-browsers.js";

const steps: Array<{ name: string; run: () => void }> = [
  { name: "typecheck", run: () => runNpm("typecheck") },
  { name: "unit tests", run: () => runNpm("test") },
  {
    name: "playwright browsers",
    run: () => ensurePlaywrightBrowsers(),
  },
  {
    name: "integration tests",
    run: () => runNpm("test:integration"),
  },
];

function runNpm(script: string): void {
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`npm run ${script} failed`);
  }
}

let failed = false;

for (const step of steps) {
  console.log(`\n▶ smoke: ${step.name}`);
  try {
    step.run();
    console.log(`✓ ${step.name}`);
  } catch (err) {
    console.error(`✗ smoke failed at: ${step.name}`);
    console.error(err instanceof Error ? err.message : err);
    failed = true;
    break;
  }
}

process.exit(failed ? 1 : 0);
