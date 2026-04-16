import sqlite3
import pandas as pd
import json
import os
from pathlib import Path
from pyBKT.models import Model
from tabulate import tabulate

# 配置数据库路径
DB_PATH = Path(__file__).parent.parent / "ai-learning.db"

def run_bkt_analysis():
    """
    执行贝叶斯知识追踪分析 (BKT)
    """
    if not DB_PATH.exists():
        print(f"❌ 数据库未找到: {DB_PATH}")
        return

    print("🔍 正在从数据库提取学习数据...")
    conn = sqlite3.connect(DB_PATH)
    
    # 提取练习日志与题目标签
    query = """
    SELECT 
        l.user_id,
        l.question_id,
        l.is_correct,
        l.timestamp,
        q.tags,
        q.difficulty
    FROM practice_logs l
    JOIN questions q ON l.question_id = q.id
    ORDER BY l.timestamp ASC
    """
    df_raw = pd.read_sql_query(query, conn)
    conn.close()

    if df_raw.empty:
        print("⚠️ 暂无练习记录，无法进行 BKT 建模。")
        return

    print(f"📊 原始记录数: {len(df_raw)}")

    # 1. 数据平铺 (Data Flattening) - 处理多标签题目
    print("🧹 正在处理多标签数据并集成难度因子...")
    expanded_rows = []
    for _, row in df_raw.iterrows():
        try:
            tags = json.loads(row['tags'])
            if not tags: tags = ["未分类"]
        except:
            tags = ["未分类"]
        
        for tag in tags:
            expanded_rows.append({
                'user_id': row['user_id'],
                'skill_name': tag,
                'correct': 1 if row['is_correct'] else 0,
                'timestamp': row['timestamp'],
                'difficulty': row['difficulty'] if row['difficulty'] > 0 else 1
            })
    
    df_bkt = pd.DataFrame(expanded_rows)
    
    # 2. 初始化并训练 pyBKT 模型
    print("🤖 正在启动 pyBKT 建模 (难度感知版: Multigs/Multislip)...")
    model = Model(seed=42, num_fits=1)
    
    # 训练模型：指定难度作为猜对率和失误率的区分维度
    model.fit(data=df_bkt, multigs='difficulty', multislip='difficulty')

    # 3. 输出模型参数报表 (P(L0), P(T), P(G), P(S))
    params = model.params().reset_index()
    # 重命名以提高可读性
    # params 列通常包含: skill, param, class, value
    
    # 4. 预测掌握概率 P(Ln)
    print("📈 正在计算实时掌握概率...")
    preds = model.predict(data=df_bkt)
    
    # 提取每个 Skill 的最后一条记录作为“当前掌握度”
    latest_mastery = preds.groupby('skill_name').tail(1).copy()
    
    # 计算当前掌握度 (state_predictions 为 pyBKT 预测的掌握概率)
    # 注意：pyBKT 不同版本返回的列名可能略有差异，通常是 'state_predictions' 或 'correct_predictions'
    # 为了鲁棒性，我们展示预测结果
    mastery_report = latest_mastery[['skill_name', 'state_predictions']].rename(
        columns={'state_predictions': 'current_mastery'}
    ).sort_values(by='current_mastery', ascending=False)

    # 5. 展示结果
    print("\n" + "="*80)
    print("🏆 【BKT 知识追踪报告】各知识点掌握概率 P(Ln)")
    print("="*80)
    print(tabulate(mastery_report.round(4), headers='keys', tablefmt='psql', showindex=False))

    print("\n" + "*"*80)
    print("⚙️ 【模型参数详情】(L0: 初始, T: 学习率, G: 猜对, S: 失误)")
    print("*"*80)
    # 简单过滤显示关键参数
    pivot_params = params.pivot(index='skill', columns='param', values='value').round(4)
    print(tabulate(pivot_params, headers='keys', tablefmt='psql'))

    # 6. 持久化
    output_dir = Path(__file__).parent / "outputs"
    output_dir.mkdir(exist_ok=True)
    mastery_report.to_csv(output_dir / "bkt_mastery_report.csv", index=False)
    pivot_params.to_csv(output_dir / "bkt_params_report.csv")
    
    print(f"\n✅ BKT 分析完成！详细报表已存至: {output_dir}")

if __name__ == "__main__":
    run_bkt_analysis()
