import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/dio_client.dart';
import 'app_version.dart';
import 'contract_compat.dart';
import 'contract_meta.dart';

/// `GET /api/meta` 的读取入口。
///
/// **路径不带 `/api`**：`Dio.baseUrl` 已经是 `http://host:3000/api`（见
/// `core/constants/api_constants.dart` 的三级回落与 `docs/mobile-compat.md` §2），
/// 写成 `/api/meta` 会拼成 `/api/api/meta`（404），而这种错误在界面上只表现为
/// 「加载失败」，排查成本极高。
class ContractMetaRepository {
  const ContractMetaRepository(this._dio);

  final Dio _dio;

  /// 契约协商端点。
  static const String metaPath = '/meta';

  /// 读取服务端契约；**任何失败都返回 `null`**（= 不可达）。
  ///
  /// 为什么全归 `null` 而不区分 404 / 超时 / 5xx：三者对客户端的含义完全一样
  /// ——「这次拿不到服务端自述」。判定层把 `null` 映射成 `serverUnreachable`，
  /// 也就是「照常进入、离线可用」。若在这里区分 404 并造一个版本 0 的 meta，
  /// 会把「后端还没部署这个端点」误判成「服务端太旧」并弹阻断页——对首次安装
  /// 的用户来说，这正是最坏的结果。
  ///
  /// catch 只覆盖两种形态（见 `docs/error-handling.md`）：
  /// - `DioException`：网络/超时/HTTP 状态，属于预期内、判定可测的失败 → 归 null；
  /// - `FormatException`：服务端回了非 JSON 或形状不对 → 归 null。
  /// 其余异常（例如编程错误）照常抛出，让它在测试/日志里现形。
  ///
  /// 响应体不是 `Map` 时不进 catch：显式 `return null`，因为这是「形状漂移」这个
  /// 明确条件，不是异常。
  Future<ContractMeta?> fetch() async {
    try {
      final response = await _dio.get<dynamic>(metaPath);
      final data = response.data;
      if (data is! Map) {
        debugPrint(
          '[ContractMeta] GET $metaPath 返回的不是 JSON 对象'
          '（${data.runtimeType}），按不可达处理',
        );
        return null;
      }
      return ContractMeta.fromJson(Map<String, dynamic>.from(data));
    } on DioException catch (error) {
      debugPrint(
        '[ContractMeta] GET $metaPath 失败（${error.type}），按不可达处理: '
        '${error.message}',
      );
      return null;
    } on FormatException catch (error) {
      debugPrint('[ContractMeta] GET $metaPath 解析失败，按不可达处理: $error');
      return null;
    }
  }
}

/// 用 `watch` 而不是 `read`：换服务器地址后 `dioProvider` 会重建，
/// 协商必须跟着打新地址（否则换到新后端后仍按旧后端的契约判定）。
final contractMetaRepositoryProvider = Provider<ContractMetaRepository>((ref) {
  return ContractMetaRepository(ref.watch(dioProvider));
});

/// 启动时的契约协商结果。
///
/// 判定参数直接取 [appVersion] / [minServerContract] / [maxKnownServerContract]
/// 三个构建期常量，保证「判定用的版本」与「实际打包的版本」是同一份。
///
/// 消费方注意 `docs/mobile-compat.md` §3 的**首次绘制不等网络**：加载中一律先渲染
/// App 本体，等这里出结果且 `blocks == true` 再切屏。
final contractDecisionProvider = FutureProvider<ContractDecision>((ref) async {
  final meta = await ref.watch(contractMetaRepositoryProvider).fetch();
  return evaluateContract(
    meta: meta,
    clientVersion: appVersion,
    minServerContract: minServerContract,
    maxKnownServerContract: maxKnownServerContract,
  );
});
