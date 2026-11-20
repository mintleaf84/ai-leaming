# 移动端图标替换例外清单（M-09 / D-3）

> 依据：`docs/mobile-ui-kit.md` D-3（129 处 `Icons.*` 全量换成 Material Symbols）。
> 语义层：`mobile_app/lib/core/theme/app_icons.dart`（62 个常量，页面里禁止直接写 `Symbols.xxx`）。
> 生成方式：脚本按「原来实心 → Symbols `_filled`（无 filled 变体则退回 outlined）；原来 `_outlined` → Symbols outlined 基名」逐条映射，
> 再用 `material_symbols_icons 4.2960.0` 的 `symbols.dart` 逐个核对名字存在性（63 个唯一图标名里 62 个命中）。

## 1. 真正的例外（保留 Material Icons / 存在视觉差异）

| Material Icons              | 处理                                | 原因                                                                                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Icons.apple`               | 保留，收进 `AppIcons.apple`         | Material Symbols **没有品牌图标**（Apple 登录按钮专用）。这是全仓唯一仍指向 `Icons` 的常量。                                                                                                                                                                                           |
| `Icons.info_outline`        | → `Symbols.info`                    | Symbols 没有 `info_outline` 变体，只有实心 `info`（圆圈内的 i 由描边变实底）。                                                                                                                                                                                                         |
| `Icons.play_circle_outline` | → `Symbols.play_circle`             | 同上，只有实心 `play_circle`。                                                                                                                                                                                                                                                         |
| `Icons.circle`              | 保留，收进 `AppIcons.dot`           | 单选题「已选中」标记：10sp 白色叠在 20×20 深色圆底上。`Symbols.circle` 是**空心环**，实测墨量只有原图标 36%，10sp 下等于看不见（用户实测反馈「图标没了」）；Symbols 里没有尺寸对得上的实心圆点（`fiber_manual_record` 直径太小）。                                                     |
| `Icons.cancel`（实心叉）    | 保留，收进 `AppIcons.cancelSolid`   | Material Symbols 的 `cancel` 只有"空心圆 + 斜杠"一种形态，**没有实心变体**（不存在 `cancel_filled`）。同屏并排的 `check_circle_filled`（答对）是实心，判错若用 `Symbols.cancel` 就是一实一空像两个族（审计 #12）。判错标记改用实心版，空心 `AppIcons.cancel` 仍留给"关闭/清除"类语义。 |
| `Icons.check_box`（实心框） | 保留，收进 `AppIcons.checkBoxSolid` | Material Symbols 的 `check_box` 只有描边方块，没有 filled 变体，与同一行的 `check_box_outline_blank` 肉眼几乎分不出来（点没点上分不清）。错题本「全选」的已选中态改用实心版（审计 #12）。                                                                                              |

以上五处是**观感会变**的地方，验收时重点看：登录页 Apple 按钮、设置页/帮助类的 info 提示、练习页的播放圆形按钮、练习详情判对/判错那一行、错题本底部"全选"勾选前后。

## 2. 变体选择规则（不是例外，但影响观感）

- 原 `Icons.x`（实心）→ `Symbols.x_filled`（该图标有 filled 变体时），否则 `Symbols.x`。
  例：`Icons.check_circle` → `Symbols.check_circle_filled`；`Icons.person` → `Symbols.person_filled`；
  `Icons.access_time` → `Symbols.access_time_filled`。
- 原 `Icons.x_outlined` → `Symbols.x`（Symbols 的基名就是 outlined，与 Material Icons 的 `_outlined` 后缀同名不同义，**不要**写成 `x_outlined`）。
  例：`Icons.settings_outlined` → `Symbols.settings`。
- 箭头类（`arrow_back` / `chevron_right` / `expand_more` …）Solid 与 Outlined 差异极小，统一取基名。

## 3. 替换统计（2026-11-19 实测）

| 指标                         | 数值                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| 替换前 `Icons.*` 出现次数    | 129                                                                                                   |
| 替换前唯一图标名             | 63（含 `apple`）                                                                                      |
| 替换后页面代码里裸 `Icons.*` | **0**（`AppIcons` 内部另有 4 个 Material Icons 常量：`apple`、`dot`、`cancelSolid`、`checkBoxSolid`） |
| `AppIcons.*` 使用点          | 145 处（2026-11-20 实测），覆盖 65 个语义名（新增 `cancelSolid` / `checkBoxSolid`）                   |
| 涉及文件                     | 20 个（`lib/features/**` 18 + `lib/shared/widgets` 2）                                                |

复核命令：

```bash
cd mobile_app
grep -rnoE "(^|[^A-Za-z_])Icons\.[a-zA-Z0-9_]+" lib --include=*.dart | grep -v core/theme/app_icons.dart   # 期望 0 行
grep -rho "AppIcons\.[a-zA-Z0-9_]*" lib --include=*.dart | sort -u | wc -l                                 # 期望 66（65 个语义名 + 私有构造 AppIcons._）
```

## 4. 未做的事

- 没有做"图标轴（weight/fill/grade）调参"——统一使用包默认值，避免每屏各自调参导致粗细漂移。
- APK 体积增量尚未实测（需要手动触发 `Android` workflow 的 `apk` job 对比 `main` 的 release 包），见 `docs/mobile-ui-kit.md` M-11。

## 5. 2026-11-20：可变字体在 release 包里整族不渲染（真机事故）

**现象**：用户装 release APK 后，导航栏「教材」、设置里「深色模式」「反馈建议」以及大片其它图标**完全空白**；
文字正常，同一页里 Material Icons 的（`apple`、单选圆点 `dot`、`cancelSolid`、`checkBoxSolid`）正常。

**定位过程与证据**：

| 检查 | 结果 |
| --- | --- |
| APK 内 `FontManifest` | `packages/material_symbols_icons/MaterialSymbolsOutlined` 正确注册 |
| 该字体的 cmap | 61 个在用码点全在，`glyf` 轮廓也都不为空（所以第一轮排查误判为"字体没问题"） |
| **该字体的 `gvar` 表** | **96 个字形里 72 个解析抛 `IndexError: sharedTuples index out of range`** |
| 上游未裁剪的同一字体 | 40/40 解析正常 |

**根因**：Flutter 3.38.4 的 `--tree-shake-icons` 用 font-subset 裁剪**可变字体**时破坏了 `gvar`
（变体增量表），产出的是坏字体；设备端整族加载/解析失败 → 全部不渲染。
`flutter analyze` / `flutter test` 发现不了：测试环境用 Ahem 把所有图标画成方块，且静态检查不读 `gvar`。

**修复**：不再依赖 `material_symbols_icons` 的可变字体。

- 用 fontTools 把用到的 61 个图标**实例化成静态字体**：`mobile_app/assets/fonts/AppSymbols.ttf`
  （57 个唯一码点、9,384 B、**无 gvar/fvar**），在 `pubspec.yaml` 注册 family `AppSymbols`。
- `AppIcons` 改为 `IconData(0xXXXX, fontFamily: 'AppSymbols')`，**码点沿用上游原值**便于对照；
  129 处调用点一行未改。
- 移除 `material_symbols_icons` 依赖。
- 新增 `test/core/theme/app_icons_test.dart`：显式加载字体、数像素，三个"报过空白"的图标
  必须画出 >50 个暗像素，且不同图标不能画出同一形状（防豆腐块）。

**给后来者的教训**：图标类改动不能只靠 analyze/test；凡是引入**可变字体**（含 Material Symbols、
可变图标包）都要在真机 release 包里验证，或者干脆用静态实例化字体。
