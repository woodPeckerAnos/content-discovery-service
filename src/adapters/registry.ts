/** 平台适配器注册表；V1 仅 douyin 为完整实现，其余为 stub。 */
import type { Platform } from "../types/content.js";
import type { PlatformAdapter } from "./platform-adapter.js";
import { DouyinAdapter } from "./douyin/adapter.js";
import { XiaohongshuAdapter } from "./_stubs/xiaohongshu.js";
import { XAdapter } from "./_stubs/x.js";
import { createStubAdapter } from "./_stubs/generic.js";

const adapters: Record<Platform, PlatformAdapter> = {
  douyin: new DouyinAdapter(),
  xiaohongshu: new XiaohongshuAdapter(),
  kuaishou: createStubAdapter("kuaishou"),
  x: new XAdapter(),
  weibo: createStubAdapter("weibo"),
};

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters[platform];
  if (!adapter) {
    throw new Error(`不支持的平台: ${platform}`);
  }
  return adapter;
}

export function listAdapters(): Platform[] {
  return Object.keys(adapters) as Platform[];
}
