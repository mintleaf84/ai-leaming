import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';

import 'package:mobile_app/core/network/server_config.dart';
import 'package:mobile_app/core/compat/contract_compat.dart';
import 'package:mobile_app/core/compat/contract_meta_repository.dart';
import 'package:mobile_app/core/storage/preferences.dart';
import 'package:mobile_app/core/sync/sync_providers.dart';
import 'package:mobile_app/core/sync/sync_service.dart';
import 'package:mobile_app/features/chat/data/chat_repository_impl.dart';
import 'package:mobile_app/features/chat/domain/chat_message.dart';
import 'package:mobile_app/features/chat/domain/chat_repository.dart';
import 'package:mobile_app/features/history/domain/history_item.dart';
import 'package:mobile_app/features/history/domain/practice_log.dart';
import 'package:mobile_app/features/history/presentation/history_provider.dart';
import 'package:mobile_app/features/practice/data/local_practice_store.dart';
import 'package:mobile_app/features/practice/data/practice_repository_impl.dart';
import 'package:mobile_app/features/practice/domain/first_principles_response.dart';
import 'package:mobile_app/features/practice/domain/practice_repository.dart';
import 'package:mobile_app/features/practice/domain/practice_session.dart';
import 'package:mobile_app/features/practice/domain/question.dart';
import 'package:mobile_app/features/profile/domain/user_profile.dart';
import 'package:mobile_app/features/profile/presentation/profile_provider.dart';
import 'package:mobile_app/features/recall/data/recall_providers.dart';
import 'package:mobile_app/features/recall/domain/recall_queue.dart';
import 'package:mobile_app/features/settings/presentation/settings_provider.dart';
import 'package:mobile_app/features/stats/domain/learning_stats.dart';
import 'package:mobile_app/features/stats/presentation/stats_provider.dart';
import 'package:mobile_app/features/wrong_book/data/wrong_book_repository.dart';
import 'package:mobile_app/features/wrong_book/domain/wrong_question.dart';

import 'fake_preferences_store.dart';

/// 屏级 widget 测试的 provider override 工厂。
///
/// 为什么集中：每个屏都要拼同一批「登录态 + 仓库 + 本地库 + 服务器地址」，
/// 各自拼一遍的结果是同一个假数据在不同文件里有三份不同版本，改一处漏两处。
/// 这里只做**装配**，不放断言；断言留在各屏的测试文件里。
///
/// 原则：**能跑真控制器就不造假控制器**。仓库假掉、控制器用真的，这样
/// 「加载中 → 数据态」「提交失败停在当前题」这些状态是控制器真跑出来的，
/// 而不是测试自己编的状态——后者只能证明「我能把 state 塞进去」。

// ---------------------------------------------------------------------------
// 平台通道
// ---------------------------------------------------------------------------

/// 拼一个只用于读 payload 的 JWT（签名段不参与客户端逻辑）。
///
/// 客户端从 `jwt_token` 里读 `user.id` 给本地数据打归属，所以测试桩必须是
/// 可解析的 JWT——随便一个字符串会让「当前账号」变成 null，断点/离线数据
/// 的归属校验就测不出来。
String fakeJwt({int userId = 1, String username = 'tester'}) {
  String segment(Object value) {
    return base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  }

  final header = segment(<String, dynamic>{'alg': 'HS256', 'typ': 'JWT'});
  final payload = segment(<String, dynamic>{
    'user': <String, dynamic>{'id': userId, 'username': username},
    'exp': 9999999999,
  });
  return '$header.$payload.signature-not-verified';
}

/// 把 `flutter_secure_storage` 换成内存实现。
///
/// 练习/设置屏在 initState 里直接读 `jwt_token`（`const FlutterSecureStorage()`
/// 是 canonical 实例，所以这个静态桩对它们同样生效）。不调用它的话，
/// 平台通道会抛 MissingPluginException，屏会落到「请先登录」错误态。
///
/// 默认 token 是一个**可解析**的 JWT（用户 id = 1）：断点与离线会话都要按
/// 账号归属校验，不可解析的 token 会被当作「没有账号」，相关路径全部走不通。
void useFakeSecureStorage({String? jwtToken, bool loggedIn = true}) {
  final token = jwtToken ?? fakeJwt();
  FlutterSecureStorage.setMockInitialValues(
    loggedIn ? <String, String>{'jwt_token': token} : <String, String>{},
  );
}

