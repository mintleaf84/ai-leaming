/// 后端地址常量与地址解析规则。
///
/// 地址按三级回落生效（见 [resolveBaseUrl]）：
///   1. 运行时配置：用户在 App 内「设置 → 服务器地址」填写，落 flutter_secure_storage；
///   2. 编译期配置：构建时 `--dart-define=API_BASE_URL=...`（CI 出包走仓库变量）；
///   3. 都没有：返回 null，由上层进入「需要配置服务器地址」状态，不做任何网络请求。
class ApiConstants {
  /// 构建期注入的后端地址。未传 `--dart-define=API_BASE_URL` 时为空串。
  ///
  /// 刻意不给默认值：写死 `127.0.0.1` 只会让装到手机上的包静默连不上任何后端，
  /// 且失败得毫无线索。宁可显式进入「先配置服务器地址」状态。
  static const String compileTimeBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
  );

  static const int connectTimeout = 10000; // 10秒
  static const int receiveTimeout = 15000; // 15秒（AI 分析等长耗时接口需要）

  // Endpoints
  static const String login = '/auth/login';
  static const String questions = '/questions';
  static const String practiceSession = '/practice/session';
  static const String history = '/history';
  static const String knowledgeCards = '/knowledge/cards';
  static const String masteryTree = '/mastery/tree';
  static const String masteryStats = '/mastery/stats';
  static const String firstPrinciples = '/practice/first-principles';

  /// 地址格式校验：必须是 http/https、必须带主机名、不含空白字符、不带 query/fragment。
  ///
  /// 用 [Uri.tryParse] 而不是手写正则：`localhost:3000/api` 这类输入会被解析成
  /// scheme=localhost，靠 scheme 判断就能挡住，不需要第二个正则去猜。
  /// query/fragment 一律拒绝：baseUrl 会和 `'/auth/login'` 这类相对路径拼接，
  /// `http://host/api?x=1` 拼出来的地址是错的（`?x=1/auth/login`）。
  static bool isValidBaseUrl(String raw) {
    final value = raw.trim();
    if (value.isEmpty || value.contains(RegExp(r'\s'))) {
      return false;
    }
    final uri = Uri.tryParse(value);
    if (uri == null) {
      return false;
    }
    if (uri.scheme != 'http' && uri.scheme != 'https') {
      return false;
    }
    if (uri.hasQuery || uri.hasFragment) {
      return false;
    }
    // `http://` 能解析出空 host；`http://.` 之类也要挡掉，要求至少一个字母数字。
    return uri.host.isNotEmpty && RegExp(r'[A-Za-z0-9]').hasMatch(uri.host);
  }

  /// 两个地址是否同源（scheme + host + port）。
  ///
  /// 用于「换服务器时是否要清掉旧 JWT」：同源换路径（例如 `/api` → `/api/v2`）
  /// 凭据仍然有效，不该把用户踢下线。解析失败、或任一方没有 host（相对路径、
  /// 随手输入的字符串）都按不同源处理——宁可多清一次 token。
  static bool isSameOrigin(String a, String b) {
    final first = Uri.tryParse(a.trim());
    final second = Uri.tryParse(b.trim());
    if (first == null || second == null) {
      return false;
    }
    if (first.host.isEmpty || second.host.isEmpty) {
      return false;
    }
    return first.scheme == second.scheme &&
        first.host == second.host &&
        first.port == second.port;
  }

  /// 去掉首尾空白与末尾斜杠：dio 拼接 `'/auth/login'` 时不会出现双斜杠。
  static String normalizeBaseUrl(String raw) {
    var value = raw.trim();
    while (value.length > 1 && value.endsWith('/')) {
      value = value.substring(0, value.length - 1);
    }
    return value;
  }

  /// 三级回落的唯一实现（纯函数，便于单测）。
  ///
  /// [runtimeBaseUrl] 为 null/空串/格式非法时继续回落；[compileTimeBaseUrl]
  /// 传 null 表示取上面的编译期常量。返回 null 代表没有任何可用地址。
  static String? resolveBaseUrl({
    String? runtimeBaseUrl,
    String? compileTimeBaseUrl,
  }) {
    final runtime = runtimeBaseUrl?.trim() ?? '';
    if (isValidBaseUrl(runtime)) {
      return normalizeBaseUrl(runtime);
    }
    final compiled = (compileTimeBaseUrl ?? ApiConstants.compileTimeBaseUrl)
        .trim();
    if (isValidBaseUrl(compiled)) {
      return normalizeBaseUrl(compiled);
    }
    return null;
  }
}
