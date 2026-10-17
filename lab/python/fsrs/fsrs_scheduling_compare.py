#!/usr/bin/env python3
"""对比评分源 A/B/C 与参数组（默认 vs 拟合）对 FSRS 排期行为的影响:
- 稳定度 S 轨迹（复习后），并换算建议间隔（目标保留率 0.9 时间隔数值等于 S）
- 实际复习时点的预测 R（模型以为你剩多少记忆）
- 分题型 BCE（定位差异来自哪里）
拟合权重读取 results/fsrs_fit.json（留出段协议拟合）。只读库。"""
import json, os, math, statistics as st
from collections import defaultdict
import fsrs_fit as F
import fsrs_rating_compare as R

RESULTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results", "fsrs_fit.json")

def cards_of(rev):
    return F.build_samples([{"qid": q, "reviews": s} for q, s in rev.items()])

def stability_traj(w, cards):
    """每题每次复习后的 S 与当时预测 R(复习前)。"""
    ss, rs = [], []
    for _, days, ratings, _ts in cards:
        d = s = 0.0
        for i, g in enumerate(ratings):
            t = days[i-1] if i > 0 else 0.0
            if i > 0 and not (d == 0 and s == 0):
                rs.append(F.retrievability(max(t, 1e-9), s, w))
            d, s = F.next_state(d, s, t, g, w)
            ss.append(s)
    return ss, rs

def bce_by_type(w, cards, qtype):
    """cards 与 qtype 平行: qid->type。按题型统计 BCE。"""
    acc = defaultdict(lambda: [0.0, 0])
    for qid, days, ratings, _ts in cards:
        d = s = 0.0
        ty = qtype.get(qid, "?")
        for i, g in enumerate(ratings):
            t = days[i-1] if i > 0 else 0.0
            if i > 0 and not (d == 0 and s == 0):
                r = max(1e-6, min(1-1e-6, F.retrievability(t, s, w)))
                y = 0.0 if g == 1 else 1.0
                acc[ty][0] += -(y*math.log(r)+(1-y)*math.log(1-r))
                acc[ty][1] += 1
            d, s = F.next_state(d, s, t, g, w)
    return {k: (v[0]/v[1], v[1]) for k, v in acc.items()}

def quantiles(vals):
    q = sorted(vals)
    return st.median(vals), q[int(len(q)*0.75)], q[min(int(len(q)*0.95), len(q)-1)]

def main():
    rows = R.load()
    con_type = {qid: typ for qid, typ, *_ in rows}
    revA, revB, revC, dA, dB, dC = R.build_ratings(rows)
    fitted_w = json.load(open(RESULTS))["fitted_w"]
    for wtag, w in [("默认参数", F.DEFAULT_W), ("拟合参数(留出协议)", fitted_w)]:
        print(f"\n########## 参数组: {wtag} ##########")
        for tag, rev in [("A 绝对阈值(线上)", revA), ("B 相对分位", revB), ("C 只用对错", revC)]:
            cards = cards_of(rev)
            ss, rs = stability_traj(w, cards)
            med, p75, p95 = quantiles(ss)
            print(f"\n=== {tag} ({wtag}) ===")
            print(f"  复习后稳定度S中位={st.median(ss):.2f}d  P75={p75:.2f}d  P95={p95:.2f}d")
            print(f"  建议间隔(90%保留率下与S同值): 中位={med:.0f}d  P75={p75:.0f}d  P95={p95:.0f}d")
            print(f"  实际复习时点的预测R: 均值={st.mean(rs):.3f}  中位={st.median(rs):.3f}  R<0.5占比={sum(1 for x in rs if x<0.5)/len(rs):.1%}")
            bt = bce_by_type(w, cards, con_type)
            print("  分题型BCE（全历史，诊断指标）: " + "  ".join(f"{k}:{v[0]:.4f}(n={v[1]})" for k, v in sorted(bt.items(), key=lambda x:-x[1][1])))
if __name__ == "__main__":
    main()
