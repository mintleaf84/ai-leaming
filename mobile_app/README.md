# mobile_app

AI 教招刷题系统的 Flutter 客户端（Android 为主）。与 Next.js 后端共用一套 HTTP 契约，**不共享任何 UI 代码**——复用边界、阶段计划、取舍记录见仓库根目录 [`docs/flutter-mobile-plan.md`](../docs/flutter-mobile-plan.md)。

## 技术栈

| 层       | 选型                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| 状态管理 | Riverpod 3（`Notifier` / `AsyncNotifier` / `NotifierProvider`）+ flutter_hooks                            |
| 路由     | go_router（`lib/app_router.dart` 集中声明）                                                               |
| 网络     | dio + retrofit（`lib/shared/datasources/api_client.dart`）                                                |
| 模型     | freezed 3 + json_serializable                                                                             |
| 本地存储 | sqflite（离线题库与待同步作答）+ flutter_secure_storage（JWT）                                            |
| 目录结构 | feature-first：`lib/features/<feature>/{domain,data,presentation}`，跨模块单例放 `lib/shared`、`lib/core` |

## 本地运行

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run --dart-define=API_BASE_URL=http://<你的后端>:3000/api
```

`API_BASE_URL` 没有默认值（见 `lib/core/constants/api_constants.dart`）。地址按三级回落：
**运行时设置**（App 内「设置 → 服务器地址」，存 flutter_secure_storage）> **编译期 `--dart-define`** >
都没有则启动后进入「需要配置服务器地址」页，不发任何请求。真机首次运行建议直接在 App 内填写；
`127.0.0.1` 在手机上指向手机自己，Android 模拟器访问宿主机用 `10.0.2.2`。

## 离线刷题

- 题目在每次成功拉取后写入本地 `cached_questions`（`local_practice_store.dart`）。
- 连不上服务器（`DioException.response == null`）时才降级为本地出题，得到 `local_*` 会话；服务端 4xx/5xx 仍然原样抛错，不掩盖问题。
- 离线作答本地判分（多选按集合比较，忽略顺序），写入 `pending_answers` 队列。
- 恢复网络或启动 App 时，`SyncService.flush()` 逐会话补交 `POST /practice/offline-answers`，
  `sessionKey = localId` 保证幂等；401 立即中止整批。
- 练习页顶部会显示「离线模式」提示条；设置页可查看待同步条数并手动同步。

## 导航与转场（新增页面/入口必读）

路径常量与跳转都收敛在 `lib/core/navigation/app_nav.dart`，页面里**不要再直接调**
`context.go` / `context.push` / `context.pop`（`test/navigation_rules_test.dart` 会让 CI 红）。

| 意图 | 用法 | 语义 |
| --- | --- | --- |
| 进入下一层（详情、流程） | `context.pushDetail(AppRoutes.textbookDetail(id))` | 有返回栈；系统返回键 / `backOrHome()` 都能回 |
| 替换当前位置 | `context.replace(AppRoutes.dashboard)` | 登录成功、练习结束去结果页、退出登录；不留返回栈 |
| 返回 | `context.backOrHome()` | 有上一层就 pop；没有就回首页，**不会"点了没反应"** |
| 返回后刷新 | `context.pushDetail(route, onReturn: () => ref.invalidate(...))` | push 之后列表页仍挂载，`initState` 不会重跑，必须显式刷新 |

背景：此前 41 处 `context.go`、0 处 `push`，导致详情页没有返回栈、`context.pop()` 无页可 pop
（release 下按钮点了没反应）。转场风格在 `ThemeData.pageTransitionsTheme` 里显式写死
（Android `FadeForwards`、iOS/macOS Cupertino），不依赖 SDK 默认值。

## 测试

```bash
flutter test                       # 纯逻辑测试（默认跳过打真网的用例）
flutter test --run-skipped -t integration   # 需要本地后端在 127.0.0.1:3000
```

带 `@Tags(['integration'])` 的用例会真实登录并请求后端，见 `dart_test.yaml`。

## CI

`.github/workflows/android.yml`：

- **PR 阶段**：`flutter analyze`（warning 即失败）+ `flutter test`，任何 `mobile_app/**` 改动都会触发；
- **手动或打 tag**：构建 release APK 并上传 artifact；仓库变量 `API_BASE_URL` 未配置时只告警（产物不带内置地址，
  首次启动在 App 内填写服务器地址即可）。

签名：`android/key.properties` 存在时用 release 签名，否则回落 debug 签名；`key.properties` 与 `*.jks` 不入库。
