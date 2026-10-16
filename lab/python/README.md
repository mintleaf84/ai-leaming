# 🧪 Python 功能研究实验室 (Python Lab)

欢迎来到 Python 实验室！本目录用于存放所有非生产性的、实验性质的 Python 开发工作，特别是针对本项目做题数据的深度分析与 AI 原型探索。

## 📁 目录结构

```text
lab/python/
├── data_analysis/       # 数据分析与复习效率画像研究
│   ├── analyze_performance.py  # 基础分析：耗时与正确率
│   └── bkt_analysis.py         # 深度分析：BKT 知识追踪建模
├── notebooks/           # Jupyter Notebooks 实验记录
├── ai_prototype/        # AI 新功能原型测试
├── fsrs/                # FSRS 记忆参数拟合与评分方案离线实验（纯标准库，只读访问仓库外 sqlite）
│   ├── fsrs_fit.py               # FSRS-6 参数拟合（chen 复习序列）
│   ├── fsrs_rating_compare.py    # 三种评分来源方案的 BCE/校准对比
│   ├── fsrs_scheduling_compare.py# 默认参数 vs 拟合参数的排期轨迹对比
│   ├── backtest.py               # 选题算法离线回测
│   └── results/                  # 聚合指标 + DATA_LABEL.txt（数据区间标签，不含原始记录）
├── requirements.txt     # 基础工具链依赖
└── README.md            # 本说明文档
```

## 🚀 快速开始

### 1. 环境准备

建议使用项目根目录下的 `.venv` 或在本地创建新环境：

```bash
cd lab/python
pip install -r requirements.txt
```

### 2. 运行 BKT 知识追踪分析

基于贝叶斯知识追踪模型，对各个知识点进行建模与掌握率预测：

```bash
cd data_analysis
python bkt_analysis.py
```

## 🔍 目前已实现分析维度

- **攻坚区 (Top 10)**：正确率最低的知识点（Tags），代表知识盲区。
- **瓶颈区 (Top 10)**：平均耗时最长的知识点，代表熟练度不足。
- **BKT 知识追踪**：
  - **P(L0)**：初始知识掌握程度。
  - **P(T)**：学习率（练习后“不懂变懂”的概率）。
  - **P(G)**：猜对率。
  - **P(S)**：失误率。
  - **P(Ln)**：实时预测的当前掌握概率。
- **原始汇总**：结果会自动保存到 `outputs/` 目录下的 CSV 文件。

---

## 📈 后续研究方向

1.  **BKT 模型调优**：利用更大的数据集进行多参数拟合。
2.  **错题成因研究**：分析是否存在某些题型（如填空题）普遍耗时更长。
3.  **AI 助记引擎原型**：基于 Python 构建首个本地 AI 助记词生成测试脚本。
4.  **遗忘趋势预测**：利用历史练习记录计算知识点的遗忘速度。
