import { runSearch, runSearchBatch } from "./search-service.js";
import type { SearchRequest, SearchResult } from "../types/search.js";

/**
 * 进程内互斥：HTTP、Worker、CLI 共用同一 searchExecutor 实例。
 *
 * Playwright 持久化 Profile 不支持并发多 context，故所有浏览器任务在此排队。
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
