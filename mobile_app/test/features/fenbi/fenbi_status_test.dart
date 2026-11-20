import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/features/fenbi/domain/fenbi_status.dart';

/// 粉笔同步的解析层单测。
///
/// 契约见 `docs/fenbi-sync-design.md` §5；这里只钉「服务端形状漂移时界面不会
/// 打黑」的那几条退化规则（掩码、时间、lastResult 的三种存法、failed 混排）。
void main() {
  group('FenbiSyncStatus.fromJson', () {
    test('未绑定：linked=false，没有手机号', () {
      final status = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': false,
        'phoneMasked': null,
        'lastSyncAt': null,
        'lastResult': null,
      });

      expect(status.linked, isFalse);
      expect(status.phoneMasked, isNull);
      expect(status.lastResult, isNull);
      expect(status.paperUnsupported, isTrue);
    });

    test('已绑定：直接用服务端掩码，不再拼号码', () {
      final status = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': true,
        'phoneMasked': '138****1234',
        'fenbiUserId': 98765,
        'syncable': true,
        'unsupported': <String>['paper'],
      });

      expect(status.phoneMasked, '138****1234');
      // 数字 id 也要能读成字符串（服务端偶有把 id 当数字回的情形）
      expect(status.fenbiUserId, '98765');
      expect(status.syncable, isTrue);
    });

    test('服务端只回 phone 时本地兜底掩码（前 3 后 4）', () {
      final status = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': true,
        'phone': '13812341234',
      });

      expect(status.phoneMasked, '138****1234');
    });

    test('lastResult 是 JSON 字符串（TEXT 列）时解析成结构化结果', () {
      final status = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': true,
        'lastResult': '{"imported":3,"skipped":1,"newQuestions":7,"failed":[]}',
      });

      expect(status.lastResult, isNotNull);
      expect(status.lastResult!.imported, 3);
      expect(status.lastResult!.skipped, 1);
      expect(status.lastResult!.newQuestions, 7);
      expect(status.lastResult!.hasFailed, isFalse);
    });

    test('lastResult 是坏 JSON / 纯文本时落到 note，不抛异常', () {
      final broken = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': true,
        'lastResult': '{"imported": 3, 后面截断了',
      });
      expect(broken.lastResult, isNotNull);
      expect(broken.lastResult!.note, contains('截断了'));

      final plain = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': true,
        'lastResult': '同步完成：导入 2 条',
      });
      expect(plain.lastResult!.note, '同步完成：导入 2 条');
    });

    test('failed 支持对象与字符串混排，缺字段给可读兜底', () {
      final result = FenbiSyncResult.fromJson(<String, dynamic>{
        'failed': <Object?>[
          <String, dynamic>{'exerciseId': 2173997585, 'reason': '题目结构不支持'},
          <String, dynamic>{'id': 42},
          '网络中断',
        ],
      });

      expect(result.failed, hasLength(3));
      expect(result.failed[0].label, '练习 2173997585');
      expect(result.failed[0].reason, '题目结构不支持');
      expect(result.failed[1].label, '练习 42');
      expect(result.failed[1].reason, '未知原因');
      expect(result.failed[2].label, '未知记录');
      expect(result.failed[2].reason, '网络中断');
      expect(result.hasFailed, isTrue);
    });

    test('lastSyncAt 支持 ISO 字符串与毫秒时间戳', () {
      final iso = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': true,
        'lastSyncAt': '2026-11-21T10:30:00.000Z',
      });
      expect(iso.lastSyncAt, DateTime.utc(2026, 11, 21, 10, 30));

      final epoch = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': true,
        'lastSyncAt': 1795198538292,
      });
      expect(
        epoch.lastSyncAt!.millisecondsSinceEpoch,
        1795198538292,
      );
    });

    test('linked / syncable 用 0/1 也能读', () {
      final status = FenbiSyncStatus.fromJson(<String, dynamic>{
        'linked': 1,
        'syncable': 0,
      });

      expect(status.linked, isTrue);
      expect(status.syncable, isFalse);
    });
  });

  group('FenbiQrPhase.parse', () {
    test('四个已知状态', () {
      expect(FenbiQrPhase.parse('pending'), FenbiQrPhase.pending);
      expect(FenbiQrPhase.parse(' SCANNED '), FenbiQrPhase.scanned);
      expect(FenbiQrPhase.parse('confirmed'), FenbiQrPhase.confirmed);
      expect(FenbiQrPhase.parse('expired'), FenbiQrPhase.expired);
    });

    test('未知 / 空值落到 unknown，且只有 confirmed/expired 是终态', () {
      expect(FenbiQrPhase.parse(null), FenbiQrPhase.unknown);
      expect(FenbiQrPhase.parse('weird'), FenbiQrPhase.unknown);
      expect(FenbiQrPhase.pending.isTerminal, isFalse);
      expect(FenbiQrPhase.scanned.isTerminal, isFalse);
      expect(FenbiQrPhase.confirmed.isTerminal, isTrue);
      expect(FenbiQrPhase.expired.isTerminal, isTrue);
    });
  });

  group('FenbiQrSession', () {
    test('缺 lgtoken / qrContent 时标记为不可用（界面据此报错重试）', () {
      expect(
        FenbiQrSession.fromJson(<String, dynamic>{
          'lgtoken': 'abc',
          'qrContent': 'https://www.fenbi.com/scan?lgtoken=abc',
        }).isUsable,
        isTrue,
      );
      expect(
        FenbiQrSession.fromJson(<String, dynamic>{'lgtoken': 'abc'}).isUsable,
        isFalse,
      );
    });
  });
}
