import 'dart:convert';

/// JWT 本地有效期判断。
///
/// 只用于「避免带着过期 token 进主界面」这种 UX 判断，**不做签名校验**——
/// 签名由服务端负责，客户端解 payload 只是读 `exp`。
class TokenUtil {
  TokenUtil._();

  /// token 是否已过期（提前 [leeway] 判过期，避免边界上刚好失效）。
  ///
  /// 解析不了（格式异常/无 exp）时返回 false：宁可交给服务端 401 兜底，
  /// 也不要把一个可能有效的 token 提前清掉，导致用户被迫重登。
  static bool isExpired(String token, {Duration leeway = const Duration(seconds: 60)}) {
    final expiry = _readExpiry(token);
    if (expiry == null) {
      return false;
    }
    return DateTime.now().isAfter(expiry.subtract(leeway));
  }

  /// 读取 token 里的用户 id（用于给本地待同步数据打归属）。
  ///
  /// 后端 payload 形如 `{user: {id, username, role, token_version}, exp}`。
  static String? userIdOf(String token) {
    final payload = _readPayload(token);
    if (payload == null) {
      return null;
    }
    final user = payload['user'];
    if (user is! Map<String, dynamic>) {
      return null;
    }
    final id = user['id'];
    return id == null ? null : id.toString();
  }

  static Map<String, dynamic>? _readPayload(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) {
        return null;
      }
      final payloadJson = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final payload = jsonDecode(payloadJson);
      if (payload is Map<String, dynamic>) {
        return payload;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /// 读取 token 的过期时间；无法解析时返回 null。
  static DateTime? _readExpiry(String token) {
    // 解析失败属可忽略：调用方按"未过期"处理，最终由 401 纠正。
    final payload = _readPayload(token);
    final exp = payload?['exp'];
    if (exp is! int) {
      return null;
    }
    return DateTime.fromMillisecondsSinceEpoch(exp * 1000);
  }
}
