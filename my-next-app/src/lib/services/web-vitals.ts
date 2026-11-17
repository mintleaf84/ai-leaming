import { drizzleDb as db, drizzleSchema as schema } from "@/lib/db";
import { and, asc, eq, gte, sql } from "drizzle-orm";

/**
 * 前端 Web Vitals 采样（docs/performance.md T-01）。
 *
 * 设计取舍：
 *   * 只写不聚合 —— 原始点保留下来，才能事后算任意分位数，也能按时间窗
 *     对比"某次改动前后"（p75 提升/回退）。
 *   * 写入失败不影响前端：调用方拿到 204，错误只进日志。指标是观测数据，
 *     不是业务数据，丢了下一屏还会再报。
 */
export const webVitalsService = {
  /** 归一化：CLS 是无量纲小数，放大 1000 倍后取整存，避免浮点比较误差。 */
  normalizeValue(name: string, value: number): number {
    if (!Number.isFinite(value) || value < 0) return 0;
    return name === "CLS" ? Math.round(value * 1000) : Math.round(value);
  },

  async record(sample: {
    route: string;
    name: string;
    value: number;
    rating?: string;
  }) {
    await db.insert(schema.web_vitals).values({
      route: sample.route.slice(0, 200),
      name: sample.name.slice(0, 20),
      value: this.normalizeValue(sample.name, sample.value),
      rating: sample.rating?.slice(0, 20) ?? null,
    });
  },

  /**
   * 按路由算某指标的分位数（默认 p75），并按时长倒序返回。
   *
   * SQLite 没有 percentile 函数，这里逐路由取"第 ceil(p*n) 个点"：
   * 升序排序后 offset = ceil(p*n)-1。样本量小（单用户每天百级行），
   * 逐路由一条查询完全够用，不引扩展。
   */
  async percentile(options: {
    name: string;
    since?: string;
    p?: number;
  }): Promise<Array<{ route: string; samples: number; value: number }>> {
    const p = options.p ?? 0.75;
    const rows = await db
      .select({
        route: schema.web_vitals.route,
        samples: sql<number>`count(*)`,
      })
      .from(schema.web_vitals)
      .where(
        options.since
          ? and(
              eq(schema.web_vitals.name, options.name),
              gte(schema.web_vitals.created_at, options.since),
            )
          : eq(schema.web_vitals.name, options.name),
      )
      .groupBy(schema.web_vitals.route);

    const results: Array<{ route: string; samples: number; value: number }> =
      [];
    for (const row of rows) {
      const n = Number(row.samples);
      const offset = Math.max(0, Math.ceil(p * n) - 1);
      const [pick] = await db
        .select({ value: schema.web_vitals.value })
        .from(schema.web_vitals)
        .where(
          and(
            eq(schema.web_vitals.name, options.name),
            eq(schema.web_vitals.route, row.route),
          ),
        )
        .orderBy(asc(schema.web_vitals.value))
        .limit(1)
        .offset(offset);
      results.push({ route: row.route, samples: n, value: pick?.value ?? 0 });
    }
    return results.sort((a, b) => b.value - a.value);
  },

  /** 样本总量，用来判断"数据够不够下结论"。 */
  async count(name?: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.web_vitals)
      .where(name ? eq(schema.web_vitals.name, name) : undefined);
    return Number(row?.n ?? 0);
  },

  /** 仅测试/维护用：清空表。 */
  async clear() {
    await db.delete(schema.web_vitals);
  },
};
