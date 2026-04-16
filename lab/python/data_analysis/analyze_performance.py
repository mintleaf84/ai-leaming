import sqlite3
import pandas as pd
import os
from pathlib import Path
from tabulate import tabulate

# 配置数据库路径
DB_PATH = Path(__file__).parent.parent / "ai-learning.db"

def analyze_practice_performance():
    """
    核心分析功能：从 SQL 数据中提取复习效率画像
    """
    if not DB_PATH.exists():
        print(f"❌ 数据库未找到: {DB_PATH}")
        return

    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    
    # 1. 加载练习记录与题目详情
    sql = """
    SELECT 
        l.id,
        l.question_id,
        l.is_correct,
        l.duration_ms,
        l.timestamp,
        q.tags,
        q.type as question_type
    FROM practice_logs l
    JOIN questions q ON l.question_id = q.id
    """
    df = pd.read_sql_query(sql, conn)
    conn.close()

    if df.empty:
        print("⚠️ 暂无练习记录，无法开始分析。")
        return

    # 数据预处理：秒转
    df['duration_sec'] = df['duration_ms'] / 1000
    df['tags'] = df['tags'].fillna('["未分类"]')
    
    # 扁平化标签 (Tags 是 JSON 字符串)
    import json
    rows = []
    for _, row in df.iterrows():
        try:
            tags = json.loads(row['tags'])
            if not tags: tags = ["未分类"]
        except:
            tags = ["解析错误"]
        
        for tag in tags:
            rows.append({
                'tag': tag,
                'is_correct': row['is_correct'],
                'duration_sec': row['duration_sec'],
                'type': row['question_type']
            })
    
    tag_df = pd.DataFrame(rows)

    # 2. 知识点 (Tags) 维度汇总
    tag_stats = tag_df.groupby('tag').agg(
        count=('is_correct', 'count'),
        correct_rate=('is_correct', 'mean'),
        avg_time=('duration_sec', 'mean'),
        max_time=('duration_sec', 'max')
    ).reset_index()

    # 过滤掉做题数过少的标签 (至少 2 题)
    tag_stats = tag_stats[tag_stats['count'] >= 2].sort_values(by='correct_rate')

    # 3. 输出报表：正确率最低的 TOP 10 (攻坚区)
    print("\n" + "="*60)
    print("🎯 【攻坚区】正确率最低的知识点 (需要重点突破)")
    print("="*60)
    print(tabulate(tag_stats.head(10).round(2), headers='keys', tablefmt='psql', showindex=False))

    # 4. 输出报表：平均耗时最长的 TOP 10 (效率瓶颈)
    slow_stats = tag_stats.sort_values(by='avg_time', ascending=False)
    print("\n" + "*"*60)
    print("🐢 【瓶颈区】平均耗时最长的知识点 (熟练度不足)")
    print("*"*60)
    print(tabulate(slow_stats.head(10).round(2), headers='keys', tablefmt='psql', showindex=False))

    # 5. 保存结果供后续分析
    output_dir = Path(__file__).parent / "outputs"
    output_dir.mkdir(exist_ok=True)
    tag_stats.to_csv(output_dir / "tag_performance_summary.csv", index=False)
    print(f"\n✅ 分析完成！报告已保存至: {output_dir / 'tag_performance_summary.csv'}")

if __name__ == "__main__":
    analyze_practice_performance()
