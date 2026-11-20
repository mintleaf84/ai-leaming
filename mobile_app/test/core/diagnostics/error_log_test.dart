import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/diagnostics/error_hooks.dart';
import 'package:mobile_app/core/diagnostics/error_log.dart';
import 'package:mobile_app/core/storage/preferences.dart';

import '../../support/fake_preferences_store.dart';

/// 本地诊断日志：环形缓冲、序列化、落盘失败兜底、导出格式、全局钩子接线。
void main() {
  group('ErrorLogEntry', () {
    test('toJson/fromJson 往返', () {
      final entry = ErrorLogEntry(
        at: DateTime.utc(2026, 11, 20, 10),
        kind: 'flutter',
        message: 'Bad state: boom',
        stack: '#0 main (package:app/main.dart:12:3)',
      );

      final restored = ErrorLogEntry.fromJson(
        jsonDecode(jsonEncode(entry.toJson())),
      );

      expect(restored, entry);
    });

    test('stack 为空时不写字段，也能往返', () {
      final entry = ErrorLogEntry(
        at: DateTime.utc(2026, 11, 20, 10),
        kind: 'zone',
        message: 'x',
      );

      expect(entry.toJson().containsKey('stack'), isFalse);
      expect(ErrorLogEntry.fromJson(entry.toJson()), entry);
    });

    test('坏数据返回 null 而不是抛', () {
      expect(ErrorLogEntry.fromJson(null), isNull);
      expect(ErrorLogEntry.fromJson('not a map'), isNull);
      expect(ErrorLogEntry.fromJson(<String, Object?>{}), isNull);
      // 时间解析不了
      expect(
        ErrorLogEntry.fromJson(<String, Object?>{
          'at': 'not-a-date',
          'kind': 'flutter',
          'message': 'x',
        }),
        isNull,
      );
      // 缺字段
      expect(
        ErrorLogEntry.fromJson(<String, Object?>{'at': '2026-11-20T10:00:00Z'}),
        isNull,
      );
      // stack 类型不对
      expect(
        ErrorLogEntry.fromJson(<String, Object?>{
          'at': '2026-11-20T10:00:00Z',
          'kind': 'flutter',
          'message': 'x',
          'stack': 42,
        }),
        isNull,
      );
    });
  });

  group('ErrorLog', () {
    test('超过 200 条丢最旧，entries 最新在前', () {
      final log = ErrorLog(store: FakePreferencesStore());
      for (var i = 0; i < 205; i++) {
        log.add(StateError('boom $i'), null);
      }

      expect(log.entries.length, 200);
      expect(log.entries.first.message, 'Bad state: boom 204');
      expect(log.entries.last.message, 'Bad state: boom 5');
      expect(
        log.entries.map((e) => e.message),
        isNot(contains('Bad state: boom 4')),
      );
    });

    test('persist/load 往返', () async {
      final store = FakePreferencesStore();
      final log = ErrorLog(store: store);
      log.add(
        StateError('first'),
        StackTrace.fromString('#0 a\n#1 b'),
        kind: 'zone',
      );
      await log.persist();

      expect(store.values.containsKey(PreferencesKeys.diagnosticsLog), isTrue);

      final restored = ErrorLog(store: store);
      await restored.load();

      expect(restored.entries.length, 1);
      expect(restored.entries.single.kind, 'zone');
      expect(restored.entries.single.message, 'Bad state: first');
      expect(restored.entries.single.stack, contains('#0 a'));
    });

    test('落盘失败时 add 仍成功且不抛', () async {
      final store = FakePreferencesStore(writeError: StateError('disk full'));
      final log = ErrorLog(store: store);

      log.add(StateError('still works'), null);
      await expectLater(log.persist(), completes);

      expect(log.entries.single.message, 'Bad state: still works');
    });

    test('读取失败不抛，日志保持为空', () async {
      final log = ErrorLog(
        store: FakePreferencesStore(readError: StateError('no channel')),
      );

      await expectLater(log.load(), completes);
      expect(log.entries, isEmpty);
    });

    test('磁盘上是坏 JSON 时不抛且保持为空', () async {
      final store = FakePreferencesStore(
        initial: <String, String>{PreferencesKeys.diagnosticsLog: '{oops'},
      );
      final log = ErrorLog(store: store);

      await expectLater(log.load(), completes);
      expect(log.entries, isEmpty);
    });

    test('磁盘上坏条目逐条丢弃，好条目保留', () async {
      final store = FakePreferencesStore(
        initial: <String, String>{
          PreferencesKeys.diagnosticsLog: jsonEncode(<Object?>[
            'garbage',
            <String, Object?>{
              'at': '2026-11-20T10:00:00.000Z',
              'kind': 'flutter',
              'message': 'ok',
            },
          ]),
        },
      );
      final log = ErrorLog(store: store);

      await log.load();

      expect(log.entries.single.message, 'ok');
    });

    test('exportText 含时间/kind/message 与堆栈首行', () {
      final log = ErrorLog(store: FakePreferencesStore());
      log.add(
        StateError('boom'),
        StackTrace.fromString('#0 foo (a.dart:1:1)\n#1 bar (b.dart:2:2)'),
        kind: 'flutter',
      );

      final text = log.exportText();

      expect(text, contains('] flutter: Bad state: boom'));
      expect(
        text,
        matches(RegExp(r'\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\]')),
      );
      expect(text, contains('#0 foo (a.dart:1:1)'));
      // 只导出堆栈首行，不把整段堆栈塞进去
      expect(text, isNot(contains('#1 bar')));
    });

    test('clear 清空内存并落盘', () async {
      final store = FakePreferencesStore();
      final log = ErrorLog(store: store);
      log.add(StateError('boom'), null);
      await log.persist();

      await log.clear();

      expect(log.entries, isEmpty);
      expect(
        jsonDecode(store.values[PreferencesKeys.diagnosticsLog]!),
        isEmpty,
      );
    });

    test('add 会通知监听者', () {
      final log = ErrorLog(store: FakePreferencesStore());
      var notified = 0;
      log.addListener(() => notified++);

      log.add(StateError('boom'), null);

      expect(notified, 1);
    });
  });

  group('installGlobalErrorHandlers', () {
    late FlutterExceptionHandler? previousOnError;
    late FlutterExceptionHandler previousPresentError;
    late ErrorCallback? previousPlatformOnError;

    setUp(() {
      previousOnError = FlutterError.onError;
      previousPresentError = FlutterError.presentError;
      previousPlatformOnError = PlatformDispatcher.instance.onError;
    });

    tearDown(() {
      FlutterError.onError = previousOnError;
      FlutterError.presentError = previousPresentError;
      PlatformDispatcher.instance.onError = previousPlatformOnError;
    });

    test('FlutterError.onError 记录 kind=flutter 并继续 presentError', () {
      final log = ErrorLog(store: FakePreferencesStore());
      var presented = 0;
      FlutterError.presentError = (details) => presented++;

      installGlobalErrorHandlers(log: log);
      FlutterError.onError!(
        FlutterErrorDetails(
          exception: StateError('flutter boom'),
          stack: StackTrace.fromString('#0 widget (x.dart:1:1)'),
        ),
      );

      expect(log.entries.single.kind, 'flutter');
      expect(log.entries.single.message, 'Bad state: flutter boom');
      expect(log.entries.single.stack, contains('#0 widget'));
      // 记录不能吞掉默认行为：控制台/红屏输出必须照旧
      expect(presented, 1);
    });

    test('PlatformDispatcher.onError 记录 kind=platform 并返回 true', () {
      final log = ErrorLog(store: FakePreferencesStore());

      installGlobalErrorHandlers(log: log);
      final handled = PlatformDispatcher.instance.onError!(
        StateError('platform boom'),
        StackTrace.fromString('#0 engine (y.dart:2:2)'),
      );

      expect(handled, isTrue);
      expect(log.entries.single.kind, 'platform');
      expect(log.entries.single.message, 'Bad state: platform boom');
    });
  });
}
