import 'contract_meta.dart';

/// 契约协商结论。
///
/// 五个状态对应 `docs/mobile-compat.md` §3 的判定表；**只有前两个会阻断**：
/// - [serverUnreachable]：`/meta` 拿不到（404 / 断网 / 5xx / 解析失败）。
///   绝不阻断——离线刷题是移动端的主场景，因为一次协商请求失败就把人挡在门外，
///   等于「断网时 App 完全不可用」；
/// - [clientUnverified]：服务端比这版 App 新。也不阻断，只提示；
/// - [serverTooOld] / [clientTooOld]：真的没法正常协作，阻断但给出口
///   （前者可先离线练习，后者可仍带警告进入）。
enum ContractCompat {
  ok,
  serverTooOld,
  clientTooOld,
  clientUnverified,
  serverUnreachable,
}

/// 协商结果：状态 + 服务端自述的元信息（不可达时为 `null`）。
class ContractDecision {
  const ContractDecision({required this.status, this.meta});

  final ContractCompat status;

  /// 拿到的 `/meta`；[ContractCompat.serverUnreachable] 时为 `null`。
  final ContractMeta? meta;

  /// 是否阻断进入 App 本体。
  ///
  /// 刻意**不**包含 [ContractCompat.serverUnreachable]：断网/404 必须照常可用。
  bool get blocks =>
      status == ContractCompat.serverTooOld ||
      status == ContractCompat.clientTooOld;

  /// 阻断时用户是否还有「仍然进入」的出口。
  ///
  /// 两个阻断态都留出口，但语义不同：服务端太旧 → 先进离线练习；客户端太旧 →
  /// 带着「功能可能异常」的警告进入。不给出口的硬闸只在应用商店类分发里成立，
  /// 本项目是自签名手动安装的 APK，硬闸等于把人锁死在一个坏版本上。
  bool get canBypass =>
      status == ContractCompat.serverTooOld ||
      status == ContractCompat.clientTooOld;

  /// 服务端能力清单；不可达时为空集（所有能力探测降级，不崩）。
  Set<String> get features => meta?.features ?? const <String>{};

  /// 服务端是否具备某能力。见 [ContractMeta.supports]。
  bool supports(String feature) => features.contains(feature);
}

/// 按段比较两个版本号字符串，返回 -1 / 0 / 1。
///
/// 规则（协商只关心「谁更新」，不需要完整 semver）：
/// - 按 `.` 切段，逐段按整数比较，**缺段按 0**（`1.0` == `1.0.0`）；
/// - 非数字段按 0 且**不抛**（`abc`、`1.x`、空串都当 0）——协商路径上抛异常
///   只会变成「启动页白屏」，而这类脏数据的最坏影响应该是「当成最旧/相同」；
/// - 相等返回 0，`a` 旧返回 -1，`a` 新返回 1。
int compareVersions(String a, String b) {
  final left = _segments(a);
  final right = _segments(b);
  final length = left.length > right.length ? left.length : right.length;
  for (var i = 0; i < length; i++) {
    final l = i < left.length ? left[i] : 0;
    final r = i < right.length ? right[i] : 0;
    if (l != r) return l < r ? -1 : 1;
  }
  return 0;
}

List<int> _segments(String version) {
  return version
      .trim()
      .split('.')
      .map((segment) => int.tryParse(segment.trim()) ?? 0)
      .toList(growable: false);
}

/// 契约判定（纯函数，无 IO）。
///
/// 判定顺序即优先级，**不要重排**：
/// 1. [meta] 为 `null`（404 / 断网 / 解析失败）→ `serverUnreachable`，不阻断；
/// 2. 服务端契约 < [minServerContract] → `serverTooOld`。放在客户端版本判定之前：
///    服务端太旧时，客户端版本合不合规都没意义（端点根本不存在）；
/// 3. 客户端 < 服务端声明的 `minClientVersion` → `clientTooOld`；
/// 4. 服务端契约 > [maxKnownServerContract] → `clientUnverified`，不阻断；
/// 5. 其余 → `ok`。
///
/// 注意第 1 条与第 2 条的区别：`meta == null` 是**服务端不可达**，绝不能当成
/// `ContractMeta.legacy`（版本 0）——那会把「没网」误判成「服务端太旧」并弹阻断页，
/// 恰恰是本模块最不该犯的错。
ContractDecision evaluateContract({
  required ContractMeta? meta,
  required String clientVersion,
  required int minServerContract,
  required int maxKnownServerContract,
}) {
  if (meta == null) {
    return const ContractDecision(status: ContractCompat.serverUnreachable);
  }
  if (meta.contractVersion < minServerContract) {
    return ContractDecision(status: ContractCompat.serverTooOld, meta: meta);
  }
  final minClientVersion = meta.minClientVersion;
  if (minClientVersion != null &&
      compareVersions(clientVersion, minClientVersion) < 0) {
    return ContractDecision(status: ContractCompat.clientTooOld, meta: meta);
  }
  if (meta.contractVersion > maxKnownServerContract) {
    return ContractDecision(
      status: ContractCompat.clientUnverified,
      meta: meta,
    );
  }
  return ContractDecision(status: ContractCompat.ok, meta: meta);
}