// ---------------------------------------------------------------------------
// 领域假数据
// ---------------------------------------------------------------------------

/// 一道单选题。选项正文故意带上题号，方便断言「渲染的是这道题」。
Question fakeQuestion({
  String id = '1',
  String content = '测试题干：下列说法正确的是？',
  String type = 'single',
  List<String> options = const <String>['选项甲', '选项乙', '选项丙', '选项丁'],
  List<String> tags = const <String>['教育学'],
  String? explanation,
  String? answer,
  String? material,
  String? materialHtml,
}) {
  return Question(
    id: id,
    content: content,
    options: options,
    type: type,
    tags: tags,
    explanation: explanation,
    answer: answer,
    material: material,
    materialHtml: materialHtml,
  );
}

PracticeLog fakeLog({
  int questionId = 1,
  String content = '测试题干：下列说法正确的是？',
  bool isCorrect = true,
  String correctAnswer = 'A',
  String userAnswer = 'A',
  List<String> tags = const <String>['教育学'],
  String explanation = '这是解析正文',
}) {
  return PracticeLog(
    questionId: questionId,
    questionContent: content,
    options: const <String>['选项甲', '选项乙', '选项丙', '选项丁'],
    correctAnswer: correctAnswer,
    userAnswer: userAnswer,
    isCorrect: isCorrect,
    duration: 30,
    tags: tags,
    explanation: explanation,
  );
}

HistoryItem fakeHistoryItem({
  String id = 'session_1',
  int totalQuestions = 10,
  int correctCount = 7,
  int accuracy = 70,
  String createdAt = '2026-11-20T09:30:00.000Z',
}) {
  return HistoryItem(
    id: id,
    sessionName: '综合练习',
    totalQuestions: totalQuestions,
    correctCount: correctCount,
    createdAt: createdAt,
    accuracy: accuracy,
  );
}

WrongQuestion fakeWrongQuestion({
  String questionId = '1',
  String content = '测试错题：下列说法正确的是？',
  List<String> tags = const <String>['教育学'],
  int wrongCount = 2,
}) {
  return WrongQuestion(
    questionId: questionId,
    questionContent: content,
    tags: tags,
    wrongCount: wrongCount,
    lastWrongAt: '2026-11-20T09:30:00.000Z',
    correctAnswer: 'A',
    userLastAnswer: 'B',
  );
}

LearningStats fakeLearningStats({
  int todayCount = 12,
  int todayCorrect = 9,
  double todayAccuracy = 0.75,
  int totalCount = 240,
  int totalCorrect = 190,
  double overallAccuracy = 0.79,
  int streakDays = 5,
  int totalSessions = 24,
}) {
  return LearningStats(
    todayCount: todayCount,
    todayCorrect: todayCorrect,
    todayAccuracy: todayAccuracy,
    totalCount: totalCount,
    totalCorrect: totalCorrect,
    overallAccuracy: overallAccuracy,
    streakDays: streakDays,
    totalSessions: totalSessions,
  );
}

// ---------------------------------------------------------------------------
// 仓库替身
// ---------------------------------------------------------------------------

/// 练习仓库替身：`createSession` 可以用 [gate] 挂住，用来观察骨架屏；
/// `submitAnswer` 可以正常返回，也可以抛错（模拟提交失败）。
class FakePracticeRepository implements PracticeRepository {
  FakePracticeRepository({
    List<Question>? questions,
    this.sessionId = 'session_1',
    this.createError,
    this.createGate,
    this.sessionMode,
    this.submitResponse = const <String, dynamic>{
      'isCorrect': true,
      'correctAnswer': 'A',
    },
    this.submitError,
    this.detail,
  }) : questions = questions ?? <Question>[fakeQuestion()];

