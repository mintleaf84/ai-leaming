import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- 用户表 ---
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").unique().notNull(),
  password_hash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "student", "teacher"] }).default(
    "student",
  ),
  token_version: integer("token_version").default(0),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 笔记表 ---
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content"),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 题目表 ---
export const questions = sqliteTable(
  "questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    content: text("content").notNull(),
    options: text("options"), // JSON string
    answer: text("answer"),
    explanation: text("explanation"),
    tags: text("tags"), // JSON string
    dimension: text("dimension", {
      enum: ["knowledge", "understanding", "application"],
    }),
    type: text("type"),
    source: text("source"),
    correct_ratio: real("correct_ratio"),
    most_wrong_answer: text("most_wrong_answer"),
    material: text("material"),
    material_html: text("material_html"),
    ai_mnemonic: text("ai_mnemonic"),
    external_id: text("external_id"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    unq_ext: unique("questions_external_id_unique").on(table.external_id),
  }),
);

// --- 用户掌握度表 ---
export const user_mastery = sqliteTable(
  "user_mastery",
  {
    user_id: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    tag_name: text("tag_name").notNull(),
    score: real("score").default(0),
    correct_count: integer("correct_count").default(0),
    total_count: integer("total_count").default(0),
    history: text("history"), // JSON string
    last_updated: text("last_updated").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user_id, table.tag_name] }),
  }),
);

// --- 练习会话表 ---
export const practice_sessions = sqliteTable(
  "practice_sessions",
  {
    id: text("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    session_name: text("session_name"),
    // 外部来源标识（如粉笔练习 key），用于导入幂等：同一用户同一来源只允许一条会话
    source_key: text("source_key"),
    total_questions: integer("total_questions").default(0),
    correct_count: integer("correct_count").default(0),
    review_count: integer("review_count").default(0),
    questions_json: text("questions_json"),
    practice_mode: text("practice_mode"),
    is_demo: integer("is_demo").default(0),
    analysis_report: text("analysis_report"), // AI 深度分析报告（JSON）
    total_duration_ms: integer("total_duration_ms").default(0),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_user_ts: index("idx_practice_sessions_user_ts").on(
      table.user_id,
      sql`${table.created_at} DESC`,
    ),
    // SQLite 中 NULL 互不相等，故历史数据（source_key 为空）不受影响
    uq_user_source: uniqueIndex("uq_practice_sessions_user_source").on(
      table.user_id,
      table.source_key,
    ),
  }),
);

// --- 练习日志表 ---
export const practice_logs = sqliteTable(
  "practice_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    session_id: text("session_id").references(() => practice_sessions.id),
    user_id: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    question_id: integer("question_id")
      .notNull()
      .references(() => questions.id),
    user_answer: text("user_answer"),
    is_correct: integer("is_correct", { mode: "boolean" }).notNull(),
    is_monitored_correct: integer("is_monitored_correct", {
      mode: "boolean",
    }).default(false),
    duration_ms: integer("duration_ms"),
    timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_user_ts: index("idx_practice_logs_user_ts").on(
      table.user_id,
      sql`${table.timestamp} DESC`,
    ),
    idx_correct: index("idx_practice_logs_correct").on(table.is_correct),
    idx_question: index("idx_practice_logs_question").on(table.question_id),
    idx_user_correct: index("idx_practice_logs_user_correct").on(
      table.user_id,
      table.is_correct,
    ),
  }),
);

// --- 错题/回顾表 ---
export const session_reviews = sqliteTable("session_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  session_id: text("session_id")
    .notNull()
    .references(() => practice_sessions.id),
  question_id: integer("question_id").notNull(),
  review_data: text("review_data"), // JSON string
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 观察区 ---
export const observation_zone = sqliteTable(
  "observation_zone",
  {
    user_id: integer("user_id").notNull().default(1),
    tag_name: text("tag_name").notNull(),
    reason: text("reason"),
    entered_at: text("entered_at").default(sql`CURRENT_TIMESTAMP`),
    status: text("status", {
      enum: ["active", "recovering", "graduated"],
    }).default("active"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user_id, table.tag_name] }),
  }),
);

