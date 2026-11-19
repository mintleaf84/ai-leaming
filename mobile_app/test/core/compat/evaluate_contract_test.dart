import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';

/// `evaluateContract` 的判定表逐条验证（`docs/mobile-compat.md` §3）。
///
/// 这是本模块的**核心不变量**：断网不许挡人、服务端太旧要挡、客户端太旧要挡但
/// 可绕过、服务端太新只提示。任何一条被改反，用户要么被无故锁死，要么直接看到
/// 形状漂移的崩溃页。
void main() {
  const clientVersion = '1.0.0';
  const minServer = 1;
  const maxKnown = 1;

  ContractDecision evaluate(
    ContractMeta? meta, {
    String client = clientVersion,
  }) {
    return evaluateContract(
      meta: meta,
      clientVersion: client,
      minServerContract: minServer,
      maxKnownServerContract: maxKnown,
    );
  }

  group('meta == null（404 / 断网 / 解析失败）', () {
    test('→ serverUnreachable，且 blocks == false（离线练习照常）', () {
      final decision = evaluate(null);
      expect(decision.status, ContractCompat.serverUnreachable);
      expect(decision.blocks, isFalse, reason: '断网时必须能进 App，否则离线刷题等于被删功能');
      expect(decision.canBypass, isFalse, reason: '没有阻断就不需要出口');
      expect(decision.meta, isNull);
      expect(decision.features, isEmpty);
      expect(decision.supports('questions'), isFalse);
    });
  });

  group('服务端契约低于客户端要求', () {
    test('contractVersion 0 < 1 → serverTooOld，blocks + canBypass', () {
      final decision = evaluate(ContractMeta.legacy);
      expect(decision.status, ContractCompat.serverTooOld);
      expect(decision.blocks, isTrue);
      expect(decision.canBypass, isTrue, reason: '出口是「先离线练习」');
    });

    test('服务端太旧优先于客户端太旧（同时成立时报 serverTooOld）', () {
      const meta = ContractMeta(contractVersion: 0, minClientVersion: '9.0.0');
      final decision = evaluate(meta);
      expect(
        decision.status,
        ContractCompat.serverTooOld,
        reason: '两处都不可用时，先修服务端才有意义',
      );
    });
  });

  group('客户端低于服务端最低要求', () {
    test('1.0.0 < 1.2.0 → clientTooOld，blocks + canBypass', () {
      const meta = ContractMeta(contractVersion: 1, minClientVersion: '1.2.0');
      final decision = evaluate(meta);
      expect(decision.status, ContractCompat.clientTooOld);
      expect(decision.blocks, isTrue);
      expect(decision.canBypass, isTrue, reason: '出口是「复制下载地址 / 仍然进入」');
    });

    test('1.0.0 与 minClientVersion 1.0 视为相等（缺段按 0），不拦', () {
      const meta = ContractMeta(contractVersion: 1, minClientVersion: '1.0');
      expect(evaluate(meta).status, ContractCompat.ok);
    });

    test('服务端没声明 minClientVersion 时不据此拦人', () {
      const meta = ContractMeta(contractVersion: 1);
      expect(evaluate(meta).status, ContractCompat.ok);
    });
  });

  group('服务端比这版 App 新', () {
    test('contractVersion 2 > maxKnown 1 → clientUnverified，不阻断', () {
      const meta = ContractMeta(
        contractVersion: 2,
        minClientVersion: '1.0.0',
        features: {'questions', 'recall', 'new-thing'},
      );
      final decision = evaluate(meta);
      expect(decision.status, ContractCompat.clientUnverified);
      expect(decision.blocks, isFalse);
      expect(decision.canBypass, isFalse);
      expect(decision.supports('new-thing'), isTrue);
      expect(decision.supports('not-a-feature'), isFalse);
    });
  });

  group('其余 → ok', () {
    test('契约版本与客户端版本都在范围内', () {
      const meta = ContractMeta(
        contractVersion: 1,
        minClientVersion: '1.0.0',
        latestClientVersion: '1.0.0',
        downloadUrl: 'https://example.com/app-release.apk',
        features: {'questions', 'practice', 'recall'},
      );
      final decision = evaluate(meta);
      expect(decision.status, ContractCompat.ok);
      expect(decision.blocks, isFalse);
      expect(decision.canBypass, isFalse);
      expect(decision.features, {'questions', 'practice', 'recall'});
      expect(decision.supports('recall'), isTrue);
      expect(decision.meta, same(meta));
    });

    test('客户端比 minClientVersion 新也是 ok（不是「不匹配」）', () {
      const meta = ContractMeta(contractVersion: 1, minClientVersion: '0.9.0');
      expect(evaluate(meta, client: '1.0.0').status, ContractCompat.ok);
    });
  });
}
