import fs from "node:fs/promises";
import path from "node:path";
import { sleep } from "../utils/retry.js";

export async function readCdpWebSocketUrl(
  userDataDir: string,
  timeoutMs = 15_000,
): Promise<string> {
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(portFile, "utf8");
      const lines = raw.trim().split("\n");
      const port = lines[0]?.trim();
      const wsPath = lines.slice(1).join("").trim();
      if (port && wsPath) {
        return `ws://127.0.0.1:${port}${wsPath.startsWith("/") ? wsPath : `/${wsPath}`}`;
      }
    } catch {
      // Chrome 尚未写入 DevToolsActivePort
    }
    await sleep(200);
  }

  throw new Error(
    `无法读取 ${portFile}，请确认 Chromium 已启用 remote debugging`,
  );
}
