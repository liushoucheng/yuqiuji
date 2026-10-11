// Node 服务器使用自带 SQLite，接口保持与 Worker 的 D1 一致。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function openDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA busy_timeout = 5000');
  if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'groups'").get()) sqlite.exec(readFileSync(new URL('../drizzle/0000_court.sql', import.meta.url), 'utf8'));
  const wrap = (sql, values = []) => ({
    bind: (...args) => wrap(sql, args),
    first: async () => sqlite.prepare(sql).get(...values) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    _run: () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } })
  });
  return {
    prepare: sql => wrap(sql),
    batch: async statements => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(statement => statement._run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close: () => sqlite.close()
  };
}
