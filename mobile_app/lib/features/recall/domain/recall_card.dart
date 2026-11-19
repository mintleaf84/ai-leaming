import 'recall_json.dart';

/// 卡片类型（后端 `kind` 字段）。
///
/// 契约事实来源：`my-next-app/src/lib/api/routes/external.ts` 的
/// `RecallCardKindSchema = z.enum(["list", "cloze"])`。线上只有 `list` / `cloze` 两个值；
/// 解析时额外把 `blank` 当 `cloze` 的别名接受（历史文档里用过这个叫法），
/// 其余未知值按 web 端 `actions.ts` 的口径退化成 [list]，不抛异常打断整屏。
enum RecallCardKind {
  /// 列举卡：一组条目，逐条判「写了没有」。
  list,

  /// 填空卡：`【　】` 占位，作答按空切开逐空判。
  cloze;

  static RecallCardKind fromWire(Object? value) {
    final raw = value is String ? value.trim().toLowerCase() : '';
    if (raw == 'cloze' || raw == 'blank') return RecallCardKind.cloze;
    return RecallCardKind.list;
  }

  String get wire => name;

  bool get isCloze => this == RecallCardKind.cloze;
}

/// 呈现模式：后端 `mode` 字段。
///
/// `retest` 时界面只呈现 `pendingItems` 里的条目（卡内下标，顺序即输入顺序）。
enum RecallCardMode {
  first,
  retest;

  static RecallCardMode fromWire(Object? value) {
    final raw = value is String ? value.trim().toLowerCase() : '';
    return raw == 'retest' ? RecallCardMode.retest : RecallCardMode.first;
  }

  String get wire => name;
}

/// 列举卡的一个条目（`RecallListItemSchema`）。
class RecallListItem {
  /// 条目文本。
  final String text;

  /// 关键词，任一命中即判「已写」。服务端契约里恒为数组（可为空）。
  final List<String> keywords;

  const RecallListItem({required this.text, this.keywords = const []});

  factory RecallListItem.fromJson(Map<String, dynamic> json) {
    return RecallListItem(
      text: readString(json['text']),
      keywords: readStringList(json['keywords']),
    );
  }

  Map<String, dynamic> toJson() => {
    'text': text,
    'keywords': List<String>.from(keywords),
  };
}

/// 填空卡的一个空位（`RecallBlankSchema`）。
class RecallBlank {
  /// 该空可接受的答案（契约 1–3 个）。
  final List<String> answers;

  const RecallBlank({required this.answers});

  factory RecallBlank.fromJson(Map<String, dynamic> json) {
    return RecallBlank(answers: readStringList(json['answers']));
  }

  Map<String, dynamic> toJson() => {'answers': List<String>.from(answers)};
}

/// 当前身份在这张卡上的复习进度（`RecallCardStateSchema`）。
///
/// 外层可空：`null` = 从未复习过（新卡）。
class RecallCardState {
  /// 下次到期时间（ISO 8601 UTC 文本，不在客户端解析成 `DateTime`，
  /// 学习日切分与展示口径全部以服务端 `nextReviewText` 为准）。
  final String due;

  /// FSRS 记忆稳定度。
  final double stability;

  /// FSRS 难度。
  final double difficulty;

  /// FSRS 状态：0 New / 1 Learning / 2 Review / 3 Relearning。
  final int state;

  /// 累计复习次数。
  final int reps;

  /// 累计遗忘次数。
  final int lapses;

  /// 最近一次复习时间；未知为 null。
  final String? lastReview;

  /// 待重测的条目下标；null 表示没有待重测条目。
  final List<int>? pendingItems;

  /// 是否已归档（移出队列）。
  final bool archived;

  const RecallCardState({
    required this.due,
    required this.stability,
    required this.difficulty,
    required this.state,
    required this.reps,
    required this.lapses,
    required this.lastReview,
    required this.pendingItems,
    required this.archived,
  });

  factory RecallCardState.fromJson(Map<String, dynamic> json) {
    return RecallCardState(
      due: readString(json['due']),
      stability: readDouble(json['stability']),
      difficulty: readDouble(json['difficulty']),
      state: readInt(json['state']),
      reps: readInt(json['reps']),
      lapses: readInt(json['lapses']),
      lastReview: readNullableString(json['last_review']),
      pendingItems: readNullableIntList(json['pendingItems']),
      archived: readBool(json['archived']),
    );
  }

  Map<String, dynamic> toJson() => {
    'due': due,
    'stability': stability,
    'difficulty': difficulty,
    'state': state,
    'reps': reps,
    'lapses': lapses,
    'last_review': lastReview,
    'pendingItems': pendingItems == null ? null : List<int>.from(pendingItems!),
    'archived': archived,
  };
}