// --- 系统设置 ---
export const system_settings = sqliteTable(
  "system_settings",
  {
    user_id: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value"),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user_id, table.key] }),
  }),
);

// --- AI 配置 ---
export const ai_configs = sqliteTable("ai_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  api_url: text("api_url").notNull(),
  api_key: text("api_key").notNull(),
  model_economy: text("model_economy"),
  model_premium: text("model_premium"),
  model_embedding: text("model_embedding"),
  embedding_dimensions: integer("embedding_dimensions"),
  model_rerank: text("model_rerank"),
  model_knowledge: text("model_knowledge"),
  is_active: integer("is_active", { mode: "boolean" }).default(false),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- Prompt 模板 ---
export const prompt_templates = sqliteTable("prompt_templates", {
  key: text("key").primaryKey(),
  template: text("template").notNull(),
  description: text("description"),
  variables: text("variables"),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- AI 模型路由 ---
export const ai_model_routes = sqliteTable("ai_model_routes", {
  feature: text("feature").primaryKey(),
  config_id: integer("config_id").references(() => ai_configs.id, {
    onDelete: "set null",
  }),
  model_name: text("model_name"),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 聊天会话 ---
export const chat_sessions = sqliteTable(
  "chat_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("新对话"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
    message_count: integer("message_count").default(0),
  },
  (table) => ({
    idx_updated: index("idx_chat_sessions_updated").on(
      sql`${table.updated_at} DESC`,
    ),
    idx_user: index("idx_chat_sessions_user").on(table.user_id),
  }),
);

// --- 聊天消息 ---
export const chat_messages = sqliteTable(
  "chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    session_id: integer("session_id")
      .notNull()
      .references(() => chat_sessions.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    is_favorite: integer("is_favorite").default(0),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_session: index("idx_chat_messages_session").on(
      table.session_id,
      table.created_at,
    ),
  }),
);

// --- 知识卡片 ---
export const knowledge_cards = sqliteTable(
  "knowledge_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    session_id: integer("session_id").references(() => chat_sessions.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    category: text("category"),
    tags: text("tags"),
    front: text("front"),
    back: text("back"),
    key_points: text("key_points"),
    source_content: text("source_content"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_category: index("idx_knowledge_cards_category").on(table.category),
    idx_created: index("idx_knowledge_cards_created").on(
      sql`${table.created_at} DESC`,
    ),
    idx_user: index("idx_knowledge_cards_user").on(table.user_id),
  }),
);

// --- 管理日志 ---
export const admin_logs = sqliteTable(
  "admin_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    action: text("action").notNull(),
    target_type: text("target_type"),
    target_id: text("target_id"),
    details: text("details"),
    ip_address: text("ip_address"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_created: index("idx_admin_logs_created").on(
      sql`${table.created_at} DESC`,
    ),
    idx_user: index("idx_admin_logs_user").on(table.user_id),
    idx_action: index("idx_admin_logs_action").on(table.action),
  }),
);

// --- API 调用日志 ---
export const api_call_logs = sqliteTable(
  "api_call_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id"),
    config_id: integer("config_id"),
    model: text("model").notNull(),
    endpoint: text("endpoint"),
    input_tokens: integer("input_tokens").default(0),
    output_tokens: integer("output_tokens").default(0),
    duration_ms: integer("duration_ms"),
    success: integer("success").default(1),
    error_message: text("error_message"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_created: index("idx_api_logs_created").on(
      sql`${table.created_at} DESC`,
    ),
    idx_user_created: index("idx_api_logs_user_created").on(
      table.user_id,
      sql`${table.created_at} DESC`,
    ),
    idx_model: index("idx_api_logs_model").on(table.model),
    idx_date: index("idx_api_logs_date").on(sql`date(${table.created_at})`),
  }),
);

