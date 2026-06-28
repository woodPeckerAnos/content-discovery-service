/** 对齐 Projects/schemas/log-entry.schema.json */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type LogEnv = "development" | "production" | "test";

export interface LogHttpContext {
  method?: string;
  path?: string;
  status?: number;
  duration_ms?: number;
  client_ip?: string;
  user_agent?: string;
}

export interface LogErrorDetail {
  type: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  trace_id?: string;
  span_id?: string;
  job_id?: string;
  job_name?: string;
  request_id?: string;
  http?: LogHttpContext;
  duration_ms?: number;
  error?: LogErrorDetail;
  context?: Record<string, unknown>;
  env?: LogEnv;
  version?: string;
}

export interface LogFields {
  trace_id?: string;
  span_id?: string;
  job_id?: string;
  job_name?: string;
  request_id?: string;
  http?: LogHttpContext;
  duration_ms?: number;
  error?: unknown;
  context?: Record<string, unknown>;
}
