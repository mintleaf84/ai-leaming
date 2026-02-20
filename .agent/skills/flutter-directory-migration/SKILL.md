---
name: flutter-directory-migration
description: Flutter 项目目录结构迁移的最佳实践与常见陷阱。在需要重构 Flutter/Dart 项目目录结构（如从层级优先改为功能优先）时使用。适用于：(1) 大规模文件移动与 import 路径修正，(2) 处理 Freezed/Retrofit/json_serializable 生成文件的迁移，(3) 避免 PowerShell 编码陷阱和 build_runner 已知 bug。
---

# Flutter 目录迁移指南

## 文件移动：使用 `git mv`

用 `git mv` 移动文件（二进制安全，保留编码，保留 git 历史）：

```powershell
New-Item -ItemType Directory -Path "lib/features/auth/data" -Force
git mv lib/data/repositories/auth_repository_impl.dart lib/features/auth/data/
```

## Import 路径批量修正：避免 PowerShell 编码陷阱

> [!CAUTION]
> PowerShell 的 `Set-Content` 默认用 UTF-16LE 编码写入，会损坏含中文的 `.dart` 文件。
> 必须使用 `.NET API` 显式指定 UTF-8 无 BOM。

```powershell
# ❌ 错误 — Set-Content 默认 UTF-16LE，中文字符会乱码
(Get-Content $f -Raw) -replace "old", "new" | Set-Content $f -NoNewline

# ✅ 正确 — 显式 UTF-8 无 BOM
$utf8 = [System.Text.UTF8Encoding]::new($false)
$content = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$content = $content -replace "import '../../old/path.dart';", "import '../new/path.dart';"
[System.IO.File]::WriteAllText($f, $content, $utf8)
```

## 生成文件（`.g.dart` / `.freezed.dart`）

这些文件通过 `part of 'xxx.dart'` 关联到源文件，内部不含 import。
直接 `git mv` 即可，移动后 `part of` 仍然有效（只引用文件名，不含路径）。

## build_runner 递归 Bug

`build_runner` 2.10.x ~ 2.11.x 存在 `LibraryCycleGraphLoader` 递归死锁：

```
Bad state: Cannot recurse at later or equal phase 2, already running at: [2]
```

**触发条件**：`test/widget_test.dart` → `main.dart` → `app_router.dart` → 大量 Freezed 文件，形成深度依赖链。

**解决**：删除 `test/widget_test.dart`（`flutter create` 生成的无用模板）。

## 迁移检查清单

1. `grep_search` 扫描 `import '../` 确认需修改的文件清单
2. 编写 `.ps1` 脚本用 `git mv` 批量移动 + 创建目录 + 清理空目录
3. 编写 `.ps1` 脚本用 `[System.IO.File]` API 批量 `-replace` import（UTF-8 安全）
4. `flutter analyze 2>&1 | Select-String "error"` 验证零错误
5. 如需 `build_runner`，先删 `test/widget_test.dart`
