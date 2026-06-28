/** PostgreSQL 连接池；未设置 DATABASE_URL 时 isDatabaseEnabled() 为 false，走 JSON 落盘。 */
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function isDatabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): pg.Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL 未配置");
  }

  if (!pool) {
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function resetPoolForTests(): void {
  pool = null;
}
