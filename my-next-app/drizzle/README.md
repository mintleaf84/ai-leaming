# drizzle/ 迁移目录约定

**唯一路径：手写 SQL + `drizzle/meta/_journal.json`。**

- 新增表 / 列：写 `NNNN_<描述>.sql`（语句间留 `--> statement-breakpoint`，风格照 0009–0014），
  再在 `_journal.json` 追加 `idx`/`tag`/`when`。启动时 `initDatabase()` 按 journal 执行。
- `meta/*_snapshot.json` 是历史产物，只服务 `drizzle-kit`；它已与迁移漂移
  （9 个快照 vs 15 个迁移），**禁止**据其跑 `drizzle-kit generate` —— 会从旧快照 diff 出重复列。
- 一致性由 `src/lib/db/__tests__/schema-column-parity.test.ts` 守住（迁移建出的库 vs
  `src/lib/db/drizzle-schema.ts` 逐表逐列对拍），不一致时 CI 直接失败。
