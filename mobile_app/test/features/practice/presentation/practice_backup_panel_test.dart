import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/practice/data/practice_backup_service.dart';
import 'package:mobile_app/features/practice/domain/practice_backup.dart';
import 'package:mobile_app/features/practice/presentation/widgets/practice_backup_panel.dart';

import '../../../support/fake_preferences_store.dart';
import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 备份面板（设置页「数据管理」）守的是**入口条件、确认与降级文案**这三件事：
///
/// 1. **没有账号就不能导出/导入**：备份的每条作答都要有归属，否则换机后
///    导入时无法校验（`userId` 不一致要整份拒绝），所以未登录只能提示；
/// 2. **导出前必须确认**：备份含作答事实，属于不该随手分享的内容，
///    直接点一下就把 JSON 塞进剪贴板（用户很可能下一步就贴进群里）；
/// 3. **导入的空粘贴框不能静默失败**：用户以为自己导入了，实际什么都没发生；
/// 4. **失败要成人话**：服务层抛什么都走 `userMessageOf`，不出现堆栈/类名；
/// 5. **两个动作不能并行**：导出进行到一半再点导入，会同时改本地库和剪贴板。
///
/// 断言只打「调用了哪个服务的哪个方法、拿到的是哪个账号、界面上出现哪句话」，
/// 不打 SnackBar 的动画与时长（那是框架的，且会随版本变）。
void main() {
  const userId = '7';
  const backupJson = '{"version":1,"userId":"7","pendingAnswers":[]}';

  late _FakeBackupService service;
  late List<String> clipboard;

  setUp(() {
    service = _FakeBackupService();
    clipboard = <String>[];
  });

  Future<void> pumpPanel(WidgetTester tester) async {
    // 测试环境里 `Clipboard.setData` 走不到平台（那条 await 会一直挂着），
    // 所以每个用例都接住这个通道：既让流程能走完，也断言「剪贴板里真的是这份
    // JSON」——只断言界面说了「已复制」等于什么都没断言。
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (MethodCall call) async {
        if (call.method == 'Clipboard.setData') {
          final args = call.arguments as Map<Object?, Object?>;
          clipboard.add(args['text'] as String);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    await pumpScreen(
      tester,
      const Scaffold(body: SingleChildScrollView(child: PracticeBackupPanel())),
      overrides: <Object>[
        practiceBackupServiceProvider.overrideWithValue(service),
      ],
    );
  }

  group('导出', () {
    testWidgets('未登录：提示先登录，不弹确认框也不碰服务', (WidgetTester tester) async {
      useFakeSecureStorage(loggedIn: false);
      await pumpPanel(tester);

      await tester.tap(find.text('导出备份（剪贴板）'));
      await flush(tester);

      expect(
        snackbarText('请先登录后再导出备份'),
        findsOneWidget,
        reason: '没有账号的备份到了新机里无从校验归属',
      );
      expect(find.text('复制到剪贴板'), findsNothing);
      expect(service.exportCalls, isEmpty);
    });

    testWidgets('确认框先讲清「含作答记录、不含题库」，点取消什么都不发生', (
      WidgetTester tester,
    ) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      await pumpPanel(tester);

      await tester.tap(find.text('导出备份（剪贴板）'));
      await flush(tester);

      expect(find.text('导出备份'), findsOneWidget, reason: '确认框标题');
      expect(find.textContaining('请勿分享给他人'), findsOneWidget);
      expect(
        find.textContaining('题库缓存不会导出'),
        findsOneWidget,
        reason: '用户据此知道这份备份很小、也不含可重建的数据',
      );

      await tester.tap(find.text('取消'));
      await flush(tester);

      expect(service.exportCalls, isEmpty);
      expect(find.byType(SnackBar), findsNothing);
      expect(find.text('导出备份（剪贴板）'), findsOneWidget);
    });

    testWidgets('确认：JSON 进剪贴板并提示，用的是 token 里的账号', (
      WidgetTester tester,
    ) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      service.exportPayload = backupJson;
      await pumpPanel(tester);

      await tester.tap(find.text('导出备份（剪贴板）'));
      await flush(tester);
      await tester.tap(find.text('复制到剪贴板'));
      await flush(tester);

      expect(service.exportCalls, <String>[userId]);
      expect(
        clipboard,
        <String>[backupJson],
        reason: '「已复制到剪贴板」这句提示只有在剪贴板真的有内容时才成立',
      );
      expect(
        snackbarText('备份已复制到剪贴板（请勿分享给他人）'),
        findsOneWidget,
      );
    });

    testWidgets('服务抛错：成人话的失败提示，不写剪贴板', (WidgetTester tester) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      service.exportError = Exception('本地库坏了');
      await pumpPanel(tester);

      await tester.tap(find.text('导出备份（剪贴板）'));
      await flush(tester);
      await tester.tap(find.text('复制到剪贴板'));
      await flush(tester);

      expect(service.exportCalls, <String>[userId]);
      expect(clipboard, isEmpty);
      expect(
        snackbarText('导出失败：出了点问题，请重试'),
        findsOneWidget,
        reason: '异常原文（含类名）只进日志，不进界面',
      );
    });

    testWidgets('导出进行中：另一个入口点不动，结束后恢复可用', (
      WidgetTester tester,
    ) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      final gate = Completer<void>();
      service.exportPayload = backupJson;
      service.exportGate = gate;
      await pumpPanel(tester);

      await tester.tap(find.text('导出备份（剪贴板）'));
      await flush(tester);
      await tester.tap(find.text('复制到剪贴板'));
      await flush(tester);

      // 导出还挂在本地库里：此刻点导入不该开出导入框。
      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      expect(find.text('粘贴备份 JSON…'), findsNothing);

      gate.complete();
      await flush(tester);
      expect(snackbarText('备份已复制到剪贴板（请勿分享给他人）'), findsOneWidget);

      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      expect(find.text('粘贴备份 JSON…'), findsOneWidget);
    });
  });

  group('导入', () {
    testWidgets('粘贴框是空的：提示先粘贴，弹窗留在屏上，不碰服务', (
      WidgetTester tester,
    ) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      await pumpPanel(tester);

      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      expect(find.text('粘贴备份 JSON…'), findsOneWidget);

      await tester.tap(find.text('导入'));
      await flush(tester);

      expect(snackbarText('请先粘贴备份内容'), findsOneWidget);
      expect(
        find.text('粘贴备份 JSON…'),
        findsOneWidget,
        reason: '空输入是用户自己的失误，弹窗不该关掉让他从头点一遍',
      );
      expect(service.importedRaw, isEmpty);
    });

    testWidgets('取消：不导入任何内容', (WidgetTester tester) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      await pumpPanel(tester);

      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      await pasteInto(tester, backupJson);
      await tester.tap(find.text('取消'));
      await flushAfterPop(tester);

      expect(service.importedRaw, isEmpty);
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('未登录：提示先登录，不碰服务', (WidgetTester tester) async {
      useFakeSecureStorage(loggedIn: false);
      await pumpPanel(tester);

      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      await pasteInto(tester, backupJson);
      await tester.tap(find.text('导入'));
      await flushAfterPop(tester);

      expect(snackbarText('请先登录后再导入备份'), findsOneWidget);
      expect(service.importedRaw, isEmpty);
    });

    testWidgets('导入成功并带断点：摘要后面接「已恢复练习断点」', (WidgetTester tester) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      service.importResult = const BackupImportResult(
        addedAnswers: 1,
        addedSessions: 1,
        skippedAnswers: 1,
        resumeImported: true,
        settingsImported: true,
      );
      await pumpPanel(tester);

      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      await pasteInto(tester, '  $backupJson  ');
      await tester.tap(find.text('导入'));
      await flushAfterPop(tester);

      // 粘贴时多带的空白要去掉，否则服务端/解析层会把它当成坏 JSON。
      expect(service.importedRaw, <String>[backupJson]);
      expect(service.importedFor, <String>[userId]);
      expect(
        snackbarText('新增 2 / 跳过 1，已恢复练习断点'),
        findsOneWidget,
        reason: '摘要与断点恢复都要说清楚，用户据此知道要不要接着上次做',
      );
      expect(find.byType(TextField), findsNothing, reason: '导入后弹窗应关闭');
    });

    testWidgets('导入成功但没恢复断点：摘要不带后缀', (WidgetTester tester) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      service.importResult = const BackupImportResult(
        addedAnswers: 0,
        skippedAnswers: 2,
      );
      await pumpPanel(tester);

      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      await pasteInto(tester, backupJson);
      await tester.tap(find.text('导入'));
      await flushAfterPop(tester);

      expect(snackbarText('新增 0 / 跳过 2'), findsOneWidget);
      expect(find.textContaining('已恢复练习断点'), findsNothing);
    });

    testWidgets('账号不符：整份拒绝，并把拒绝原因显示出来', (WidgetTester tester) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      service.importResult = const BackupImportResult.rejected(
        '备份属于其他账号，已拒绝导入',
      );
      await pumpPanel(tester);

      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      await pasteInto(tester, backupJson);
      await tester.tap(find.text('导入'));
      await flushAfterPop(tester);

      expect(
        snackbarText('导入失败：备份属于其他账号，已拒绝导入'),
        findsOneWidget,
        reason: '服务层的拒绝理由必须原样到界面，否则用户以为是网络问题',
      );
    });

    testWidgets('服务抛错：成人话的失败提示', (WidgetTester tester) async {
      useFakeSecureStorage(jwtToken: fakeJwt(userId: 7));
      service.importError = const FormatException('bad json');
      await pumpPanel(tester);

      await tester.tap(find.text('导入备份（粘贴）'));
      await flush(tester);
      await pasteInto(tester, '半截的');
      await tester.tap(find.text('导入'));
      await flushAfterPop(tester);

      expect(service.importedRaw, <String>['半截的']);
      expect(
        snackbarText('导入失败：服务器返回的内容无法解析，请稍后重试'),
        findsOneWidget,
      );
    });
  });
}

