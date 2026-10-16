#!/usr/bin/env python3
"""离线验证: 做题场景下"换评分来源"能省多少。
方案A = 复现线上 srs.ts(净思考时间 + 绝对阈值)
方案B = 相对你本人同题型历史净思考时间的滚动分位(因果, 不用未来数据)
两套评分各自跑 FSRS 拟合，比较谁更能预测"未来会不会答错(Again)"。全程只读。"""
import sqlite3, json, bisect, datetime
from collections import defaultdict
import fsrs_fit as F

RS = 7.0
MINN = 20  # 分位所需最少历史样本，不足则中性 Good

def pt(s):
    return datetime.datetime.strptime((s or "").replace('T',' ').replace('Z','')[:19],
                                       '%Y-%m-%d %H:%M:%S').timestamp()

def net_think(typ, content, options, dur_ms, ua):
    opts = ""
    try:
        o = json.loads(options); opts = "".join(o) if isinstance(o, list) else (options or "")
    except Exception:
        opts = options or ""
    chars = len(content or "") + len(opts)
    th = max(0.0, (dur_ms or 0) - chars / RS * 1000)
    if typ == "fill_blank" and ua:
        th = max(0.0, th - len(ua) / 5 * 1000) * 0.6
    elif typ == "multi":
        th *= 1.2
    elif typ == "truefalse":
        th *= 0.5
    return th / 1000.0

def load():
    con = sqlite3.connect('file:/home/chen/data/ai-learning.db?mode=ro', uri=True)
    rows = con.execute("""
      SELECT l.question_id, q.type, l.timestamp, l.is_correct, l.duration_ms,
             l.user_answer, q.content, q.options
      FROM practice_logs l JOIN questions q ON q.id=l.question_id
      WHERE l.user_id=1""").fetchall()
    out = [(qid, t, pt(ts), ok, dur, ua, content, opts)
           for (qid, t, ts, ok, dur, ua, content, opts) in rows]
    out.sort(key=lambda r: r[2])  # 全局时间序，保证因果
    return out

def build_ratings(rows):
    revA, revB, revC = defaultdict(list), defaultdict(list), defaultdict(list)
    hist = defaultdict(list)          # 方案B: 每题型历史净思考时间(升序)
    distA, distB, distC = defaultdict(int), defaultdict(int), defaultdict(int)
    for qid, typ, ts, ok, dur, ua, content, opts in rows:
        th = net_think(typ, content, opts, dur, ua)
        # 方案A: 绝对阈值 (线上)
        if not ok:
            rA = 1
        elif typ == "fill_blank":
            rA = 4 if th < 4 else (3 if th <= 12 else 2)
        else:
            rA = 4 if th < 2 else (3 if th <= 8 else 2)
        # 方案B: 同题型本人历史分位 (因果)
        if not ok:
            rB = 1
        else:
            h = hist[typ]
            if len(h) < MINN:
                rB = 3
            else:
                pos = bisect.bisect_left(h, th) / len(h)
                rB = 4 if pos <= 0.34 else (3 if pos <= 0.67 else 2)
            bisect.insort(h, th)
        # 方案C: 不信耗时, 对=Good 错=Again
        rC = 1 if not ok else 3
        revA[qid].append([ts, rA]); revB[qid].append([ts, rB]); revC[qid].append([ts, rC])
        distA[rA] += 1; distB[rB] += 1; distC[rC] += 1
    return revA, revB, revC, distA, distB, distC

def seq(rev):
    return [{"qid": q, "reviews": s} for q, s in rev.items()]

NAME = {1: "Again", 2: "Hard", 3: "Good", 4: "Easy"}

def run(tag, rev, iters):
    cards = F.build_samples(seq(rev))
    base, bpreds, n = F.loss_and_preds(F.DEFAULT_W, cards)  # 线上=默认参数不拟合
    w, _, _ = F.optimize(F.DEFAULT_W, cards, iters=iters)
    fit, fpreds, _ = F.loss_and_preds(w, cards)
    print(f"\n===== {tag} =====  可预测样本={n}")
    print(f"  线上默认参数直接预测: BCE={base:.5f} Brier={F.brier(bpreds):.5f}")
    print(f"  拟合后:               BCE={fit:.5f} Brier={F.brier(fpreds):.5f}")
    # 校准(拟合后)
    bins = defaultdict(list)
    for r, y in fpreds:
        bins[min(int(r*10), 9)].append((r, y))
    print("  拟合后校准(预测→实际):", end=" ")
    for b in sorted(bins):
        pm = sum(r for r,_ in bins[b])/len(bins[b]); am = sum(y for _,y in bins[b])/len(bins[b])
        print(f"[{pm:.2f}→{am:.2f} n={len(bins[b])}]", end=" ")
    print()
    return w, base, fit

def main():
    rows = load()
    revA, revB, revC, dA, dB, dC = build_ratings(rows)
    print(f"chen 作答总数={len(rows)}")
    print("方案A 评分分布:", {NAME[k]: dA[k] for k in sorted(dA)})
    print("方案B 评分分布:", {NAME[k]: dB[k] for k in sorted(dB)})
    print("方案C 评分分布:", {NAME[k]: dC[k] for k in sorted(dC)})
    import sys
    iters = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    wA, baseA, fitA = run("方案A 绝对阈值(线上)", revA, iters)
    wB, baseB, fitB = run("方案B 相对分位(新)", revB, iters)
    wC, baseC, fitC = run("方案C 只用对错(弃耗时)", revC, iters)
    json.dump({"A": {"w": wA, "bce_default": baseA, "bce_fit": fitA},
               "B": {"w": wB, "bce_default": baseB, "bce_fit": fitB},
               "C": {"w": wC, "bce_default": baseC, "bce_fit": fitC}},
              open("/home/chen/data/rating_compare.json", "w"), indent=1)
    print("\n>>> 线上默认参数直接预测(最贴近现状效果):")
    print("    A 绝对阈值 BCE=%.5f | B 相对分位 BCE=%.5f | C 只用对错 BCE=%.5f" % (baseA, baseB, baseC))
    print(">>> 各自拟合最优参数后:")
    print("    A BCE=%.5f | B BCE=%.5f | C BCE=%.5f" % (fitA, fitB, fitC))

if __name__ == "__main__":
    main()