  List<Question> questions;
  String sessionId;
  Object? createError;
  Completer<void>? createGate;

  /// 假仓库返回的会话模式（服务端 `practiceMode` / 本地会话 mode 的替身）。
  ///
  /// `null` = 老会话没有这个字段，续练只能靠调用方兜底。
  String? sessionMode;
  /// 挂住 `getSession`：用来观察续练的迟到响应（竞态用例）。
  Completer<void>? getSessionGate;
  Map<String, dynamic> submitResponse;
  Object? submitError;
  Question? detail;

  int createCalls = 0;
  int submitCalls = 0;
  final List<String> submittedAnswers = <String>[];

  /// 每次 `createSession` 带上来的模式（断言「模式在入口就传下去了」）。
  final List<String> createdModes = <String>[];

  /// 每次提交带上来的「整场题序」（降级成本地会话时用来记全题序）。
  final List<List<String>?> submittedSessionQuestionIds = <List<String>?>[];

  /// 被 `getSession` 加载过的会话 id（续练/错题本入口据此断言「进的是这一场」）。
  final List<String> loadedSessions = <String>[];

  @override
  Future<PracticeSession> createSession({
    required int limit,
    String mode = 'random',
  }) async {
    createCalls++;
    createdModes.add(mode);
    if (createGate != null) {
      await createGate!.future;
    }
    final error = createError;
    if (error != null) throw error;
    return PracticeSession(
      sessionId: sessionId,
      questions: questions,
      practiceMode: sessionMode ?? mode,
    );
  }

  @override
  Future<PracticeSession> getSession(String sessionId) async {
    loadedSessions.add(sessionId);
    final gate = getSessionGate;
    if (gate != null) {
      await gate.future;
    }
    final error = createError;
    if (error != null) throw error;
    return PracticeSession(
      sessionId: sessionId,
      questions: questions,
      practiceMode: sessionMode,
    );
  }

  @override
  Future<Map<String, dynamic>> submitAnswer({
    required String sessionId,
    required String questionId,
    required String userAnswer,
    required int duration,
    List<String>? sessionQuestionIds,
  }) async {
    submitCalls++;
    submittedAnswers.add(userAnswer);
    submittedSessionQuestionIds.add(sessionQuestionIds);
    final error = submitError;
    if (error != null) throw error;
    return submitResponse;
  }

  @override
  Future<Question> getQuestionDetail(String id) async {
    return detail ?? fakeQuestion(id: id, explanation: '这是解析正文');
  }

  @override
  Future<QuestionListResponse> getQuestions({
    int? page,
    int? limit,
    String? search,
    String? type,
  }) async {
    return QuestionListResponse(items: questions, total: questions.length);
  }

  @override
  Future<FirstPrinciplesResponse> analyzeFirstPrinciples({
    required String questionContent,
    required String correctAnswer,
    String? explanation,
    String? wrongAnswer,
  }) async {
    return const FirstPrinciplesResponse(analysis: 'AI 解析正文', cached: false);
  }
}

/// 错题本仓库替身。
///
/// [WrongBookRepository] 是具体类（不是抽象接口），所以用继承 + override，
/// 这样不必实现未来新增的方法签名。
class FakeWrongBookRepository extends WrongBookRepository {
  FakeWrongBookRepository() : super(Dio());

  List<WrongQuestion> questions = <WrongQuestion>[fakeWrongQuestion()];
  List<WrongQuestionsByTag> groupedByTag = <WrongQuestionsByTag>[
    WrongQuestionsByTag(
      tag: '教育学',
      count: 1,
      questions: <WrongQuestion>[fakeWrongQuestion()],
    ),
  ];
  WrongBookStats stats = const WrongBookStats(total: 1, recent: 1, frequent: 0);

  Object? loadError;
  Completer<void>? gate;

  int loadCalls = 0;
  final List<String> mastered = <String>[];

