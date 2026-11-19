# 移动端图标替换例外清单（M-09 / D-3）

> 依据：`docs/mobile-ui-kit.md` D-3（129 处 `Icons.*` 全量换成 Material Symbols）。
> 语义层：`mobile_app/lib/core/theme/app_icons.dart`（62 个常量，页面里禁止直接写 `Symbols.xxx`）。
> 生成方式：脚本按「原来实心 → Symbols `_filled`（无 filled 变体则退回 outlined）；原来 `_outlined` → Symbols outlined 基名」逐条映射，
> 再用 `material_symbols_icons 4.2960.0` 的 `symbols.dart` 逐个核对名字存在性（63 个唯一图标名里 62 个命中）。

## 1. 真正的例外（保留 Material Icons / 存在视觉差异）

| Material Icons              | 处理                        | 原因                                                                                         |
| --------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `Icons.apple`               | 保留，收进 `AppIcons.apple` | Material Symbols **没有品牌图标**（Apple 登录按钮专用）。这是全仓唯一仍指向 `Icons` 的常量。 |
| `Icons.info_outline`        | → `Symbols.info`            | Symbols 没有 `info_outline` 变体，只有实心 `info`（圆圈内的 i 由描边变实底）。               |
| `Icons.play_circle_outline` | → `Symbols.play_circle`     | 同上，只有实心 `play_circle`。                                                               |

以上三处是**观感会变**的地方，验收时重点看：登录页 Apple 按钮、设置页/帮助类的 info 提示、练习页的播放圆形按钮。

## 2. 变体选择规则（不是例外，但影响观感）

- 原 `Icons.x`（实心）→ `Symbols.x_filled`（该图标有 filled 变体时），否则 `Symbols.x`。
  例：`Icons.check_circle` → `Symbols.check_circle_filled`；`Icons.person` → `Symbols.person_filled`；
  `Icons.access_time` → `Symbols.access_time_filled`。
- 原 `Icons.x_outlined` → `Symbols.x`（Symbols 的基名就是 outlined，与 Material Icons 的 `_outlined` 后缀同名不同义，**不要**写成 `x_outlined`）。
  例：`Icons.settings_outlined` → `Symbols.settings`。
- 箭头类（`arrow_back` / `chevron_right` / `expand_more` …）Solid 与 Outlined 差异极小，统一取基名。

## 3. 替换统计（2026-11-19 实测）

| 指标                         | 数值                                                   |
| ---------------------------- | ------------------------------------------------------ |
| 替换前 `Icons.*` 出现次数    | 129                                                    |
| 替换前唯一图标名             | 63（含 `apple`）                                       |
| 替换后页面代码里裸 `Icons.*` | **0**                                                  |
| `AppIcons.*` 使用点          | 129 处，覆盖 63 个语义名                               |
| 涉及文件                     | 20 个（`lib/features/**` 18 + `lib/shared/widgets` 2） |

复核命令：

```bash
cd mobile_app
grep -rnoE "(^|[^A-Za-z_])Icons\.[a-zA-Z0-9_]+" lib --include=*.dart | grep -v core/theme/app_icons.dart   # 期望 0 行
grep -rho "AppIcons\.[a-zA-Z0-9_]*" lib --include=*.dart | sort -u | wc -l                                 # 期望 63（含私有构造 AppIcons._）
```

## 4. 未做的事

- 没有做"图标轴（weight/fill/grade）调参"——统一使用包默认值，避免每屏各自调参导致粗细漂移。
- APK 体积增量尚未实测（需要手动触发 `Android` workflow 的 `apk` job 对比 `main` 的 release 包），见 `docs/mobile-ui-kit.md` M-11。
