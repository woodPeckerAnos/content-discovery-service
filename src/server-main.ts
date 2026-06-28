#!/usr/bin/env node
/** npm run server 进程入口。 */
import { startServer } from "./server/index.js";

startServer().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
