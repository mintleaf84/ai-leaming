#!/usr/bin/env python3
"""FSRS-6 参数拟合（复刻 ts-fsrs 5.3.2 公式，纯标准库）。
仅分析 chen(user_id=1) 的复习序列，最小化 BCE，不修改任何项目代码。"""
import json, math, time
from datetime import datetime, timezone

DECAY_IDX = 20
S_MIN, S_MAX = 1e-3, 36500

BOUNDS = [
    (1e-3, 100.0), (1e-3, 100.0), (1e-3, 100.0), (1e-3, 100.0),
    (1.0, 10.0), (1e-3, 4.0), (1e-3, 4.0), (1e-3, 0.75),
    (0.0, 4.5), (0.0, 0.8), (1e-3, 3.5), (1e-3, 5.0),
    (1e-3, 0.25), (1e-3, 0.9), (0.0, 4.0), (0.0, 1.0),
    (1.0, 6.0), (0.0, 2.0), (0.0, 2.0), (0.01, 0.8), (0.1, 0.8),
]

DEFAULT_W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 1e-3,
             1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
             1.8729, 0.5425, 0.0912, 0.0658, 0.1542]

def clamp(x, lo, hi):
    return lo if x < lo else (hi if x > hi else x)

def decay_factor(w):
    decay = -w[DECAY_IDX]
    factor = math.exp(math.log(0.9) / decay) - 1.0
    return decay, factor

def retrievability(t, s, w):
    decay, factor = decay_factor(w)
    return (1.0 + factor * t / s) ** decay

def init_stability(g, w):
    return max(w[g - 1], 0.1)

def init_difficulty(g, w):
    return w[4] - math.exp((g - 1) * w[5]) + 1.0

def next_difficulty(d, g, w):
    delta_d = -w[6] * (g - 3)
    next_d = d + delta_d * (10 - d) / 9.0
    init_d = clamp(init_difficulty(4, w), 1, 10)
    return clamp(w[7] * init_d + (1 - w[7]) * next_d, 1, 10)

def next_recall_stability(d, s, r, g, w):
    hard = w[15] if g == 2 else 1.0
    easy = w[16] if g == 4 else 1.0
    ns = s * (1.0 + math.exp(w[8]) * (11.0 - d) * s ** (-w[9])
              * (math.exp((1.0 - r) * w[10]) - 1.0) * hard * easy)
    return clamp(ns, S_MIN, S_MAX)

def next_forget_stability(d, s, r, w):
    ns = (w[11] * d ** (-w[12]) * ((s + 1.0) ** w[13] - 1.0)
          * math.exp((1.0 - r) * w[14]))
    return clamp(ns, S_MIN, S_MAX)

def next_short_term_stability(s, g, w):
    sinc = s ** (-w[19]) * math.exp(w[17] * (g - 3 + w[18]))
    if g >= 2:
        sinc = max(sinc, 1.0)
    return clamp(s * sinc, S_MIN, S_MAX)

def next_state(d, s, t, g, w):
    """返回 (新d, 新s)；d=s=0 表示新卡。"""
    if d == 0.0 and s == 0.0:
        return clamp(init_difficulty(g, w), 1, 10), init_stability(g, w)
    r = retrievability(t, s, w)
    if t == 0.0:
        ns = next_short_term_stability(s, g, w)
    elif g == 1:
        s_fail = next_forget_stability(d, s, r, w)
        ns = clamp(s / math.exp(w[17] * w[18]), S_MIN, s_fail)
    else:
        ns = next_recall_stability(d, s, r, g, w)
    return next_difficulty(d, g, w), ns