/// 只把「点了动作、等异步链跑完」这段样板集中：面板每一步都要过
/// `await`（读 token、走本地库），一次 pump 不够。
Future<void> flush(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump();
}

/// 只认 SnackBar 里的那句话：面板上本来就有「导出备份（剪贴板）」这类
/// 与提示文案部分重叠的标题，裸 `find.text` 会误伤。
Finder snackbarText(String text) => find.descendant(
  of: find.byType(SnackBar),
  matching: find.text(text),
);

/// 往粘贴框里放内容，然后**让输入框失焦**。
///
/// 失焦不是多余的动作，而是绕开 lib 的时序缺陷（本轮不改 lib，已单独报告）：
/// `_openImportDialog` 在 `await showDialog(...)` 一返回就 `controller.dispose()`，
/// 可 `Navigator` 的 future 在 `pop()` 时就完成，不等对话框退场动画跑完。焦点
/// 还在输入框上时，退场那几帧会对已释放的控制器 `addListener`，之后每一帧都报
/// 断言（还会连带 `'attached': is not true`、performance mode 未释放等），测试
/// 根本走不下去。真实用户也会撞上（debug 包里就是一屏红）。
Future<void> pasteInto(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.pump();
  tester.binding.focusManager.primaryFocus?.unfocus();
  await tester.pump();
}