  @override
  Future<List<WrongQuestion>> getWrongQuestions() async {
    loadCalls++;
    if (gate != null) await gate!.future;
    final error = loadError;
    if (error != null) throw error;
    return questions;
  }

  @override
  Future<List<WrongQuestionsByTag>> getWrongQuestionsByTag() async {
    if (gate != null) await gate!.future;
    final error = loadError;
    if (error != null) throw error;
    return groupedByTag;
  }

  @override
  Future<WrongBookStats> getStats() async {
    if (gate != null) await gate!.future;
    final error = loadError;
    if (error != null) throw error;
    return stats;
  }

  @override
  Future<Map<String, dynamic>> createPractice(List<String> questionIds) async {
    return <String, dynamic>{'success': true, 'sessionId': 'session_1'};
  }

  @override
  Future<void> markAsMastered(String questionId) async {
    mastered.add(questionId);
  }

  @override
  Future<void> unmarkMastered(String questionId) async {}
}

/// 聊天仓库替身：每次 `sendMessageStream` 返回一个由测试手动驱动的流。
class FakeChatRepository implements ChatRepository {
  final List<StreamController<String>> streams = <StreamController<String>>[];
  List<ChatMessage> sessionMessages = <ChatMessage>[];
  List<Map<String, dynamic>> sessions = <Map<String, dynamic>>[];

  @override
  Stream<String> sendMessageStream(
    List<Map<String, dynamic>> messages, {
    bool enableRag = false,
    String? sessionId,
  }) {
    final controller = StreamController<String>();
    streams.add(controller);
    return controller.stream;
  }

  @override
  Future<Map<String, dynamic>> createSession({String? title}) async {
    return <String, dynamic>{'sessionId': 'session_1'};
  }

  @override
  Future<List<ChatMessage>> getSessionMessages(String sessionId) async {
    return sessionMessages;
  }

  @override
  Future<List<Map<String, dynamic>>> getSessions({int limit = 20}) async {
    return sessions;
  }

  @override
  Future<void> deleteSession(String sessionId) async {}
}

/// 本地离线库替身：设置屏只用 `cachedQuestionCount` / `pendingCount`。
class FakeLocalPracticeStore extends Mock implements LocalPracticeStore {}

/// 同步服务替身：设置屏只在点「同步离线记录」时读它。
class FakeSyncService extends Mock implements SyncService {}

