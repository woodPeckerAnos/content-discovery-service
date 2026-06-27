import { runSearch, runSearchBatch } from "./search-service.js";
import type { SearchRequest, SearchResult } from "../types/search.js";

/**
 * 串行执行搜索，避免多个 HTTP / 队列任务同时占用浏览器 Profile。
 */
class SearchExecutor {
  private running = false;
  private waiters: Array<() => void> = [];
  private activeJobs = 0;
  private queuedJobs = 0;

  private async acquire(): Promise<void> {
    if (!this.running) {
      this.running = true;
      return;
    }
    this.queuedJobs++;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.queuedJobs--;
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.running = false;
    }
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return this.runExclusive(task);
  }

  private async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    this.activeJobs++;
    try {
      return await task();
    } finally {
      this.activeJobs--;
      this.release();
    }
  }

  get stats(): { busy: boolean; activeJobs: number; queuedJobs: number } {
    return {
      busy: this.running,
      activeJobs: this.activeJobs,
      queuedJobs: this.queuedJobs,
    };
  }
}

export const searchExecutor = new SearchExecutor();

export async function executeSearch(req: SearchRequest): Promise<SearchResult> {
  return searchExecutor.enqueue(() => runSearch(req));
}

export async function executeSearchBatch(
  requests: SearchRequest[],
): Promise<SearchResult[]> {
  return searchExecutor.enqueue(() => runSearchBatch(requests));
}
