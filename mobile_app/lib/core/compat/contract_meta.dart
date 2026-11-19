/// `GET /api/meta` 的响应模型（服务端契约自述）。
///
/// 形状见 `docs/mobile-compat.md` §2：
/// `{contractVersion, minClientVersion, latestClientVersion, downloadUrl, features}`。
/// 这个端点是**公开、无鉴权、永久稳定**的；客户端在登录前就会调用它。
///
/// 解析一律**宽容**：服务端版本比客户端新、字段被改名、某个字段缺失，都不该让解析
/// 抛异常——协商本身失败会让 App 卡在启动页，而「字段缺失」的正确语义是
/// 「拿不到信息，按最保守的默认值处理」。因此：
/// - 缺 `contractVersion` → 0（等价于「最旧的服务端」，交给判定层决定是否阻断）；
/// - 缺 `downloadUrl` → null（**空串也给 null**，避免 `if (url)` 形同虚设）；
/// - 缺 `features` → 空集合（所有能力探测都降级，不崩）。
class ContractMeta {
  const ContractMeta({
    required this.contractVersion,
    this.minClientVersion,
    this.latestClientVersion,
    this.downloadUrl,
    this.features = const <String>{},
  });

  /// 服务端自报的契约版本（整数，不兼容变更才 +1；不是 semver）。
  final int contractVersion;

  /// 服务端仍愿意服务的最低客户端版本；`null` 表示服务端没有声明（不据它拦人）。
  final String? minClientVersion;

  /// 当前最新客户端版本；仅用于展示「有新版本」。
  final String? latestClientVersion;

  /// APK 下载地址；服务端未配置 `MOBILE_APK_URL` 时为 `null`。
  final String? downloadUrl;

  /// 服务端具备的能力名（只增不减）。
  final Set<String> features;

  /// 「最旧的服务端」占位值：契约版本 0、没有任何能力。
  ///
  /// 用途是让调用方在「拿不到 `/meta`」和「服务端真报 0」两种情况下都有可读的
  /// 兜底对象；判定层（`evaluateContract`）不会把它当成可达的服务端。
  static const ContractMeta legacy = ContractMeta(contractVersion: 0);

  factory ContractMeta.fromJson(Map<String, dynamic> json) {
    return ContractMeta(
      contractVersion: _readInt(json['contractVersion']) ?? 0,
      minClientVersion: _readNonEmptyString(json['minClientVersion']),
      latestClientVersion: _readNonEmptyString(json['latestClientVersion']),
      downloadUrl: _readNonEmptyString(json['downloadUrl']),
      features: _readStringSet(json['features']),
    );
  }

  /// 服务端是否自述具备某能力。
  ///
  /// 能力名是公开 API：服务端删能力必须同时 +1 `contractVersion`，所以旧客户端
  /// 在这里拿到 `false` 时应当降级（隐藏入口），而不是报错。
  bool supports(String feature) => features.contains(feature);

  static int? _readInt(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    // 服务端理论上给 int；字符串是「宽容解析」的一部分（老实现/网关可能转成字符串）。
    if (value is String) return int.tryParse(value.trim());
    return null;
  }

  static String? _readNonEmptyString(Object? value) {
    if (value is! String) return null;
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static Set<String> _readStringSet(Object? value) {
    if (value is! Iterable) return const <String>{};
    return <String>{
      for (final item in value)
        if (item != null && item.toString().trim().isNotEmpty)
          item.toString().trim(),
    };
  }
}
