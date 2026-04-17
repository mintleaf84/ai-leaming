/// 教材模型
class Textbook {
  final int id;
  final String title;
  final String? author;
  final String? description;
  final String? coverUrl;
  final int chapterCount;
  final String createdAt;

  const Textbook({
    required this.id,
    required this.title,
    this.author,
    this.description,
    this.coverUrl,
    required this.chapterCount,
    required this.createdAt,
  });

  factory Textbook.fromJson(Map<String, dynamic> json) {
    return Textbook(
      id: (json['id'] as num).toInt(),
      title: json['title'] as String,
      author: json['author'] as String?,
      description: json['description'] as String?,
      coverUrl: json['cover_url'] as String?,
      chapterCount: (json['chapterCount'] as num).toInt(),
      createdAt: json['created_at'] as String,
    );
  }
}

/// 教材章节模型
class TextbookChapter {
  final int id;
  final int textbookId;
  final String title;
  final int orderIndex;
  final int? parentId;
  final int level;
  final String createdAt;

  const TextbookChapter({
    required this.id,
    required this.textbookId,
    required this.title,
    required this.orderIndex,
    this.parentId,
    required this.level,
    required this.createdAt,
  });

  factory TextbookChapter.fromJson(Map<String, dynamic> json) {
    return TextbookChapter(
      id: (json['id'] as num).toInt(),
      textbookId: (json['textbook_id'] as num).toInt(),
      title: json['title'] as String,
      orderIndex: (json['order_index'] as num).toInt(),
      parentId: json['parent_id'] != null
          ? (json['parent_id'] as num).toInt()
          : null,
      level: (json['level'] as num).toInt(),
      createdAt: json['created_at'] as String,
    );
  }
}

/// 教材详情（含章节列表）
class TextbookDetail {
  final Textbook textbook;
  final List<TextbookChapter> chapters;

  const TextbookDetail({
    required this.textbook,
    required this.chapters,
  });

  factory TextbookDetail.fromJson(Map<String, dynamic> json) {
    final textbook = Textbook.fromJson(json);
    final chapters = (json['chapters'] as List<dynamic>)
        .map((e) => TextbookChapter.fromJson(e as Map<String, dynamic>))
        .toList();
    return TextbookDetail(textbook: textbook, chapters: chapters);
  }
}
