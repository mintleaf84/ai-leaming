import 'dart:async';
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

    test('add 异步通知监听者，不在同步栈里回调', () async {
      final log = ErrorLog(store: FakePreferencesStore());
      var notified = 0;
      log.addListener(() => notified++);

      log.add(StateError('boom'), null);

      // 同步返回时必须还没通知：全局钩子可能在 build/layout 期间调用 add，
      // 同步回调会让设置页在构建中 setState。
      expect(notified, 0);
      await pumpEventQueue();
      expect(notified, 1);
    });

    test('监听器抛错不会让 add 抛出，条目仍然写入', () async {
      final log = ErrorLog(store: FakePreferencesStore());
      log.addListener(() => throw FlutterError('listener boom'));

      log.add(StateError('boom'), null);

      expect(log.entries.single.message, 'Bad state: boom');
      // 微任务里抛出的 FlutterError 必须被 _notifyAsync 吞掉，否则这里会失败。
      await pumpEventQueue();
      expect(log.entries.length, 1);
    });

    test('load 期间的写入不覆盖磁盘历史，合并后统一落盘一次', () async {
      final history = jsonEncode(<Object?>[
        <String, Object?>{
          'at': '2026-11-19T10:00:00.000Z',
          'kind': 'flutter',
          'message': 'old',
        },
      ]);
      final store = _BlockingStore(
        initial: <String, String>{PreferencesKeys.diagnosticsLog: history},
      );
      final log = ErrorLog(store: store);

      final loading = log.load();
      log.add(StateError('during-1'), null);
      log.add(StateError('during-2'), null);

      // 磁盘上还有没合并回来的历史，加载期间一条都不能写。
      expect(store.writes, isEmpty);

      store.release();
      await loading;

      expect(store.writes.length, 1);
      final onDisk = jsonDecode(store.values[PreferencesKeys.diagnosticsLog]!)
          as List<Object?>;
      final messages = onDisk
          .map((item) => (item! as Map<Object?, Object?>)['message'])
          .toList();
      expect(messages.length, 3);
      expect(messages, contains('old'));
      expect(messages, contains('Bad state: during-1'));
      expect(messages, contains('Bad state: during-2'));
      // 内存里也是合并后的三条，最新在前。
      expect(log.entries.first.message, 'Bad state: during-2');
    });

    test('load 期间没有新记录时不重复落盘', () async {
      final store = FakePreferencesStore(
        initial: <String, String>{
          PreferencesKeys.diagnosticsLog: jsonEncode(<Object?>[
            <String, Object?>{
              'at': '2026-11-19T10:00:00.000Z',
              'kind': 'flutter',
              'message': 'old',
            },
          ]),
        },
      );
      final log = ErrorLog(store: store);

      await log.load();

      expect(store.writes, isEmpty);
      expect(log.entries.single.message, 'old');
    });
  });

  group('ErrorLog 脱敏', () {
    test('FormatException 只记 message，丢弃 source（学生答案不外泄）', () {
      final log = ErrorLog(store: FakePreferencesStore());

      log.add(
        const FormatException('bad json', '学生答案：机密', 3),
        StackTrace.fromString('#0 parse (x.dart:1:1)'),
      );

      expect(log.entries.single.message, 'FormatException: bad json');
      expect(log.entries.single.message, isNot(contains('学生答案')));
      expect(log.entries.single.message, isNot(contains('机密')));
      expect(log.exportText(), isNot(contains('学生答案')));
    });

    test('超长 message 截断到 200 字符并加省略号', () {
      final log = ErrorLog(store: FakePreferencesStore());
      final long = 'x' * 500;

      log.add(Exception(long), null);

      final message = log.entries.single.message;
      expect(message.length, ErrorLog.maxMessageLength + 1);
      expect(message.endsWith('…'), isTrue);
      expect(message.startsWith('Exception: '), isTrue);
      expect(message.substring(0, message.length - 1), isNot(contains(long)));
    });

    test('多行 message 只留第一行，普通异常保留类型名', () {
      final log = ErrorLog(store: FakePreferencesStore());

      log.add(StateError('first line\nsecond line: 学生答案'), null);

      expect(log.entries.single.message, 'Bad state: first line');
      expect(log.entries.single.message, isNot(contains('学生答案')));
    });

    test('堆栈只保留前 3 行', () {
      final log = ErrorLog(store: FakePreferencesStore());

      log.add(
        StateError('boom'),
        StackTrace.fromString('#0 a\n#1 b\n#2 c\n#3 d\n#4 e'),
      );

      expect(log.entries.single.stack, '#0 a\n#1 b\n#2 c');
    });

    test('空堆栈记为 null 而不是空串', () {
      final log = ErrorLog(store: FakePreferencesStore());

      log.add(StateError('boom'), StackTrace.fromString('\n  \n'));

      expect(log.entries.single.stack, isNull);
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

/// 可控阻塞的 store：制造「load 还没读完、add 已经在写」的时序。
class _BlockingStore extends FakePreferencesStore {
  _BlockingStore({super.initial});

  final Completer<void> _gate = Completer<void>();

  void release() => _gate.complete();

  @override
  Future<String?> read(String key) async {
    await _gate.future;
    return super.read(key);
  }
}