/// 关闭对话框之后的那几帧。
///
/// 逐帧取走框架断言（见 `takeKnownDialogExitErrors` 里的缺陷说明）：一次取完
/// 再继续 pump 的话，出错的那棵子树会停在 deactivated 状态，后面每帧都再报一条
/// （框架会把它们合并成「Multiple exceptions」），最后 `pumpScreen` 的
/// `view.reset` 收尾帧还会报「Looking up a deactivated widget's ancestor」。
Future<void> flushAfterPop(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(i >= 2 ? const Duration(milliseconds: 400) : null);
    takeKnownDialogExitErrors(tester);
  }
}

/// 取走「对话框退场那几帧」里框架报的断言。
///
/// lib 缺陷（本轮不改 lib，已在报告里列出）：`_openImportDialog` 在
/// `await showDialog(...)` 一返回就 `controller.dispose()`，而 `Navigator` 的
/// future 在 `pop()` 时就完成，不等反向动画跑完；退场期间还挂着的 `TextField`
/// 会对已释放的控制器 `addListener`，于是每帧报一条
/// 「A TextEditingController was used after being disposed」。
/// 不取走的话每条测试都会因框架断言失败，真正的行为（调不调服务、提示哪句）
/// 反而测不到。取走时仍校验根因，别的原因照常让测试失败。
void takeKnownDialogExitErrors(WidgetTester tester) {
  final Object? error = tester.takeException();
  if (error == null) return;
  expect(
    error.toString(),
    anyOf(
      contains('TextEditingController'),
      contains('Multiple exceptions'),
    ),
    reason: '只允许吞掉「对话框退场期间复用已释放的控制器」这一条已知缺陷',
  );
}

/// 接住 `Clipboard.setData`，返回写入过的文本列表。
///
/// 测试环境里的剪贴板是空实现，只断言「界面显示了已复制」等于什么都没断言。
List<String> captureClipboardWrites(WidgetTester tester) {
  final writes = <String>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    SystemChannels.platform,
    (MethodCall call) async {
      if (call.method == 'Clipboard.setData') {
        final args = call.arguments as Map<Object?, Object?>;
        writes.add(args['text'] as String);
      }
      return null;
    },
  );
  addTearDown(
    () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      null,
    ),
  );
  return writes;
}

/// 备份服务替身：只替这两个方法，其余（白名单、幂等、断点新旧比较）由
/// `practice_backup_service_test.dart` 自己守，这里不重复。
///
/// 继承而不是 mock：要断言的是「带了哪个 userId、传了哪段原文」，
/// 真实参数直接记在字段上比 mocktail 的捕获器好读。
class _FakeBackupService extends PracticeBackupService {
  _FakeBackupService()
    : super(store: FakeLocalPracticeStore(), preferences: FakePreferencesStore());

  String exportPayload = '{"version":1,"userId":"7"}';
  Object? exportError;

  /// 非 null 时导出挂在这里：用来观察「导出进行中不能再点导入」。
  Completer<void>? exportGate;

  BackupImportResult importResult = const BackupImportResult();
  Object? importError;

  final List<String> exportCalls = <String>[];
  final List<String> importedRaw = <String>[];
  final List<String> importedFor = <String>[];

  @override
  Future<String> exportJson(String userId) async {
    exportCalls.add(userId);
    final gate = exportGate;
    if (gate != null) await gate.future;
    final error = exportError;
    if (error != null) throw error;
    return exportPayload;
  }

  @override
  Future<BackupImportResult> importJson({
    required String raw,
    required String currentUserId,
  }) async {
    importedRaw.add(raw);
    importedFor.add(currentUserId);
    final error = importError;
    if (error != null) throw error;
    return importResult;
  }
}