def build_samples(seqs):
    """展平为逐卡序列 (qid, 整日间隔, 评分, 评分时刻)。间隔使用 UTC 整日差，
    与 ts-fsrs 5.3.2 调度器一致（abstract_scheduler 以两个 UTC 日期之差计算
    elapsed_days，同日重答为 0 走短期稳定度分支）。"""
    cards = []
    for item in seqs:
        revs = item["reviews"]
        ts = [r[0] for r in revs]
        days = [(ts[i] // 86400) - (ts[i - 1] // 86400) for i in range(1, len(ts))]
        cards.append((item["qid"], days, [r[1] for r in revs], ts))
    return cards

def loss_and_preds(w, cards, cutoff=None):
    """BCE + 每个可预测样本的 (预测r, label, 时刻)。
    cutoff 非空时损失只累计时刻早于 cutoff 的训练样本，预测列表包含全部样本。"""
    total = 0.0
    n = 0
    preds = []
    for _, days, ratings, ts in cards:
        d = s = 0.0
        for i in range(len(ratings)):
            g = ratings[i]
            t = days[i - 1] if i > 0 else 0.0
            if i > 0 and not (d == 0.0 and s == 0.0):
                r = retrievability(t, s, w)
                r = clamp(r, 1e-6, 1 - 1e-6)
                y = 0.0 if g == 1 else 1.0
                if cutoff is None or ts[i] < cutoff:
                    total += -(y * math.log(r) + (1 - y) * math.log(1 - r))
                    n += 1
                preds.append((r, y, ts[i]))
            d, s = next_state(d, s, t, g, w)
    return total / max(n, 1), preds, n

def project(w):
    return [clamp(w[i], BOUNDS[i][0], BOUNDS[i][1]) for i in range(21)]

def optimize(w0, cards, iters=300, lr=0.02, cutoff=None):
    """有限差分梯度 + Adam。cutoff 非空时只用时刻早于 cutoff 的样本拟合（留出防泄漏）。"""
    w = list(w0)
    loss, _, _ = loss_and_preds(w, cards, cutoff)
    m = [0.0] * 21
    v = [0.0] * 21
    b1, b2, eps_adam = 0.9, 0.999, 1e-8
    hist = [(0, loss)]
    for it in range(1, iters + 1):
        grads = []
        for i in range(21):
            lo, hi = BOUNDS[i]
            h = max(1e-5, abs(w[i]) * 1e-4)
            if w[i] + h > hi:
                # 上界处改用后向差分，避免投影抹平试探值导致梯度恒为零
                wm = list(w)
                wm[i] = max(lo, w[i] - h)
                lm, _, _ = loss_and_preds(wm, cards, cutoff)
                denom = w[i] - wm[i]
                grads.append((loss - lm) / denom if denom > 1e-12 else 0.0)
            else:
                wp = list(w)
                wp[i] += h
                lp, _, _ = loss_and_preds(wp, cards, cutoff)
                grads.append((lp - loss) / h)
        for i in range(21):
            m[i] = b1 * m[i] + (1 - b1) * grads[i]
            v[i] = b2 * v[i] + (1 - b2) * grads[i] ** 2
            step = lr * (m[i] / (1 - b1 ** it)) / (math.sqrt(v[i] / (1 - b2 ** it)) + eps_adam)
            w[i] -= step
        w = project(w)
        loss, _, _ = loss_and_preds(w, cards, cutoff)
        if it % 25 == 0 or it == 1:
            hist.append((it, loss))
            print(f"iter {it:4d}  BCE={loss:.6f}", flush=True)
    return w, loss, hist

def calibration2(preds, w, nbin=10):
    bins = [[] for _ in range(nbin)]
    for r, y, *_ in preds:
        bins[min(int(r * nbin), nbin - 1)].append(y)
    out = []
    for b in range(nbin):
        if bins[b]:
            actual = sum(bins[b]) / len(bins[b])
            out.append({"bucket": f"{b/nbin:.1f}-{(b+1)/nbin:.1f}",
                        "n": len(bins[b]), "actual": round(actual, 3)})
    return out

def brier(preds):
    return sum((r - y) ** 2 for r, y, *_ in preds) / max(len(preds), 1)

def split_metrics(preds, cutoff):
    """按预测时刻划分训练/留出段，各自计算 BCE 与 Brier。"""
    tr = [(r, y) for r, y, t in preds if t < cutoff]
    ho = [(r, y) for r, y, t in preds if t >= cutoff]

    def bce(pl):
        if not pl:
            return None
        return sum(-(y * math.log(r) + (1 - y) * math.log(1 - r)) for r, y in pl) / len(pl)

    def holdout_calibration(pl, nbin=10):
        if not pl:
            return []
        bins = [[] for _ in range(nbin)]
        for r, y in pl:
            bins[min(int(r * nbin), nbin - 1)].append(y)
        return [{"bucket": f"{b/nbin:.1f}-{(b+1)/nbin:.1f}",
                 "n": len(bins[b]),
                 "actual": round(sum(bins[b]) / len(bins[b]), 3)} for b in range(nbin) if bins[b]]

    return {
        "n_train": len(tr),
        "n_holdout": len(ho),
        "bce_train": round(bce(tr), 6) if bce(tr) is not None else None,
        "bce_holdout": round(bce(ho), 6) if bce(ho) is not None else None,
        "brier_holdout": round(sum((r - y) ** 2 for r, y in ho) / len(ho), 6) if ho else None,
        "calib_holdout": holdout_calibration(ho),
    }

def main():
    seqs = json.load(open("/home/chen/data/chen_seq.json"))
    cards = build_samples(seqs)
    all_ts = sorted(t for _, _, _, ts in cards for t in ts[1:])
    cutoff = all_ts[int(len(all_ts) * 0.7)] if all_ts else 0.0
    t0 = time.time()
    base_loss, base_preds, n = loss_and_preds(DEFAULT_W, cards)
    print(f"可预测样本={n}  留出切分 cutoff={datetime.fromtimestamp(cutoff, timezone.utc).isoformat() if cutoff else '-'}", flush=True)
    w_fit, _, hist = optimize(DEFAULT_W, cards, iters=300, cutoff=cutoff)
    _, fit_preds, _ = loss_and_preds(w_fit, cards)
    print(f"[{time.time()-t0:.1f}s] 拟合完成", flush=True)
    report = {
        "n_samples": sum(len(c[2]) for c in cards),
        "n_predictable": n,
        "cutoff_utc": datetime.fromtimestamp(cutoff, timezone.utc).isoformat() if cutoff else None,
        "method": "elapsed=UTC 整日差; 拟合仅使用时刻早于 70% 分位的样本, 训练/留出段指标分开报告",
        "default_w": DEFAULT_W,
        "fitted_w": [round(x, 5) for x in w_fit],
        "default_split": split_metrics(base_preds, cutoff),
        "fitted_split": split_metrics(fit_preds, cutoff),
        "train_history": hist,
    }
    json.dump(report, open("/home/chen/data/fsrs_fit.json", "w"), indent=1, ensure_ascii=False)
    print("已写入 /home/chen/data/fsrs_fit.json")

if __name__ == "__main__":
    main()
