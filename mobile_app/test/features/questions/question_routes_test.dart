import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/navigation/app_nav.dart';
import 'package:mobile_app/features/questions/presentation/draft_review_screen.dart';
import 'package:mobile_app/features/questions/presentation/question_form_screen.dart';

/// §34 / §35 的路由常量与页面构造契约。
///
/// 路径写错不会让编译失败，只会让「点新建题目」跳到 404 或停在原页；带参数
/// 的路由还会把 id 拼错成 `/questions/42`（缺 `/edit`）。所以这里既断言路径
/// 字面值，也断言页面拿到的是路径里的 id。
void main() {
  test('新建 / 改题的路径', () {
    expect(AppRoutes.questionNew, '/questions/new');
    expect(AppRoutes.questionEdit('42'), '/questions/42/edit');
  });

  test('草稿列表与校对页的路径', () {
    expect(AppRoutes.drafts, '/drafts');
    expect(AppRoutes.draftDetail('draft_9'), '/drafts/draft_9');
  });

  test('改题页用路径里的 id 进入编辑模式', () {
    const screen = QuestionFormScreen(questionId: '42');

    expect(screen.isEditing, isTrue);
    expect(const QuestionFormScreen().isEditing, isFalse);
  });

  test('校对页把 draftId 带进控制器 family 的键', () {
    const screen = DraftReviewScreen(draftId: 'draft_9');

    expect(screen.draftId, 'draft_9');
  });
}