/// 服务器地址存储替身（内存版）。
class FakeServerBaseUrlStore implements ServerBaseUrlStore {
  FakeServerBaseUrlStore([this.value]);

  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String baseUrl) async {
    value = baseUrl;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

// ---------------------------------------------------------------------------
// 控制器替身（只在「仓库无法表达」时使用）
// ---------------------------------------------------------------------------

/// 统计控制器替身：直接给出目标状态，`load()` 不再打网络。
class FakeStatsController extends StatsController {
  FakeStatsController(this.initial);

  final StatsState initial;
  int loadCalls = 0;

  @override
  StatsState build() => initial;

  @override
  Future<void> load() async {
    loadCalls++;
  }
}

/// 个人信息控制器替身：设置屏只读 `profile.username`。
class FakeProfileController extends ProfileController {
  FakeProfileController(this.initial);

  final ProfileState initial;

  @override
  ProfileState build() => initial;

  @override
  Future<void> load() async {}
}

/// 复习模式替身：历史详情屏据此选清单版 / 沉浸版。
class FakeSettingsNotifier extends SettingsNotifier {
  FakeSettingsNotifier(this.initialMode);

  final ReviewMode initialMode;

  @override
  SettingsState build() => SettingsState(reviewMode: initialMode);
}

// ---------------------------------------------------------------------------
// override 工厂
// ---------------------------------------------------------------------------

/// 练习屏：真控制器 + 假仓库。
///
/// [gate] 挂住 `createSession` 即可停在骨架屏；[submitError] 让提交失败，
/// 用于验证「停在当前题、确认入口还能再点」。
List<Object> fakePractice({
  FakePracticeRepository? repository,
  List<Question>? questions,
  Object? createError,
  Completer<void>? createGate,
  Map<String, dynamic>? submitResponse,
  Object? submitError,
  Question? detail,
}) {
  final repo =
      repository ??
      FakePracticeRepository(
        questions: questions,
        createError: createError,
        createGate: createGate,
        submitResponse:
            submitResponse ??
            const <String, dynamic>{'isCorrect': true, 'correctAnswer': 'A'},
        submitError: submitError,
        detail: detail,
      );
  return <Object>[practiceRepositoryProvider.overrideWithValue(repo)];
}

/// 历史详情：直接 override family 的单个元素。
///
/// [loading] 为 true 时返回一个永不完成的 Future（AsyncLoading）；
/// [error] 非空时返回 AsyncError；两者都为空则给 [state]。
List<Object> fakeHistoryDetail(
  String sessionId, {
  HistoryDetailState? state,
  Object? error,
  bool loading = false,
  bool errorOnce = false,
}) {
  if (loading) {
    final pending = Completer<HistoryDetailState>();
    return <Object>[
      historyDetailProvider(sessionId).overrideWith((ref) => pending.future),
    ];
  }
  if (error != null) {
    // [errorOnce] 用来验证「重试真的重新发起了请求」：第一次失败，之后成功。
    var attempts = 0;
    return <Object>[
      historyDetailProvider(sessionId).overrideWith((ref) {
        attempts++;
        if (!errorOnce || attempts == 1) {
          return Future<HistoryDetailState>.error(error);
        }
        return state ?? const HistoryDetailState();
      }),
    ];
  }
  return <Object>[
    historyDetailProvider(
      sessionId,
    ).overrideWith((ref) => state ?? const HistoryDetailState()),
  ];
}

/// 复习模式（历史详情屏据此选清单版 / 沉浸版）。
List<Object> fakeReviewMode(ReviewMode mode) {
  return <Object>[
    settingsProvider.overrideWith(() => FakeSettingsNotifier(mode)),
  ];
}

/// 历史列表替身：首页只读 `items.first.createdAt`，练习历史屏读整页。
///
/// 用假控制器而不是 override 整个 provider：`HistoryListState` 是 freezed，
/// 直接塞状态也能过，但首页还会 `loadHistory()`——假控制器能顺带断言
/// 「首页确实补了一次请求」，而不是凭空显示一个时间。
class FakeHistoryController extends HistoryController {
  FakeHistoryController(this.initial);

  final HistoryListState initial;
  int loadCalls = 0;

  @override
  HistoryListState build() => initial;

  @override
  Future<void> loadHistory() async {
    loadCalls++;
  }
}

List<Object> fakeHistory({
  FakeHistoryController? controller,
  List<HistoryItem>? items,
  bool isLoading = false,
  String? error,
}) {
  final fake =
      controller ??
      FakeHistoryController(
        HistoryListState(
          items: items ?? const <HistoryItem>[],
          isLoading: isLoading,
          error: error,
        ),
      );
  return <Object>[historyControllerProvider.overrideWith(() => fake)];
}

/// 今日回忆队列（首页记忆卡读 `due`）。
List<Object> fakeRecallQueue({
  int due = 0,
  int fresh = 0,
  int? total,
  int estimatedMinutes = 0,
  int streakDays = 0,
}) {
  final queue = RecallQueue(
    ids: <int>[for (var i = 0; i < (total ?? due + fresh); i++) i + 1],
    due: due,
    fresh: fresh,
    total: total ?? due + fresh,
    estimatedMinutes: estimatedMinutes,
    streakDays: streakDays,
  );
  return <Object>[
    recallQueueProvider.overrideWith((ref) async => queue),
  ];
}

/// 本地键值存储（断点、主题、复习模式都走它）。
List<Object> fakePreferences({Map<String, String>? initial}) {
  return <Object>[
    preferencesStoreProvider.overrideWithValue(
      FakePreferencesStore(initial: initial),
    ),
  ];
}

/// 错题本：真控制器 + 假仓库。
List<Object> fakeWrongBook({
  FakeWrongBookRepository? repository,
  List<WrongQuestion>? questions,
  List<WrongQuestionsByTag>? groupedByTag,
  WrongBookStats? stats,
  Object? loadError,
  Completer<void>? gate,
}) {
  final repo =
      repository ??
      (FakeWrongBookRepository()
        ..questions = questions ?? <WrongQuestion>[fakeWrongQuestion()]
        ..groupedByTag = groupedByTag ?? <WrongQuestionsByTag>[]
        ..stats =
            stats ?? const WrongBookStats(total: 1, recent: 1, frequent: 0)
        ..loadError = loadError
        ..gate = gate);
  return <Object>[wrongBookRepositoryProvider.overrideWithValue(repo)];
}

/// 首页统计：假控制器（首页只读，不需要跑加载状态机）。
List<Object> fakeStats({
  FakeStatsController? controller,
  LearningStats? stats,
  String? error,
  bool isLoading = false,
}) {
  final fake =
      controller ??
      FakeStatsController(
        StatsState(
          stats: stats ?? LearningStats.empty,
          isLoading: isLoading,
          error: error,
        ),
      );
  return <Object>[statsControllerProvider.overrideWith(() => fake)];
}

/// 能力协商挂起（`/meta` 永不到达）。
///
/// 首页据此决定要不要显示「记忆卡」入口；真跑会去请求服务端，测试里让它
/// 一直停在协商中——这也是真机断网时的行为（协商未果按「支持」处理）。
List<Object> fakeContractPending() {
  final pending = Completer<ContractDecision>();
  return <Object>[
    contractDecisionProvider.overrideWith((ref) => pending.future),
  ];
}

/// 设置屏：个人信息 + 本地库 + 同步服务 + 服务器地址，一次配齐。
///
/// [baseUrl] 为 null 表示「地址未配置」（`serverConfig.isConfigured == false`）。
List<Object> fakeSettings({
  String? username = 'tester',
  String? baseUrl = 'http://10.0.2.2:3000/api',
  int cachedCount = 0,
  int pendingCount = 0,
  FakeServerBaseUrlStore? store,
}) {
  final localStore = FakeLocalPracticeStore();
  when(
    () => localStore.cachedQuestionCount(),
  ).thenAnswer((_) async => cachedCount);
  when(() => localStore.pendingCount()).thenAnswer((_) async => pendingCount);

  final profile = username == null
      ? const ProfileState()
      : ProfileState(profile: fakeUserProfile(username: username));

  return <Object>[
    profileControllerProvider.overrideWith(
      () => FakeProfileController(profile),
    ),
    localPracticeStoreProvider.overrideWithValue(localStore),
    syncServiceProvider.overrideWithValue(FakeSyncService()),
    ...fakeServerConfig(baseUrl: baseUrl, store: store),
  ];
}

/// 服务器地址：内存存储 + 启动时的已存值。
///
/// [baseUrl] 为 null 表示「从来没配过」（三级回落也拿不到地址）。
List<Object> fakeServerConfig({
  String? baseUrl,
  FakeServerBaseUrlStore? store,
}) {
  return <Object>[
    initialServerBaseUrlProvider.overrideWithValue(baseUrl),
    serverBaseUrlStoreProvider.overrideWithValue(
      store ?? FakeServerBaseUrlStore(baseUrl),
    ),
  ];
}

/// 聊天屏：真控制器 + 假仓库。
///
/// 返回的 override 里可以直接拿到假仓库实例，用来 add / addError / close 流。
List<Object> fakeChat({FakeChatRepository? repository}) {
  final repo = repository ?? FakeChatRepository();
  return <Object>[chatRepositoryProvider.overrideWithValue(repo)];
}

UserProfile fakeUserProfile({String username = 'tester'}) {
  return UserProfile(
    id: 1,
    username: username,
    role: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    stats: const UserProfileStats(
      totalSessions: 0,
      totalAnswered: 0,
      totalCorrect: 0,
      overallAccuracy: 0,
      knowledgeCardCount: 0,
      wrongBookCount: 0,
    ),
  );
}
