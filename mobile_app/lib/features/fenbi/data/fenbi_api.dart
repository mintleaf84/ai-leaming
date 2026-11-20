import 'package:dio/dio.dart';

import '../../../core/error/user_message.dart';
import '../domain/fenbi_status.dart';

/// 粉笔账号同步接口（契约见 `docs/fenbi-sync-design.md` §5）。
///
/// 路径一律不写 `/api` 前缀：`Dio.baseUrl` 已经包含（见
/// `core/constants/api_constants.dart` 与 `recall_repository.dart` 的同一条注释）。
///
/// 这一层只做三件事：拼请求、把响应映射成领域模型、把服务端**已给人看**的
/// `{ error }` 转成 [FenbiApiException]（其余错误交给 `userMessageOf` 统一翻译）。
/// 不缓存、不重试：粉笔登录失败后自动重试会触发风控（设计 §2.1）。
class FenbiApi {
  FenbiApi(this._dio);

  final Dio _dio;

  /// 账号绑定状态。
  Future<FenbiSyncStatus> fetchStatus() async {
    final response = await _send(() => _dio.get('/fenbi/status'));
    return FenbiSyncStatus.fromJson(_requireMap(response.data, '/fenbi/status'));
  }

  /// 手机号 + 密码绑定。
  Future<void> link({required String phone, required String password}) async {
    final response = await _send(
      () => _dio.post(
        '/fenbi/link',
        // 用 [_LinkPayload] 而不是裸 Map：全局 LogInterceptor 打开了
        // `requestBody`，Map 会带着明文密码被打进控制台（设计 §3 明令禁止）。
        // 这个类的 `toJson()` 给 dio 序列化，`toString()` 只回掩码。
        data: _LinkPayload(phone: phone, password: password),
      ),
    );
    _requireMap(response.data, '/fenbi/link');
  }

  /// 生成一张扫码登录二维码。
  Future<FenbiQrSession> createQrSession() async {
    final response = await _send(() => _dio.post('/fenbi/qrcode'));
    return FenbiQrSession.fromJson(
      _requireMap(response.data, '/fenbi/qrcode'),
    );
  }

  /// 查询扫码状态（界面每 2s 调一次）。
  Future<FenbiQrPhase> fetchQrPhase(String lgtoken) async {
    final response = await _send(
      () => _dio.get(
        '/fenbi/qrcode/status',
        queryParameters: <String, dynamic>{'lgtoken': lgtoken},
      ),
    );
    final map = _requireMap(response.data, '/fenbi/qrcode/status');
    return FenbiQrPhase.parse(map['status']?.toString());
  }

  /// 立即同步。[full] 为 true 时忽略「只拉上次之后」的增量限制。
  Future<FenbiSyncResult> sync({bool full = false}) async {
    final response = await _send(
      () => _dio.post(
        '/fenbi/sync',
        data: <String, dynamic>{'full': full},
      ),
    );
    return FenbiSyncResult.fromJson(_requireMap(response.data, '/fenbi/sync'));
  }

  /// 解绑并清除服务端保存的密码 / cookie。
  Future<void> unlink() async {
    final response = await _send(() => _dio.delete('/fenbi/link'));
    _requireMap(response.data, '/fenbi/link');
  }

  /// 统一请求入口：把「服务端已经写好的人话」提前抛成 [FenbiApiException]。
  Future<Response<dynamic>> _send(
    Future<Response<dynamic>> Function() request,
  ) async {
    try {
      return await request();
    } on DioException catch (error) {
      final friendly = _friendlyFailure(error);
      if (friendly != null) throw friendly;
      rethrow;
    }
  }

  /// 从 4xx 里读出可以直接展示的文案；读不到返回 null（交给通用翻译）。
  ///
  /// 契约里失败是 `4xx { error }`，但风控（430）与限频（429）没有 `error`
  /// 字段，也必须给用户一句能行动的话。
  FenbiApiException? _friendlyFailure(DioException error) {
    if (error.type != DioExceptionType.badResponse) return null;
    final status = error.response?.statusCode;

    // 粉笔风控（阿里云 fpr 滑块）：再试也一样，必须引导换扫码。
    if (status == 430) {
      return const FenbiApiException('粉笔临时限制了这次登录，请稍后用扫码绑定，或换网络再试。');
    }
    if (status == 429) {
      return const FenbiApiException('操作太频繁了，请等一分钟再试。');
    }

    final map = _asMap(error.response?.data);
    if (map == null) return null;
    final raw = map['error'] ?? map['message'];
    final String? message;
    if (raw is String) {
      message = raw;
    } else {
      final nested = _asMap(raw);
      message = nested?['message']?.toString() ?? nested?['msg']?.toString();
    }
    if (message == null || message.trim().isEmpty) return null;
    return FenbiApiException(_truncate(message));
  }

  Map<String, dynamic> _requireMap(Object? data, String path) {
    final map = _asMap(data);
    if (map != null) return map;
    throw FormatException(
      '$path 返回的不是 JSON 对象（${data.runtimeType}），'
      '请检查服务器地址是否指向 /api 后端',
    );
  }

  Map<String, dynamic>? _asMap(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((key, item) => MapEntry(key.toString(), item));
    }
    return null;
  }

  /// 服务端错误文案截断：避免把整段载荷/堆栈塞进界面。
  String _truncate(String text) {
    final singleLine = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (singleLine.length <= 120) return singleLine;
    return '${singleLine.substring(0, 120)}…';
  }
}

/// 服务端明确给出、可直接展示的失败（`{ error }` / 风控 / 限频）。
class FenbiApiException implements UserFacingException {
  const FenbiApiException(this.userMessage);

  @override
  final String userMessage;

  @override
  String toString() => 'FenbiApiException: $userMessage';
}

/// `/fenbi/link` 的请求体。
///
/// 存在的唯一理由是**日志脱敏**：dio 序列化时会调 `toJson()`，而
/// `LogInterceptor` 只调 `toString()`。写成裸 `Map<String, dynamic>` 时密码会
/// 以明文进控制台（登录接口目前就是这个状态，属于既有问题，不在本 lane 的
/// 可改文件里；新代码不再复制这个缺陷）。
class _LinkPayload {
  const _LinkPayload({required this.phone, required this.password});

  final String phone;
  final String password;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'phone': phone,
    'password': password,
  };

  @override
  String toString() {
    final masked = phone.length < 7
        ? '****'
        : '${phone.substring(0, 3)}****${phone.substring(phone.length - 4)}';
    return '{"phone":"$masked","password":"***"}';
  }
}
