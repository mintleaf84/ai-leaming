# 分支清理记录（2026-11-10）

清理前远端 **57** 个分支，清理后 **8** 个（其中 5 个为 Dependabot 待合并 PR）。

## 一、直接删除（内容已在 main）

32 个分支已并入 `main`（`git branch -r --merged origin/main`），确认无独有提交后删除。

另有 3 个是 **squash 合并**后的残留（squash 不记录祖先关系，故看起来"未合并"，实际内容已进 main）：

| 分支 | 对应 PR |
| --- | --- |
| `repo-governance` | #98 |
| `lab-fsrs-archive` | #97 |
| `fenbi-userscript-v6` | #99（合并时已自动删除） |

## 二、打标签后删除（有独有提交）

这 5 个分支含未合并提交，且长期无 PR（2026-04 ~ 2026-07）。为保留历史又不占用分支列表，先打 `archive/2026-11-10/*` 标签，再删除分支：

| 原分支 | 归档标签 | 末次提交 |
| --- | --- | --- |
| `260518-feat-admin-fill-blank-support` | `archive/2026-11-10/260518-feat-admin-fill-blank-support` | 2026-05-19 `e1ce5aa` |
| `feat/concurrency` | `archive/2026-11-10/feat-concurrency` | 2026-07-20 `084a595` |
| `feat/db-refactor` | `archive/2026-11-10/feat-db-refactor` | 2026-04-29 `ef9227f` |
| `fix/mobile-nav-overlap` | `archive/2026-11-10/fix-mobile-nav-overlap` | 2026-07-20 `825689b` |
| `revert-5-copilot/optimize-web-application-performance` | 同名标签 | 2026-04-19 `c1ad007` |

需要时 `git checkout archive/2026-11-10/<name>` 即可取回。

## 三、关闭的 Dependabot PR（9 个）

滞后 1–4 个月、与当前 main 冲突，且本轮已在 main 落地同类升级（hono / vite / undici / follow-redirects / zod）。Dependabot 会在下次巡检时基于当前 main 重新生成干净 PR。

关闭：#51、#52、#66、#75、#78、#80、#81、#82、#88。

另有 #74（粉笔导入错误被吞）功能已被 #106 包含，关闭并删除分支。

## 四、保留的分支

| 分支 | 原因 |
| --- | --- |
| `main` | — |
| `feat/fenbi-import-idempotency` | 开放 PR #106 |
| `feat/zod-4` | 开放 PR #108 |
| `dependabot/.../next-16.4.6` | 开放 PR #105（含 6 个 security advisory 修复，需单独评估） |
| `dependabot/.../zod-4.6.6` | 开放 PR #104（待 #108 合并后关闭） |
| `dependabot/.../follow-redirects-1.16.3` | 开放 PR #107（新开，待合并） |
| `dependabot/.../fast-copy-4.1.2` | 开放 PR #91 |

## 五、遗留问题（后续单独处理）

- 默认分支仍有 **85 个 Dependabot 告警（7 critical / 30 high）**，主要来自 `next` 与 `@langchain/*` 依赖树；需要在 #105 之外单独排期；
- `260830-fix-fenbi-import-error` 分支的"错误透出"修复已并入 PR #106，无需单独合并。