// --- 订阅计划 ---
export const subscription_plans = sqliteTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tier: text("tier").notNull(),
  price_monthly: integer("price_monthly").default(0),
  limits: text("limits").notNull(),
  features: text("features"),
  is_active: integer("is_active").default(1),
  sort_order: integer("sort_order").default(0),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 用户订阅 ---
export const user_subscriptions = sqliteTable("user_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  plan_id: text("plan_id")
    .notNull()
    .default("free")
    .references(() => subscription_plans.id),
  status: text("status", { enum: ["active", "expired", "cancelled"] }).default(
    "active",
  ),
  started_at: text("started_at").default(sql`CURRENT_TIMESTAMP`),
  expires_at: text("expires_at"),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 每日用量 ---
export const daily_usage = sqliteTable(
  "daily_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usage_date: text("usage_date").notNull(),
    usage_type: text("usage_type").notNull(),
    count: integer("count").default(0),
  },
  (table) => ({
    unq: unique().on(table.user_id, table.usage_date, table.usage_type),
    idx_user_date: index("idx_daily_usage_user_date").on(
      table.user_id,
      table.usage_date,
    ),
  }),
);

// --- 支付记录 ---
export const payment_records = sqliteTable(
  "payment_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    order_no: text("order_no").unique().notNull(),
    payment_no: text("payment_no"),
    plan_id: text("plan_id").notNull(),
    amount: integer("amount").notNull(),
    payment_method: text("payment_method"),
    status: text("status", {
      enum: ["pending", "paid", "failed", "refunded"],
    }).default("pending"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    paid_at: text("paid_at"),
  },
  (table) => ({
    idx_user: index("idx_payment_records_user").on(table.user_id),
    idx_order: index("idx_payment_records_order").on(table.order_no),
  }),
);

// --- 已掌握题目 ---
export const mastered_questions = sqliteTable(
  "mastered_questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question_id: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    mastered_at: text("mastered_at").default(sql`CURRENT_TIMESTAMP`),
    note: text("note"),
  },
  (table) => ({
    unq: unique().on(table.user_id, table.question_id),
    idx_user: index("idx_mastered_questions_user").on(table.user_id),
    idx_user_q: index("idx_mastered_questions_user_q").on(
      table.user_id,
      table.question_id,
    ),
  }),
);

// --- 教材表 ---
export const textbooks = sqliteTable("textbooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  author: text("author"),
  description: text("description"),
  cover_url: text("cover_url"),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 教材章节表 ---
export const textbook_chapters = sqliteTable("textbook_chapters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  textbook_id: integer("textbook_id")
    .notNull()
    .references(() => textbooks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  order_index: integer("order_index").default(0),
  parent_id: integer("parent_id"),
  level: integer("level").default(1),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 文本标注表 ---
export const text_annotations = sqliteTable(
  "text_annotations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question_id: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    start_offset: integer("start_offset").notNull(),
    end_offset: integer("end_offset").notNull(),
    tag: text("tag", { enum: ["highlight", "underline", "wavy"] }).notNull(),
    color: text("color"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    unq: unique().on(
      table.user_id,
      table.question_id,
      table.start_offset,
      table.end_offset,
    ),
    idx_user_question: index("idx_text_annotations_user_question").on(
      table.user_id,
      table.question_id,
    ),
  }),
);

// --- API Keys ---
// API Key：既有的"全局 key"（user_id = NULL，身份等价于站长）与后续的
// "用户绑定 key"（user_id 指向 users）共用同一张表。
// scopes 为递进式作用域：admin ⊃ write ⊃ read。
export const api_keys = sqliteTable("api_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key_string: text("key_string").unique().notNull(),
  description: text("description").default(""),
  is_active: integer("is_active").default(1),
  user_id: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  scopes: text("scopes", { enum: ["read", "write", "admin"] })
    .notNull()
    .default("read"),
  last_used_at: text("last_used_at"),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// 写操作审计日志：只记录 POST/PATCH/PUT/DELETE，读请求不入库（量大且无审计价值）。
// key_id 用 set null 而非 cascade —— 删 key 不应抹掉历史操作痕迹。
export const api_audit_logs = sqliteTable(
  "api_audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key_id: integer("key_id").references(() => api_keys.id, {
      onDelete: "set null",
    }),
    user_id: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    duration_ms: integer("duration_ms").notNull(),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_created: index("idx_api_audit_logs_created").on(
      sql`${table.created_at} DESC`,
    ),
    idx_key: index("idx_api_audit_logs_key").on(table.key_id),
  }),
);

