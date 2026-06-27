import fs from "node:fs/promises";
import path from "node:path";
import type { SearchResultPayload } from "../types/content.js";
import type { SearchRequest } from "../types/search.js";
import { isDatabaseEnabled } from "../db/pool.js";
import { loadConfig } from "../config.js";
import { writeSearchRun } from "./db-result-store.js";

function slugify(text: string): string {
  return text.replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/^-|-$/g, "") || "search";
}

export class ResultStore {
  async write(
    req: SearchRequest,
    payload: Omit<SearchResultPayload, "request">,
  ): Promise<string> {
    if (isDatabaseEnabled()) {
      return writeSearchRun(req, payload);
    }

    const config = loadConfig();
    await fs.mkdir(config.resultsPath, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const keywordPart =
      req.mode === "keyword" && req.keyword ? slugify(req.keyword) : req.mode;
    const filename = `${date}-${req.platform}-${keywordPart}.json`;
    const filePath = path.join(config.resultsPath, filename);

    const fullPayload: SearchResultPayload = {
      request: req,
      ...payload,
    };

    await fs.writeFile(filePath, JSON.stringify(fullPayload, null, 2), "utf-8");
    return filePath;
  }
}

export const resultStore = new ResultStore();