/// 一张回忆卡。
///
/// 同一个类承担两种线上形状（字段逐一对齐 `external.ts`）：
///
/// 1. `GET /recall/decks/{deckKey}` 的 `data[]`（`RecallCardSchema`）：
///    没有 `deckKey` / `deckTitle` / `mode` / `pendingItems`，
///    所以这些字段在这里是可选/有默认值；
/// 2. `GET /recall/cards/{cardId}`（卡片详情）：多出 `deckKey` / `deckTitle` /
///    `mode` / `pendingItems`，并且 `state` 缺失时按 `null` 处理。
///
/// 不拆两个类是有意的：两者只差四个字段，拆开会让「取卡 → 判分」这条链路多一次
/// 手工映射，而映射正是漏字段的地方。
class RecallCard {
  /// 卡片数字主键（提交作答时用它）。
  final int cardId;

  /// 卡片在卡组内的文件标识。
  final String cardKey;

  final RecallCardKind kind;

  /// 所属分组；未分组为 null。
  final String? groupKey;

  /// 题干。
  final String prompt;

  /// 列举卡条目；填空卡为 null。
  final List<RecallListItem>? items;

  /// 填空卡空位；列举卡为 null。
  final List<RecallBlank>? blanks;

  /// 是否逐字判分（仅列举卡有意义）。
  final bool verbatim;

  /// 当前身份的进度；null = 从未复习过（新卡）。
  final RecallCardState? state;

  /// 所属卡组标识（仅卡片详情返回）。
  final String? deckKey;

  /// 所属卡组标题（仅卡片详情返回）。
  final String? deckTitle;

  /// 呈现模式（仅卡片详情返回，缺省按 `first`）。
  final RecallCardMode mode;

  /// 待重测条目下标（仅卡片详情返回；null = 无需重测）。
  final List<int>? pendingItems;

  const RecallCard({
    required this.cardId,
    required this.cardKey,
    required this.kind,
    required this.groupKey,
    required this.prompt,
    required this.items,
    required this.blanks,
    required this.verbatim,
    required this.state,
    this.deckKey,
    this.deckTitle,
    this.mode = RecallCardMode.first,
    this.pendingItems,
  });

  factory RecallCard.fromJson(Map<String, dynamic> json) {
    final rawState = json['state'];
    final stateMap = readMap(rawState);

    return RecallCard(
      cardId: readInt(json['cardId']),
      cardKey: readString(json['cardKey']),
      kind: RecallCardKind.fromWire(json['kind']),
      groupKey: readNullableString(json['groupKey']),
      prompt: readString(json['prompt']),
      items: json['items'] == null
          ? null
          : readObjectList(json['items'], RecallListItem.fromJson),
      blanks: json['blanks'] == null
          ? null
          : readObjectList(json['blanks'], RecallBlank.fromJson),
      verbatim: readBool(json['verbatim']),
      state: stateMap == null ? null : RecallCardState.fromJson(stateMap),
      deckKey: readNullableString(json['deckKey']),
      deckTitle: readNullableString(json['deckTitle']),
      mode: RecallCardMode.fromWire(json['mode']),
      pendingItems: readNullableIntList(json['pendingItems']),
    );
  }

  Map<String, dynamic> toJson() => {
    'cardId': cardId,
    'cardKey': cardKey,
    'kind': kind.wire,
    'groupKey': groupKey,
    'prompt': prompt,
    'items': items?.map((item) => item.toJson()).toList(),
    'blanks': blanks?.map((blank) => blank.toJson()).toList(),
    'verbatim': verbatim,
    'state': state?.toJson(),
    if (deckKey != null) 'deckKey': deckKey,
    if (deckTitle != null) 'deckTitle': deckTitle,
    'mode': mode.wire,
    'pendingItems': pendingItems == null ? null : List<int>.from(pendingItems!),
  };

  /// 这张卡共有几个可判分条目（列举卡数条目，填空卡数空位）。
  int get itemCount =>
      kind.isCloze ? (blanks?.length ?? 0) : (items?.length ?? 0);

  /// 本次实际呈现哪些条目（**卡内下标**，顺序即输入顺序）。
  ///
  /// 与 web 端 `app/recall/lib/preview.ts` 的 `resolvePresented` 逐条对齐：
  /// - 非 `retest`：全部条目 `0..n-1`；
  /// - `retest`：只取 `pendingItems` 里越界/非整数之外的项；过滤后为空就退回首发
  ///   （脏 `pendingItems` 不能让界面呈现空列表）。
  List<int> get presentedIndexes {
    final total = itemCount;
    final pending = pendingItems;
    if (mode != RecallCardMode.retest || pending == null) {
      return List<int>.generate(total, (index) => index, growable: false);
    }
    final valid = pending
        .where((index) => index >= 0 && index < total)
        .toList();
    if (valid.isEmpty) {
      return List<int>.generate(total, (index) => index, growable: false);
    }
    return valid;
  }

  /// 是否是重测（只测上次没写出来的条目）。
  ///
  /// 直接看 `mode` 而不是比较条目数：服务端在 `pendingItems` 过滤后为空时会主动
  /// 退回 `first`，所以 `mode == retest` 本身就等价于「确实只呈现了一个真子集」。
  bool get isRetest => mode == RecallCardMode.retest;
}