// --- AI 缓存表 ---
export const ai_quiz_cache = sqliteTable("ai_quiz_cache", {
  hash: text("hash").primaryKey(),
  data: text("data").notNull(),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const ai_challenge_cache = sqliteTable("ai_challenge_cache", {
  hash: text("hash").primaryKey(),
  data: text("data").notNull(),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const first_principles_cache = sqliteTable(
  "first_principles_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    question_hash: text("question_hash").unique().notNull(),
    analysis: text("analysis").notNull(),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_fp_hash: index("idx_fp_cache_hash").on(table.question_hash),
  }),
);

// --- 思维导图表 ---
export const mindmaps = sqliteTable("mindmaps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content"), // 思维导图 JSON 数据
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 笔记标签表 ---
export const note_tags = sqliteTable(
  "note_tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#6b7280"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    unq: unique().on(table.user_id, table.name),
    idx_note_tags_user: index("idx_note_tags_user").on(table.user_id),
  }),
);

// --- 笔记标签关联表 ---
export const note_tag_relations = sqliteTable(
  "note_tag_relations",
  {
    note_id: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tag_id: integer("tag_id")
      .notNull()
      .references(() => note_tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.note_id, table.tag_id] }),
    idx_note_tag_rel_note: index("idx_note_tag_relations_note").on(
      table.note_id,
    ),
    idx_note_tag_rel_tag: index("idx_note_tag_relations_tag").on(table.tag_id),
  }),
);

// --- 题目 FSRS 状态表 ---
export const question_srs = sqliteTable(
  "question_srs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question_id: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsed_days: integer("elapsed_days").notNull().default(0),
    scheduled_days: integer("scheduled_days").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: integer("state").notNull().default(0), // 0: New, 1: Learning, 2: Review, 3: Relearning
    last_review: text("last_review"),
    due_date: text("due_date")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    unq_user_q: unique().on(table.user_id, table.question_id),
    idx_due: index("idx_question_srs_due").on(table.due_date),
  }),
);

// --- 错题文件夹表 ---
export const question_folders = sqliteTable(
  "question_folders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parent_id: integer("parent_id"),
    color: text("color").default("#6b7280"),
    sort_order: integer("sort_order").default(0),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_user: index("idx_question_folders_user").on(table.user_id),
  }),
);

// --- 文件夹-题目关联表（多对多） ---
export const question_folder_items = sqliteTable(
  "question_folder_items",
  {
    folder_id: integer("folder_id")
      .notNull()
      .references(() => question_folders.id, { onDelete: "cascade" }),
    question_id: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    added_at: text("added_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.folder_id, table.question_id] }),
    idx_folder: index("idx_folder_items_folder").on(table.folder_id),
    idx_question: index("idx_folder_items_question").on(table.question_id),
  }),
);

