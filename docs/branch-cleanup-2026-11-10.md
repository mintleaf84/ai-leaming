# 分支清理记录（2026-11-10）

清理前远端 **57** 个分支；清理执行完后 **6** 个（`main` + 2 个在途 PR 分支 + 3 个 Dependabot 分支，明细见第四节）。

> 取回归档标签需要显式拉取：`git fetch --tags`（普通 `git fetch` 默认只跟随已获取历史关联的标签，指向已删除分支的标签可能不会被自动拉取）。

## 一、直接删除（内容已在 main）

32 个分支已并入 `main`（`git branch -r --merged origin/main`），确认无独有提交后删除。

另有 3 个是 **squash 合并**后的残留（squash 不记录祖先关系，故看起来"未合并"，实际内容已进 main）：

| 分支                  | 对应 PR                 |
| --------------------- | ----------------------- |
| `repo-governance`     | #98                     |
| `lab-fsrs-archive`    | #97                     |
| `fenbi-userscript-v6` | #99（合并时已自动删除） |

## 二、打标签后删除（有独有提交）

这 5 个分支含未合并提交，且长期无 PR（2026-04 ~ 2026-07）。为保留历史又不占用分支列表，先打 `archive/2026-11-10/*` 标签，再删除分支：

| 原分支                                                  | 归档标签                                                  | 末次提交             |
| ------------------------------------------------------- | --------------------------------------------------------- | -------------------- |
| `260518-feat-admin-fill-blank-support`                  | `archive/2026-11-10/260518-feat-admin-fill-blank-support` | 2026-05-19 `e1ce5aa` |
| `feat/concurrency`                                      | `archive/2026-11-10/feat-concurrency`                     | 2026-07-20 `084a595` |
| `feat/db-refactor`                                      | `archive/2026-11-10/feat/db-refactor`                     | 2026-04-29 `ef9227f` |
| `fix/mobile-nav-overlap`                                | `archive/2026-11-10/fix-mobile-nav-overlap`               | 2026-07-20 `825689b` |
| `revert-5-copilot/optimize-web-application-performance` | 同名标签                                                  | 2026-04-19 `c1ad007` |

需要时 `git fetch --tags && git checkout archive/2026-11-10/<name>` 即可取回。

## 三、关闭的 Dependabot PR（9 个）

滞后 1–4 个月，且与本轮已在 main 落地的同类升级（hono / vite / undici / follow-redirects / zod）冲突。

关闭：#51、#52、#66、#75、#78、#80、#81、#82、#88。

**注意**：Dependabot **不保证**为已关闭的旧 PR 重建同版本 PR（其 `open-pull-requests-limit` 与巡检节奏都会影响）。这些升级若仍需落地，请在巡检后确认，必要时手动执行 `npm install <pkg>@<ver>` 并开 PR，不要假定会自动出现。

另：#74（粉笔导入错误被吞）功能已并入 #106，关闭并删除分支。

## 四、保留的分支（清理后共 6 个）

| 分支                                                  | 原因                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `main`                                                | —                                                          |
| `feat/zod-4`                                          | 开放 PR #108（zod 3 → 4）                                  |
| `chore/branch-cleanup`                                | 开放 PR #109（本记录）                                     |
| `dependabot/npm_and_yarn/my-next-app/next-16.4.6`     | 开放 PR #105（含 6 条 security advisory 修复，需单独评估） |
| `dependabot/npm_and_yarn/my-next-app/zod-4.6.6`       | 开放 PR #104（待 #108 合并后关闭）                         |
| `dependabot/npm_and_yarn/my-next-app/fast-copy-4.1.2` | 开放 PR #91                                                |

> `feat/fenbi-import-idempotency`（#106）与 `dependabot/.../follow-redirects-1.16.3`（#107）在清理当日合并，分支已随之删除。

## 五、遗留问题（后续单独处理）

- 默认分支仍有 **85 个 Dependabot 告警（7 critical / 30 high）**，主要来自 `next` 与 `@langchain/*` 依赖树；`next 16.2.9 → 16.4.6`（#105）为其中优先级最高的一项；
- `260830-fix-fenbi-import-error` 分支的"错误透出"修复已并入 PR #106，无需单独合并。
