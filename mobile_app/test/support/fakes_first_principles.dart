import 'package:mobile_app/features/practice/domain/first_principles_response.dart';
import 'package:mobile_app/features/practice/presentation/practice_provider.dart';

/// 第一性原理面板的假控制器：状态由测试直接给出，不发任何请求。
///
/// 为什么不加进 `test/support/fake_providers.dart`：那个文件是各屏共用的装配层，
/// 本轮多个批次在并行的 worktree 里同时改它，往那儿追加必然合并冲突；面板是新
/// 需求，假对象只服务它自己，单独一个文件更不容易打架。
class FakePracticeController extends PracticeController {
  FakePracticeController(this.initial);

  final PracticeSessionState initial;

  /// 被要求重新分析的题号。面板一旦补上「重新生成」入口，用它断言
  /// 「点一下就真的重发一次」，而不是断言转圈图标出现（那只证明状态被读）。
  final List<String> fetchCalls = <String>[];

  @override
  PracticeSessionState build() => initial;

  @override
  Future<void> fetchFirstPrinciples(String questionId) async {
    fetchCalls.add(questionId);
  }
}

/// 只给状态、不预置分析结果的 override 工厂。
///
/// [responses] 的键是 questionId：面板按 `state.firstPrinciples[questionId]`
/// 取自己的那一份，取不到才落空态——所以这里必须能指定「别的题有、这题没有」。
List<Object> fakeFirstPrinciples({
  bool isAnalyzing = false,
  Map<String, FirstPrinciplesResponse> responses =
      const <String, FirstPrinciplesResponse>{},
  String? error,
}) {
  return <Object>[
    practiceControllerProvider.overrideWith(
      () => FakePracticeController(
        PracticeSessionState(
          firstPrinciples: responses,
          isAnalyzingFirstPrinciples: isAnalyzing,
          error: error,
        ),
      ),
    ),
  ];
}