// --- 题目纠错反馈表 ---
export const question_feedback = sqliteTable(
  "question_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    question_id: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    user_id: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    feedback_type: text("feedback_type", {
      enum: ["wrong_answer", "wrong_content", "wrong_explanation", "other"],
    }).notNull(),
    description: text("description"),
    status: text("status", { enum: ["pending", "resolved", "dismissed"] })
      .default("pending")
      .notNull(),
    resolved_by: integer("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolved_at: text("resolved_at"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idx_question: index("idx_question_feedback_question").on(table.question_id),
    idx_user: index("idx_question_feedback_user").on(table.user_id),
    idx_status: index("idx_question_feedback_status").on(table.status),
    idx_created: index("idx_question_feedback_created").on(
      sql`${table.created_at} DESC`,
    ),
  }),
);

// --- 回忆自测：卡组 / 卡片（内容全局共享，不含任何用户复习数据） ---
export const recall_decks = sqliteTable("recall_decks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deck_key: text("deck_key").notNull().unique(),
  title: text("title").notNull(),
  schema_version: integer("schema_version").notNull().default(1),
  // 分组只是展示用的树（规格 §1.1 的 groups），P1 不单独建表：整棵存 JSON。
  // 没有这一列，import→export 会丢掉 groups 的标题与顺序，导出就不再是同格式。
  groups_json: text("groups_json"),
  // NULL = 公共卡组（任何人都能导入更新）；非 NULL = 该用户维护的卡组
  owner_user_id: integer("owner_user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- 回忆自测：卡片 ---
export const recall_cards = sqliteTable(
  "recall_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deck_id: integer("deck_id")
      .notNull()
      .references(() => recall_decks.id, { onDelete: "cascade" }),
    card_key: text("card_key").notNull(),
    kind: text("kind", { enum: ["list", "cloze"] }).notNull(),
    group_key: text("group_key"),
    prompt: text("prompt").notNull(),
    items_json: text("items_json"),
    blanks_json: text("blanks_json"),
    verbatim: integer("verbatim").notNull().default(0),
    // sha1(prompt + 条目/答案文本)：导入幂等与冲突判定的唯一依据
    prompt_hash: text("prompt_hash").notNull(),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    unq_deck_card: unique().on(table.deck_id, table.card_key),
    idx_deck: index("idx_recall_cards_deck").on(table.deck_id),
  }),
);

// --- 回忆自测：卡片 FSRS 状态（按用户隔离） ---
export const recall_card_states = sqliteTable(
  "recall_card_states",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    card_id: integer("card_id")
      .notNull()
      .references(() => recall_cards.id, { onDelete: "cascade" }),
    due: text("due"),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    state: integer("state").notNull().default(0), // 0 New / 1 Learning / 2 Review / 3 Relearning
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    last_review: text("last_review"),
    // 上次判错的条目序号（JSON 数组），重测只呈现这些条目
    pending_items: text("pending_items"),
    archived: integer("archived").notNull().default(0),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    unq_user_card: unique().on(table.user_id, table.card_id),
    idx_user_due: index("idx_recall_card_states_user_due").on(
      table.user_id,
      table.due,
    ),
  }),
);

// --- 回忆自测：作答日志（匹配器误杀率与后续算法升级的唯一数据源） ---
export const recall_review_logs = sqliteTable(
  "recall_review_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    card_id: integer("card_id")
      .notNull()
      .references(() => recall_cards.id, { onDelete: "cascade" }),
    ts: text("ts").notNull(),
    mode: text("mode", { enum: ["first", "retest"] }).notNull(),
    algo_verdicts: text("algo_verdicts"), // ["ok","miss",...] 匹配器原判
    user_overrides: text("user_overrides"), // [{"index":1,"to":"ok"}]
    keyword_hits: integer("keyword_hits"), // P1 只预留字段：命中条目数
    keyword_total: integer("keyword_total"), // P1 只预留字段：待判条目总数
    derived_rating: text("derived_rating"), // again|hard|good
    typed_answer: text("typed_answer"),
    fsrs_before: text("fsrs_before"),
    fsrs_after: text("fsrs_after"),
  },
  (table) => ({
    idx_user_ts: index("idx_recall_review_logs_user_ts").on(
      table.user_id,
      sql`${table.ts} DESC`,
    ),
  }),
);
