import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/core/network/dio_client.dart';
import 'package:mobile_app/features/profile/presentation/profile_provider.dart';
import 'package:mobile_app/features/profile/presentation/profile_screen.dart';

import '../../support/fake_providers.dart';
import '../../support/fakes_misc.dart';
import '../../support/pump_router.dart';
import '../../support/pump_screen.dart';
import '../../support/recording_adapter.dart';

/// 个人中心屏：三块内容（头像卡 / 统计网格 / 快捷导航）与三种状态。
///
/// 这里守的是**状态之间不互相冒充**与**数字就是接口给的数字**：
/// - 加载中 ≠ 空态：空态在个人中心是一整页空白，用户分不清「没登录」还是「坏了」；
/// - 失败给可读文案 + 可点的重试，不把异常原文上屏；
/// - 从快捷导航返回后要自动刷新统计（新建的知识卡片不会自己通知 profile）。
///
/// 路由用 `pump_router.dart`（自建路由表 + 落地桩），不用生产路由：生产路由会
/// 把目标页的真实控制器也拉起来，那测的是别的模块。
void main() {
  setUpAll(useFakeSecureStorage);

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  /// 转场走完（Material 的 push/pop 约 300ms），被压住的页面才真的离开树。
  Future<void> settleTransition(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
  }

  Map<String, dynamic> profileJson({
    String username = 'teacher84',
    String role = 'student',
    // 不带 Z：`DateTime.parse` 按本地时区解析，屏上的「加入于」才与时区无关。
    String createdAt = '2026-03-05T12:00:00',
    int totalSessions = 12,
    int totalAnswered = 240,
    int totalCorrect = 190,
    double overallAccuracy = 0.79,
    int knowledgeCardCount = 33,
    int wrongBookCount = 8,
  }) {
    return <String, dynamic>{
      'id': 1,
      'username': username,
      'role': role,
      'createdAt': createdAt,
      'stats': <String, dynamic>{
        'totalSessions': totalSessions,
        'totalAnswered': totalAnswered,
        'totalCorrect': totalCorrect,
        'overallAccuracy': overallAccuracy,
        'knowledgeCardCount': knowledgeCardCount,
        'wrongBookCount': wrongBookCount,
      },
    };
  }

  /// 被测屏 + 快捷导航全部落点的桩路由（断言导航结果，不测目标页内容）。
  Map<String, WidgetBuilder> routes() {
    return <String, WidgetBuilder>{
      AppRoutes.dashboard: (_) => routeStub(AppRoutes.dashboard),
      AppRoutes.profile: (_) => const ProfileScreen(),
      AppRoutes.history: (_) => routeStub(AppRoutes.history),
      AppRoutes.wrongBook: (_) => routeStub(AppRoutes.wrongBook),
      AppRoutes.knowledge: (_) => routeStub(AppRoutes.knowledge),
      AppRoutes.mastery: (_) => routeStub(AppRoutes.mastery),
      AppRoutes.textbooks: (_) => routeStub(AppRoutes.textbooks),
      AppRoutes.chat: (_) => routeStub(AppRoutes.chat),
      AppRoutes.pricing: (_) => routeStub(AppRoutes.pricing),
      AppRoutes.settings: (_) => routeStub(AppRoutes.settings),
    };
  }

  Future<GoRouter> pumpProfile(
    WidgetTester tester, {
    RecordingAdapter? adapter,
    List<Object> overrides = const <Object>[],
    String initialLocation = AppRoutes.profile,
  }) {
    final all = <Object>[
      if (adapter != null) dioProvider.overrideWithValue(fakeDio(adapter)),
      ...overrides,
    ];
    return pumpRouter(
      tester,
      initialLocation: initialLocation,
      routes: routes(),
      overrides: all,
    );
  }

  testWidgets('数据态：头像卡、统计网格、快捷导航都渲染，数字来自接口', (
    tester,
  ) async {
    final adapter = RecordingAdapter(responseBody: profileJson());

    await pumpProfile(tester, adapter: adapter);
    await settle(tester);

    expect(adapter.requests.single.path, '/profile');
    expectNoLayoutError(tester, reason: '375×667 下不应溢出');

    // 头像卡：用户名 + 角色标签 + 注册日期
    expect(find.text('个人中心'), findsOneWidget);
    expect(find.text('teacher84'), findsOneWidget);
    expect(find.text('学生'), findsOneWidget);
    expect(find.text('加入于 2026年3月5日'), findsOneWidget);

    // 统计网格：四个格子，正确率保留一位小数并带「对/总」副标题
    expect(find.text('学习数据'), findsOneWidget);
    expect(find.text('总会话数'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);
    expect(find.text('次练习'), findsOneWidget);
    expect(find.text('综合正确率'), findsOneWidget);
    expect(find.text('79.0%'), findsOneWidget);
    expect(find.text('190/240 题'), findsOneWidget);
    expect(find.text('待攻克错题'), findsOneWidget);
    expect(find.text('8'), findsOneWidget);

    // 快捷导航：八个入口都在（「知识卡片」同时是统计标题，故 ≥2）
    expect(find.text('快捷导航'), findsOneWidget);
    for (final label in <String>[
      '练习历史',
      '错题本',
      '掌握度',
      '教材库',
      'AI 助手',
      '订阅套餐',
      '设置',
    ]) {
      expect(find.text(label), findsOneWidget, reason: '缺少入口：$label');
    }
    expect(find.text('知识卡片'), findsAtLeastNWidgets(2));
    // 末项不画分隔线：分隔线数量 = 入口数 - 1
    expect(find.byType(Divider), findsNWidgets(7), reason: '末项不该带分隔线');
  });

  testWidgets('管理员角色 + 解析不了的注册日期：标签换文案，日期原样兜底', (
    tester,
  ) async {
    final adapter = RecordingAdapter(
      responseBody: profileJson(role: 'admin', createdAt: '未知'),
    );

    await pumpProfile(tester, adapter: adapter);
    await settle(tester);

    expect(find.text('管理员'), findsOneWidget);
    expect(find.text('学生'), findsNothing);
    expect(
      find.text('加入于 未知'),
      findsOneWidget,
      reason: '日期解析不了不该让整页崩掉',
    );
  });

  testWidgets('加载中：进度指示，不闪出空白页也不闪出旧数据', (tester) async {
    final adapter = RecordingAdapter();
    final gate = Completer<ResponseBody>();
    adapter.handler = (options) => gate.future;

    await pumpProfile(tester, adapter: adapter);
    await settle(tester);

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('teacher84'), findsNothing);
    expect(find.text('加载失败'), findsNothing);

    gate.complete(jsonBody(profileJson()));
    await settle(tester);

    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('teacher84'), findsOneWidget);
  });

  testWidgets('失败：可读文案 + 重试；点重试真的再发一次并出内容', (
    tester,
  ) async {
    final adapter = RecordingAdapter();
    var attempts = 0;
    adapter.handler = (options) {
      attempts++;
      if (attempts == 1) {
        return jsonBody(<String, dynamic>{'message': 'boom'}, statusCode: 500);
      }
      return jsonBody(profileJson(username: 'after-retry'));
    };

    await pumpProfile(tester, adapter: adapter);
    await settle(tester);

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('服务器出了点问题（500），请稍后重试'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(adapter.requests, hasLength(1));

    await tester.tap(find.text('重试'));
    await settle(tester);

    expect(adapter.requests, hasLength(2), reason: '重试必须重新发请求');
    expect(find.text('after-retry'), findsOneWidget);
    expect(find.text('加载失败'), findsNothing);
  });

  testWidgets('既无数据也无错误：不渲染内容块（不拿全 0 冒充）', (tester) async {
    await pumpProfile(
      tester,
      overrides: [
        profileControllerProvider.overrideWith(
          () => FakeProfileController(const ProfileState()),
        ),
      ],
    );
    await settle(tester);

    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('加载失败'), findsNothing);
    expect(find.text('学习数据'), findsNothing);
    expect(find.text('快捷导航'), findsNothing);
  });

  testWidgets('AppBar 刷新：再拉一次并覆盖旧数字', (tester) async {
    final adapter = RecordingAdapter();
    var attempts = 0;
    adapter.handler = (options) {
      attempts++;
      return jsonBody(profileJson(knowledgeCardCount: attempts == 1 ? 33 : 41));
    };

    await pumpProfile(tester, adapter: adapter);
    await settle(tester);

    expect(find.text('33'), findsOneWidget);

    await tester.tap(find.byTooltip('刷新个人信息'));
    await settle(tester);

    expect(adapter.requests, hasLength(2));
    expect(find.text('41'), findsOneWidget);
    expect(find.text('33'), findsNothing);
  });

  testWidgets('点快捷入口：push 到目标页；返回后自动刷新统计', (tester) async {
    final adapter = RecordingAdapter();
    var attempts = 0;
    adapter.handler = (options) {
      attempts++;
      return jsonBody(profileJson(knowledgeCardCount: attempts == 1 ? 33 : 42));
    };

    final router = await pumpProfile(tester, adapter: adapter);
    await settle(tester);
    expect(find.text('33'), findsOneWidget);

    await tester.ensureVisible(find.text('练习历史'));
    await tester.tap(find.text('练习历史'));
    await settleTransition(tester);

    expect(
      router.canPop(),
      isTrue,
      reason: '快捷入口是进入下一层，返回能回个人中心',
    );
    expect(stubPage(AppRoutes.history), findsOneWidget);
    expect(find.text('teacher84'), findsNothing, reason: '被压在下一层');

    router.pop();
    await settleTransition(tester);
    await settle(tester);

    expect(adapter.requests, hasLength(2), reason: '返回后必须补一次刷新');
    expect(find.text('teacher84'), findsOneWidget);
    expect(find.text('42'), findsOneWidget, reason: '卡片数要刷新成新值');
    expect(find.text('33'), findsNothing);
  });

  testWidgets('返回按钮：栈里没有上一层时回首页，不会点了没反应', (
    tester,
  ) async {
    final adapter = RecordingAdapter(responseBody: profileJson());
    final router = await pumpProfile(
      tester,
      adapter: adapter,
      initialLocation: AppRoutes.profile,
    );
    await settle(tester);

    expect(find.text('个人中心'), findsOneWidget);

    await tester.tap(find.byTooltip('返回'));
    await settleTransition(tester);

    expectLocation(router, AppRoutes.dashboard);
    expect(stubPage(AppRoutes.dashboard), findsOneWidget);
  });
}
