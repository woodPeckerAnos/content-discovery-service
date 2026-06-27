#!/usr/bin/env node
import { startServer } from "./server/index.js";

startServer().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
