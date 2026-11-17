import { drizzleDb as db, drizzleSchema as schema } from "@/lib/db";
import { and, asc, eq, gte, sql } from "drizzle-orm";

/**
 * 前端性能指标采样（docs/performance.md T-01 / P2-02）。
 *
 * 三类数据同表（见 drizzle/0017）：
 *   vital  — Core Web Vitals：INP / LCP / CLS / TTFB / FCP
 *   launch — 首屏可交互时间（domInteractive - startTime）
 *   nav    — 单次交互耗时（Event Timing duration），也就是"点了之后多久有反应"
 *
 * 设计取舍：
 *   * 只写不聚合 —— 原始点保留下来，才能事后算任意分位数，也能按时间窗
 *     对比"某次改动前后"。
 *   * 写入失败不影响前端：调用方拿到 204，错误只进日志。指标是观测数据，
 *     不是业务数据，丢了下一屏还会再报。
 */
export type VitalKind = "vital" | "launch" | "nav";

export const VITAL_NAMES: Record<VitalKind, readonly string[]> = {
  vital: ["INP", "LCP", "CLS", "TTFB", "FCP"],
  launch: ["launch"],
  nav: ["nav"],
};

export const webVitalsService = {
  /** 归一化：CLS 是无量纲小数，放大 1000 倍后取整；其它按毫秒取整。 */
  normalizeValue(name: string, value: number): number {
    if (!Number.isFinite(value) || value < 0) return 0;
    return name === "CLS" ? Math.round(value * 1000) : Math.round(value);
  },

  async record(sample: {
    kind?: VitalKind;
    route: string;
    name: string;
    value: number;
    rating?: string;
    fromRoute?: string;
  }) {
    await db.insert(schema.web_vitals).values({
      kind: sample.kind ?? "vital",
      route: sample.route.slice(0, 200),
      name: sample.name.slice(0, 20),
      value: this.normalizeValue(sample.name, sample.value),
      rating: sample.rating?.slice(0, 20) ?? null,
      from_route: sample.fromRoute?.slice(0, 200) ?? null,
    });
  },

  /**
   * 按路由算某指标的分位数（默认 p75），并按时长倒序返回。
   *
   * SQLite 没有 percentile 函数，这里逐路由取"第 ceil(p*n) 个点"：
   * 升序排序后 offset = ceil(p*n)-1。样本量小（单用户每天百级行），
   * 逐路由一条查询完全够用，不引扩展。
   *
   * 偶数样本取偏低一侧（下中位数），避免两次统计之间 p50 跳动。
   */
  async percentile(options: {
    name: string;
    kind?: VitalKind;
    since?: string;
    p?: number;
  }): Promise<Array<{ route: string; samples: number; value: number }>> {
    const p = options.p ?? 0.75;
    const filters = [eq(schema.web_vitals.name, options.name)];
    if (options.kind) filters.push(eq(schema.web_vitals.kind, options.kind));
    if (options.since) filters.push(gte(schema.web_vitals.created_at, options.since));
    const where = and(...filters);

    const rows = await db
      .select({
        route: schema.web_vitals.route,
        samples: sql<number>`count(*)`,
      })
      .from(schema.web_vitals)
      .where(where)
      .groupBy(schema.web_vitals.route);

    const results: Array<{ route: string; samples: number; value: number }> = [];
    for (const row of rows) {
      const n = Number(row.samples);
      const offset = Math.max(0, Math.ceil(p * n) - 1);
      const [pick] = await db
        .select({ value: schema.web_vitals.value })
        .from(schema.web_vitals)
        .where(and(where, eq(schema.web_vitals.route, row.route)))
        .orderBy(asc(schema.web_vitals.value))
        .limit(1)
        .offset(offset);
      results.push({ route: row.route, samples: n, value: pick?.value ?? 0 });
    }
    return results.sort((a, b) => b.value - a.value);
  },

  /** 样本总量，用来判断"数据够不够下结论"。 */
  async count(options?: { kind?: VitalKind; name?: string }): Promise<number> {
    const filters = [];
    if (options?.kind) filters.push(eq(schema.web_vitals.kind, options.kind));
    if (options?.name) filters.push(eq(schema.web_vitals.name, options.name));
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.web_vitals)
      .where(filters.length > 0 ? and(...filters) : undefined);
    return Number(row?.n ?? 0);
  },

  /** 仅测试/维护用：清空表。 */
  async clear() {
    await db.delete(schema.web_vitals);
  },
};
