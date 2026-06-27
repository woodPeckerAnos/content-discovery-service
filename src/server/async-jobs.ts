import { randomUUID } from "node:crypto";
import type { SearchResult } from "../types/search.js";

export type AsyncSearchStatus = "pending" | "running" | "completed" | "failed";

export interface AsyncSearchJob {
  id: string;
  status: AsyncSearchStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: SearchResult;
  error?: string;
}

const jobs = new Map<string, AsyncSearchJob>();
const TTL_MS = 24 * 60 * 60 * 1000;

export function createAsyncSearchJob(): AsyncSearchJob {
  const job: AsyncSearchJob = {
    id: randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getAsyncSearchJob(id: string): AsyncSearchJob | undefined {
  return jobs.get(id);
}

export function markAsyncSearchRunning(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "running";
  job.startedAt = new Date().toISOString();
}

export function completeAsyncSearchJob(
  id: string,
  result: SearchResult,
): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "completed";
  job.finishedAt = new Date().toISOString();
  job.result = result;
  scheduleCleanup(id);
}

export function failAsyncSearchJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "failed";
  job.finishedAt = new Date().toISOString();
  job.error = error;
  scheduleCleanup(id);
}

function scheduleCleanup(id: string): void {
  setTimeout(() => jobs.delete(id), TTL_MS).unref?.();
}

export function listAsyncSearchJobs(): AsyncSearchJob[] {
  return [...jobs.values()];
}
