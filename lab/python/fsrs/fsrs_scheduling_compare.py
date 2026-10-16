#!/usr/bin/env python3
"""对比评分源 A/B 对 FSRS 排期行为的影响（默认线上参数，不拟合）:
- 稳定度 S 轨迹（复习后）
- 隐含建议间隔 (S*interval_modifier, 90% 保留)
- 实际复习时点的预测 R（模型以为你剩多少记忆）vs 实际正确率
- 分题型 BCE（定位 A/B 差异来自哪里）
只读库。"""
import json
from collections import defaultdict
import fsrs_fit as F
import fsrs_rating_compare as R

def cards_of(rev):
    return F.build_samples([{"qid": q, "reviews": s} for q, s in rev.items()])

def stability_traj(w, cards):
    """每题每次复习后的 S 与当时预测 R(复习前)。"""
    ss, rs = [], []
    for _, days, ratings in cards:
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
    for qid, days, ratings in cards:
        d = s = 0.0
        ty = qtype.get(qid, "?")
        for i, g in enumerate(ratings):
            t = days[i-1] if i > 0 else 0.0
            if i > 0 and not (d == 0 and s == 0):
                r = max(1e-6, min(1-1e-6, F.retrievability(t, s, w)))
                y = 0.0 if g == 1 else 1.0
                acc[ty][0] += -(y*__import__('math').log(r)+(1-y)*__import__('math').log(1-r))
                acc[ty][1] += 1
            d, s = F.next_state(d, s, t, g, w)
    return {k: (v[0]/v[1], v[1]) for k, v in acc.items()}

def main():
    rows = R.load()
    con_type = {qid: typ for qid, typ, *_ in rows}
    revA, revB, revC, dA, dB, dC = R.build_ratings(rows)
    cA, cB = cards_of(revA), cards_of(revB)
    w = F.DEFAULT_W
    import statistics as st
    for tag, cards in [("A 绝对阈值(线上)", cA), ("B 相对分位", cB), ("C 只用对错", cards_of(revC))]:
        ss, rs = stability_traj(w, cards)
        # 建议间隔 = S*1.0 (90%保留, interval_modifier≈1)
        big = [s for s in ss if s > 1]
        print(f"\n=== {tag} (默认参数) ===")
        print(f"  复习后稳定度S中位={st.median(ss):.2f}d  P75={sorted(ss)[int(len(ss)*0.75)]:.2f}d  P95={sorted(ss)[int(len(ss)*0.95)]:.2f}d")
        print(f"  实际复习时点的预测R: 均值={st.mean(rs):.3f}  中位={st.median(rs):.3f}  R<0.5占比={sum(1 for x in rs if x<0.5)/len(rs):.1%}")
        bt = bce_by_type(w, cards, con_type)
        print("  分题型BCE: " + "  ".join(f"{k}:{v[0]:.4f}(n={v[1]})" for k, v in sorted(bt.items(), key=lambda x:-x[1][1])))
if __name__ == "__main__":
    main()
