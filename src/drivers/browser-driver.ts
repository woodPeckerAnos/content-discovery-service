import type { Response } from "playwright-core";
import type { z } from "zod";

export type ResponseHandler = (response: Response) => void | Promise<void>;

export interface BrowserDriver {
  act(instruction: string): Promise<void>;
  extract<T extends z.ZodTypeAny>(
    instruction: string,
    schema: T,
  ): Promise<z.infer<T>>;
  onResponse(handler: ResponseHandler): void;
  offResponse(handler: ResponseHandler): void;
  scroll(deltaY?: number): Promise<void>;
  goto(url: string): Promise<void>;
  wait(ms: number): Promise<void>;
  screenshot(path?: string): Promise<Buffer>;
  close(): Promise<void>;
}
