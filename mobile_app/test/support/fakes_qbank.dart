import 'dart:async';

import 'package:mobile_app/features/practice/domain/question.dart';

import 'fake_providers.dart';

/// 题库列表（`question_list_screen`）专用替身。
///
/// 为什么不复用 [FakePracticeRepository] 的 `getQuestions`：那个实现**丢弃全部
/// 入参**，只回一个固定列表。题库屏的契约恰恰是「参数发对了没有」——搜索词进
/// `search`、翻页进 `page`、每页条数进 `limit`——所以这里把每次请求原样记下来，
/// 用例断言请求而不是断言渲染出来的文字（换文案不该让测试红）。
///
/// 用继承而不是重写一个 `PracticeRepository`：练习相关的方法签名（会话、判分、
/// 第一性原理）与题库屏无关，跟着父类走，接口新增方法时这里不用同步改。
class QbankRequest {
  const QbankRequest({
    this.page,
    this.limit,
    this.search,
    this.type,
  });

  final int? page;
  final int? limit;
  final String? search;
  final String? type;

  @override
  String toString() =>
      'QbankRequest(page: $page, limit: $limit, search: $search, type: $type)';
}

/// 一次列表请求的返回值（条数与服务端总数分开给，`hasMore` 由屏自己算）。
typedef QbankResponse = ({List<Question> items, int total});

class FakeQbankRepository extends FakePracticeRepository {
  FakeQbankRepository({
    super.questions,
    this.total,
    this.listError,
    this.listGate,
    this.nextPageGate,
    this.responder,
  });

  /// `questions` 缺省时的服务端总数（默认 = 返回条数，即「没有下一页」）。
  int? total;

  /// 非空时每次 `getQuestions` 都抛它（模拟断网 / 5xx）。
  Object? listError;

  /// 非空时请求挂在这里，用来停在骨架屏观察第一帧。
  Completer<void>? listGate;

  /// 只挂住「非第一页」的请求，用来观察翻页时的加载指示（第一页照常返回）。
  Completer<void>? nextPageGate;

  /// 按请求给出这一页的内容；缺省返回父类的 `questions`。
  QbankResponse Function(QbankRequest request)? responder;

  /// 按调用顺序记录的全部请求。
  final List<QbankRequest> requests = <QbankRequest>[];

  int get listCalls => requests.length;

  @override
  Future<QuestionListResponse> getQuestions({
    int? page,
    int? limit,
    String? search,
    String? type,
  }) async {
    final request = QbankRequest(
      page: page,
      limit: limit,
      search: search,
      type: type,
    );
    requests.add(request);

    final gate = listGate;
    if (gate != null) {
      await gate.future;
    }
    final nextGate = nextPageGate;
    if (nextGate != null && (page ?? 1) != 1) {
      await nextGate.future;
    }
    final error = listError;
    if (error != null) throw error;

    final response =
        responder?.call(request) ??
        (items: questions, total: total ?? questions.length);
    return QuestionListResponse(items: response.items, total: response.total);
  }
}
