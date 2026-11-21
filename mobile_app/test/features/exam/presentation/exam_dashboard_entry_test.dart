import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta.dart';
import 'package:mobile_app/core/compat/contract_meta_repository.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';

import '../../../support/fake_providers.dart';
import '../../../support/pump_screen.dart';

/// 首页「试卷」入口的能力协商：服务端 FEATURES 没有 `exam` 时必须**整张卡消失**
/// （不是灰显后点出一个 404）。
void main() {
  setUpAll(useFakeSecureStorage);

  List<Object> overridesWith(Set<String> features) {
    return <Object>[
      ...fakeStats(),
      contractDecisionProvider.overrideWith(
        (ref) async => ContractDecision(
          status: ContractCompat.ok,
          meta: ContractMeta(contractVersion: 1, features: features),
        ),
      ),
      ...fakeRecallQueue(),
      ...fakeWrongBook(),
      ...fakeHistory(),
      ...fakePreferences(),
    ];
  }

  testWidgets('服务端具备 exam：首页出现试卷入口', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: overridesWith(<String>{'recall', 'exam'}),
    );
    await tester.pump();

    expect(find.text('试卷'), findsOneWidget);
    expect(find.text('自动组卷'), findsOneWidget);
  });

  testWidgets('服务端没有 exam：入口整张消失（不灰显、不占位）', (tester) async {
    await pumpScreen(
      tester,
      const DashboardScreen(),
      overrides: overridesWith(<String>{'recall'}),
    );
    await tester.pump();

    expect(find.text('试卷'), findsNothing);
    expect(find.text('整卷模考'), findsNothing);
  });
}
