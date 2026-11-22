#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识追踪离线回测：baseline-acc / rolling-beta / Elo / BKT-lite × 三种技能粒度。

约束（与任务规格一致）：
  * 超参只在**训练集内部**选（inner validation），测试集只用于最终打分。
  * 只允许 numpy / pandas / sklearn 级别模型，不引入 GPU / 深度 KT。
  * 差值一律给 bootstrap 95% CI；CI 跨 0 即写"无显著差异"。

两种切分：
  time        按 order_index 末 20%（伪时间：章序 → 题型序 → 题号）
  skill_strat 按考点分层抽 20%（检验"技能已学过、题没见过"的冷启动题场景）

用法：
  /public/apps/anaconda3/bin/python backtest.py
"""

import json
import os
import sys
import itertools
import numpy as np
import pandas as pd

from sklearn.metrics import roc_auc_score, log_loss
from sklearn.model_selection import StratifiedKFold

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "results")
SEED = 20261122
BOOT = 1000
GRANS = ["tag", "kaodian", "node"]
SKILL_COL = {"tag": "skill_tag", "kaodian": "skill_kaodian", "node": "skill_node"}


# --------------------------------------------------------------------------
# 指标
# --------------------------------------------------------------------------

def metrics(y, p):
    y = np.asarray(y, dtype=float)
    p = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    out = {"logloss": log_loss(y, p, labels=[0, 1]), "brier": float(np.mean((p - y) ** 2))}
    out["auc"] = float(roc_auc_score(y, p)) if len(set(y)) == 2 else float("nan")
    return out


def bootstrap_ci(y, p, fn, n=BOOT, seed=SEED):
    rng = np.random.RandomState(seed)
    y, p = np.asarray(y, float), np.asarray(p, float)
    vals = []
    for _ in range(n):
        idx = rng.randint(0, len(y), len(y))
        if len(set(y[idx])) < 2:
            continue
        try:
            vals.append(fn(y[idx], p[idx]))
        except ValueError:
            continue
    if not vals:
        return (float("nan"), float("nan"))
    return (float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5)))


def paired_delta_ci(y, p_a, p_b, fn, n=BOOT, seed=SEED):
    """delta = metric(b) - metric(a)，同一重采样下标配对。"""
    rng = np.random.RandomState(seed)
    y, p_a, p_b = np.asarray(y, float), np.asarray(p_a, float), np.asarray(p_b, float)
    vals = []
    for _ in range(n):
        idx = rng.randint(0, len(y), len(y))
        if len(set(y[idx])) < 2:
            continue
        try:
            vals.append(fn(y[idx], p_b[idx]) - fn(y[idx], p_a[idx]))
        except ValueError:
            continue
    if not vals:
        return (float("nan"), float("nan"))
    return (float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5)))


# --------------------------------------------------------------------------
# 模型：接口 predict(train_df, test_df, **params) -> np.array(len(test_df))
# test_df 已按 order_index 升序
# --------------------------------------------------------------------------

def _skill_stats(df, col, alpha, prior):
    g = df.groupby(col)["correct"].agg(["sum", "count"])
    return {s: (r["sum"] + alpha * prior) / (r["count"] + alpha) for s, r in g.iterrows()}


def predict_baseline(train, test, col, alpha=1.0, **_):
    prior = float(train["correct"].mean())
    chapter_prior = train.groupby("chapter")["correct"].mean().to_dict()
    skill_p = _skill_stats(train, col, alpha, prior)
    out = []
    for _, r in test.iterrows():
        out.append(skill_p.get(r[col], chapter_prior.get(r["chapter"], prior)))
    return np.array(out)


def predict_rolling_beta(train, test, col, k=5, beta=2.0, **_):
    prior = float(train["correct"].mean())
    # 每个技能的历史作答（按伪时间）
    hist = {}
    for _, r in train.sort_values("order_index").iterrows():
        hist.setdefault(r[col], []).append(int(r["correct"]))
    # 4 参 Beta 平滑：把全局 prior 当作 2 次虚拟观测
    out, live = [], {s: list(v) for s, v in hist.items()}
    for _, r in test.iterrows():
        s = r[col]
        seq = live.get(s, [])[-k:]
        if seq:
            p = (sum(seq) + beta * prior) / (len(seq) + beta)
        else:
            p = prior
        out.append(p)
        live.setdefault(s, []).append(int(r["correct"]))
    return np.array(out)


def predict_type_prior(train, test, col=None, alpha=1.0, **_):
    """参考基线：只用题型（单选/多选/判断）的训练集正确率。粒度无关。"""
    prior = float(train["correct"].mean())
    m = train.groupby("question_type")["correct"].agg(["sum", "count"])
    p = {t: (r["sum"] + alpha * prior) / (r["count"] + alpha) for t, r in m.iterrows()}
    return np.array([p.get(r["question_type"], prior) for _, r in test.iterrows()])


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def predict_elo_skill(train, test, col, K=16.0, scale=400.0, base=1500.0, **_):
    """技能层 Elo：技能难度 + 单一用户能力。题按伪时间在线更新（一步预测）。"""
    theta = base
    diff = {}
    for _, r in train.sort_values("order_index").iterrows():
        s = r[col]
        d = diff.get(s, base)
        p = _sigmoid((theta - d) / scale * np.log(10))
        y = int(r["correct"])
        # 双人 Elo 退化到单用户：用户能力与技能难度各走半步，保持零和
        theta += K * (y - p)
        diff[s] = d - K * (y - p)
    out = []
    for _, r in test.iterrows():
        s = r[col]
        d = diff.get(s, base)
        p = _sigmoid((theta - d) / scale * np.log(10))
        y = int(r["correct"])
        theta += K * (y - p)
        diff[s] = d - K * (y - p)
        out.append(p)
    return np.array(out)


def predict_elo_item(train, test, col=None, K=16.0, scale=400.0, base=1500.0, **_):
    """题目层 Elo（参考项，与技能粒度无关）：test 里的题在 train 中都没见过 → 冷启动。"""
    theta = base
    diff = {}
    for _, r in train.sort_values("order_index").iterrows():
        d = diff.get(r["item"], base)
        p = _sigmoid((theta - d) / scale * np.log(10))
        y = int(r["correct"])
        theta += K * (y - p)
        diff[r["item"]] = d - K * (y - p)
    out = []
    for _, r in test.iterrows():
        d = diff.get(r["item"], base)
        p = _sigmoid((theta - d) / scale * np.log(10))
        y = int(r["correct"])
        theta += K * (y - p)
        diff[r["item"]] = d - K * (y - p)
        out.append(p)
    return np.array(out)


# ---- BKT-lite -------------------------------------------------------------

G_DEFAULT, S_DEFAULT = 0.2, 0.2


def _bkt_loglik(seq, L0, T, G=G_DEFAULT, S=S_DEFAULT):
    p = L0
    ll = 0.0
    for y in seq:
        pc = p * (1 - S) + (1 - p) * G
        pc = min(max(pc, 1e-9), 1 - 1e-9)
        ll += np.log(pc) if y else np.log(1 - pc)
        num_known = p * ((1 - S) if y else S)
        num_unk = (1 - p) * (G if y else (1 - G))
        post = num_known / max(num_known + num_unk, 1e-12)
        p = post + (1 - post) * T
    return ll


def fit_bkt(seq, grid_L0, grid_T):
    best = (-np.inf, None, None)
    for L0, T in itertools.product(grid_L0, grid_T):
        ll = _bkt_loglik(seq, L0, T)
        if ll > best[0]:
            best = (ll, L0, T)
    return best[1], best[2], best[0]


def predict_bkt_lite(train, test, col, **_):
    """固定 G=S=0.2，只估 prior(L0)/learn(T)。每技能一条序列（题不重复，序列=该技能的历史作答）。"""
    grid_L0 = np.round(np.arange(0.05, 1.0, 0.05), 2)
    grid_T = np.round(np.arange(0.01, 0.61, 0.01), 2)
    seqs = {}
    for _, r in train.sort_values("order_index").iterrows():
        seqs.setdefault(r[col], []).append(int(r["correct"]))

    params, diagnostics = {}, []
    prior_global = float(train["correct"].mean())
    for s, seq in seqs.items():
        L0, T, ll = fit_bkt(seq, grid_L0, grid_T)
        params[s] = (L0, T)
        diagnostics.append({
            "skill": s, "n": len(seq), "L0": float(L0), "T": float(T), "loglik": float(ll),
            "T_at_bound": bool(T >= 0.60), "L0_at_bound": bool(L0 <= 0.05 or L0 >= 0.95),
        })
    # 冷启动技能用全局参数
    cold = fit_bkt([int(x) for x in train["correct"].tolist()], grid_L0, grid_T)
    fallback = (cold[0], cold[1])

    state = {}
    for s, seq in seqs.items():
        L0, T = params[s]
        p = L0
        for y in seq:
            num_known = p * ((1 - S_DEFAULT) if y else S_DEFAULT)
            num_unk = (1 - p) * (G_DEFAULT if y else (1 - G_DEFAULT))
            post = num_known / max(num_known + num_unk, 1e-12)
            p = post + (1 - post) * T
        state[s] = p

    out = []
    for _, r in test.iterrows():
        s = r[col]
        L0, T = params.get(s, fallback)
        p = state.get(s, L0)
        pc = p * (1 - S_DEFAULT) + (1 - p) * G_DEFAULT
        y = int(r["correct"])
        out.append(pc)
        num_known = p * ((1 - S_DEFAULT) if y else S_DEFAULT)
        num_unk = (1 - p) * (G_DEFAULT if y else (1 - G_DEFAULT))
        post = num_known / max(num_known + num_unk, 1e-12)
        state[s] = post + (1 - post) * T
    return np.array(out), diagnostics


# --------------------------------------------------------------------------
# 切分与内层选参
# --------------------------------------------------------------------------

def split_time(df, frac=0.2):
    df = df.sort_values("order_index").reset_index(drop=True)
    cut = int(round(len(df) * (1 - frac)))
    return df.iloc[:cut].copy(), df.iloc[cut:].copy()


def split_skill_strat(df, col, frac=0.2, seed=SEED):
    """按技能分层抽 test；技能只有 1 条时必进 train（否则该技能无法训练）。"""
    rng = np.random.RandomState(seed)
    test_idx = []
    for s, g in df.groupby(col):
        n = len(g)
        n_test = max(1, int(round(n * frac))) if n >= 5 else 0
        if n_test:
            test_idx.extend(rng.choice(g.index.values, n_test, replace=False).tolist())
    test = df.loc[sorted(test_idx)].sort_values("order_index")
    train = df.drop(index=test_idx).sort_values("order_index")
    return train.copy(), test.copy()


def inner_folds(train, mode, col, seed=SEED):
    """只在训练集内切；time 用末 20% 单折，skill_strat 用 5 折分层。"""
    train = train.sort_values("order_index").reset_index(drop=True)
    if mode == "time":
        cut = int(round(len(train) * 0.8))
        return [(train.iloc[:cut], train.iloc[cut:])]
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    folds, y = [], train["correct"].astype(int).values
    strat = train[col].astype(str) + "|" + train["correct"].astype(str)
    # 类别太碎的技能会让 StratifiedKFold 报错，退化为按技能分层 + 随机
    try:
        for tr_i, va_i in skf.split(train, strat):
            folds.append((train.iloc[tr_i], train.iloc[va_i]))
    except ValueError:
        for tr_i, va_i in skf.split(train, y):
            folds.append((train.iloc[tr_i], train.iloc[va_i]))
    return folds


def select_params(fn, train, mode, col, grid):
    """grid: list of dict。返回 (best_params, inner_scores)。"""
    folds = inner_folds(train, mode, col)
    scores = []
    for params in grid:
        lls = []
        for tr, va in folds:
            if len(va) == 0 or len(set(va["correct"])) < 2:
                continue
            p = fn(tr.sort_values("order_index"), va.sort_values("order_index"), col, **params)
            lls.append(log_loss(va["correct"].astype(int), np.clip(p, 1e-6, 1 - 1e-6), labels=[0, 1]))
        scores.append((float(np.mean(lls)) if lls else np.inf, params))
    scores.sort(key=lambda x: x[0])
    return scores[0][1], [{"logloss": s, "params": p} for s, p in scores]


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------

MODELS = {
    "baseline-acc": (predict_baseline, [{"alpha": a} for a in (0.5, 1.0, 2.0, 5.0)]),
    "rolling-beta": (predict_rolling_beta, [{"k": k} for k in (3, 5, 10)]),
    "elo-skill": (predict_elo_skill, [{"K": k} for k in (8.0, 16.0, 32.0)]),
    "bkt-lite": (predict_bkt_lite, [{}]),
}
ELO_ITEM_GRID = [{"K": k} for k in (8.0, 16.0, 32.0)]


def compute_skill_ceiling(df):
    """技能难度到底有没有可学的真实差异？以及静态技能模型的天花板。

    * Pearson 过度离散检验：技能正确率若只是二项噪声，χ²≈df；
    * 矩估计真实技能正确率 SD（去掉二项抽样方差）；
    * 留一经验贝叶斯（LOO-EB）AUC —— 静态「技能难度」模型的乐观上限；
    * 可检测性：test 规模 n 下 AUC 的标准误 ≈ sqrt(0.25*(1/n_pos+1/n_neg))。
    """
    from scipy.stats import chi2 as chi2_dist
    p0 = float(df["correct"].mean())
    out = {"overall_acc": p0, "type_only_auc": float(
        roc_auc_score(df["correct"], df.groupby("question_type")["correct"].transform("mean")))}
    for gran, col in SKILL_COL.items():
        rec = {}
        for minn in (3, 5):
            s = df.groupby(col)["correct"].agg(["sum", "count"])
            s = s[s["count"] >= minn]
            n, k = s["count"].values.astype(float), s["sum"].values.astype(float)
            chi = float(np.sum((k - n * p0) ** 2 / (n * p0 * (1 - p0))))
            dof = len(s) - 1
            props = k / n
            var_obs = float(np.sum(n * (props - p0) ** 2) / n.sum())
            var_bin = float(np.sum(n * (p0 * (1 - p0) / n)) / n.sum())
            var_true = max(0.0, var_obs - var_bin)
            # LOO-EB：对每一行，用同技能其余行估计
            loo, lo = [], []
            for (skill, g) in df.groupby(col):
                if len(g) < minn:
                    continue
                kk, nn = int(g["correct"].sum()), len(g)
                for idx, row in g.iterrows():
                    p_hat = ((kk - row["correct"]) + p0 / var_true) / ((nn - 1) + 1 / var_true) \
                        if var_true > 0 else p0
                    loo.append(row["correct"])
                    lo.append(p_hat)
            loo_auc = float(roc_auc_score(loo, lo)) if len(set(loo)) == 2 else float("nan")
            rec[f"min{minn}_items"] = {
                "n_skills": int(len(s)), "rows": int(n.sum()),
                "chi2": chi, "df": dof, "p_dispersion": float(chi2_dist.sf(chi, dof)),
                "overdispersed": bool(chi2_dist.sf(chi, dof) < 0.05),
                "sd_observed": float(np.sqrt(var_obs)), "sd_binomial": float(np.sqrt(var_bin)),
                "sd_true_est": float(np.sqrt(var_true)),
                "loo_eb_auc": loo_auc,
            }
        out[gran] = rec
    n_test = 0.2 * len(df)
    n_pos = max(1.0, n_test * p0)
    n_neg = max(1.0, n_test * (1 - p0))
    # Hanley–McNeil AUC 标准误（A≈0.5 时最保守）
    A = 0.5
    q1, q2 = A / (2 - A), 2 * A * A / (1 + A)
    se_auc = float(np.sqrt((A * (1 - A) + (n_pos - 1) * (q1 - A * A)
                            + (n_neg - 1) * (q2 - A * A)) / (n_pos * n_neg)))
    out["detectability"] = {
        "n_test_at_20pct": round(n_test, 1),
        "n_pos": round(n_pos, 1), "n_neg": round(n_neg, 1),
        "se_auc_hanley_mcneil": se_auc,
        "se_auc_gap_paired_approx": se_auc * float(np.sqrt(2)),
        "min_detectable_auc_gap_95pct": 1.96 * se_auc * float(np.sqrt(2)),
        "n_test_needed_for_gap": {
            str(g): int(np.ceil(n_test * (1.96 * np.sqrt(2) * se_auc / g) ** 2))
            for g in (0.03, 0.05, 0.10)
        },
        "note": "差值检验的 SE≈单模型 SE×√2（同测试集配对）；SE 按 1/√n 缩放，"
                "n_test_needed_for_gap 由当前 SE 线性外推，只作数量级参考。",
    }
    return out


def main():
    if "--ceiling-only" in sys.argv:
        df = pd.read_csv(os.path.join(RES, "attempts.csv"))
        df["correct"] = df["correct"].astype(int)
        ceiling = compute_skill_ceiling(df)
        json.dump(ceiling, open(os.path.join(RES, "skill_ceiling.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(json.dumps(ceiling.get("detectability"), ensure_ascii=False, indent=1))
        return 0

    df = pd.read_csv(os.path.join(RES, "attempts.csv"))
    df["correct"] = df["correct"].astype(int)
    rows, deltas, bkt_diag, meta = [], [], {}, {"splits": {}, "inner_selection": {}}

    for split_name in ("time", "skill_strat"):
        for gran in GRANS:
            col = SKILL_COL[gran]
            if split_name == "time":
                train, test = split_time(df)
            else:
                train, test = split_skill_strat(df, col)
            meta["splits"][f"{split_name}|{gran}"] = {
                "n_train": int(len(train)), "n_test": int(len(test)),
                "test_pos_rate": float(test["correct"].mean()),
                "test_chapters": test.groupby("chapter").size().to_dict(),
                "test_skill_seen_in_train": float(test[col].isin(set(train[col])).mean()),
            }

            preds = {}
            for name, (fn, grid) in MODELS.items():
                if name == "bkt-lite":
                    # BKT 只在考点层跑（任务规格），且无超参可扫
                    if gran != "kaodian":
                        continue
                    p, diag = fn(train.sort_values("order_index"), test.sort_values("order_index"), col)
                    bkt_diag[split_name] = diag
                    best_params, inner = {}, []
                else:
                    best_params, inner = select_params(fn, train, split_name, col, grid)
                    p = fn(train.sort_values("order_index"), test.sort_values("order_index"),
                           col, **best_params)
                preds[name] = (p, best_params)
                meta["inner_selection"][f"{split_name}|{gran}|{name}"] = {
                    "chosen": best_params, "candidates": inner}

            # 题目层 Elo 只跑一次（与技能粒度无关），作为参考行；题型先验同理
            if gran == "tag":
                bp, inner = select_params(predict_elo_item, train, split_name, "item", ELO_ITEM_GRID)
                preds["elo-item(ref)"] = (
                    predict_elo_item(train.sort_values("order_index"),
                                     test.sort_values("order_index"), "item", **bp), bp)
                meta["inner_selection"][f"{split_name}|elo-item(ref)"] = {
                    "chosen": bp, "candidates": inner}
                tp, tinner = select_params(predict_type_prior, train, split_name, "item",
                                           [{"alpha": a} for a in (0.5, 1.0, 2.0, 5.0)])
                preds["type-prior(ref)"] = (
                    predict_type_prior(train.sort_values("order_index"),
                                       test.sort_values("order_index"), **tp), tp)
                meta["inner_selection"][f"{split_name}|type-prior(ref)"] = {
                    "chosen": tp, "candidates": tinner}

            y = test["correct"].values.astype(int)
            for name, (p, params) in preds.items():
                m = metrics(y, p)
                rows.append({
                    "split": split_name, "granularity": gran, "model": name,
                    "n_test": len(y), "auc": m["auc"],
                    "auc_lo": bootstrap_ci(y, p, lambda a, b: roc_auc_score(a, b))[0],
                    "auc_hi": bootstrap_ci(y, p, lambda a, b: roc_auc_score(a, b))[1],
                    "logloss": m["logloss"],
                    "ll_lo": bootstrap_ci(y, p, lambda a, b: log_loss(a, np.clip(b, 1e-6, 1 - 1e-6), labels=[0, 1]))[0],
                    "ll_hi": bootstrap_ci(y, p, lambda a, b: log_loss(a, np.clip(b, 1e-6, 1 - 1e-6), labels=[0, 1]))[1],
                    "brier": m["brier"],
                    "brier_lo": bootstrap_ci(y, p, lambda a, b: float(np.mean((b - a) ** 2)))[0],
                    "brier_hi": bootstrap_ci(y, p, lambda a, b: float(np.mean((b - a) ** 2)))[1],
                    "params": json.dumps(params, ensure_ascii=False),
                })

                if name != "baseline-acc":
                    base_p = preds["baseline-acc"][0]
                    d_auc = (m["auc"] - metrics(y, base_p)["auc"]) if len(set(y)) == 2 else float("nan")
                    d_ll = m["logloss"] - metrics(y, base_p)["logloss"]
                    d_br = m["brier"] - metrics(y, base_p)["brier"]
                    auc_ci = paired_delta_ci(y, base_p, p, lambda a, b: roc_auc_score(a, b))
                    ll_ci = paired_delta_ci(y, base_p, p,
                                            lambda a, b: log_loss(a, np.clip(b, 1e-6, 1 - 1e-6), labels=[0, 1]))
                    br_ci = paired_delta_ci(y, base_p, p, lambda a, b: float(np.mean((b - a) ** 2)))
                    deltas.append({
                        "split": split_name, "granularity": gran, "model": name,
                        "delta_auc": d_auc, "d_auc_lo": auc_ci[0], "d_auc_hi": auc_ci[1],
                        "delta_logloss": d_ll, "d_ll_lo": ll_ci[0], "d_ll_hi": ll_ci[1],
                        "delta_brier": d_br, "d_br_lo": br_ci[0], "d_br_hi": br_ci[1],
                        "verdict": ("无显著差异" if (auc_ci[0] <= 0 <= auc_ci[1]) else
                                    ("显著更好" if auc_ci[0] > 0 else "显著更差")),
                    })

    pd.DataFrame(rows).to_csv(os.path.join(RES, "metrics.csv"), index=False)
    pd.DataFrame(deltas).to_csv(os.path.join(RES, "deltas.csv"), index=False)

    ceiling = compute_skill_ceiling(df)
    json.dump(ceiling, open(os.path.join(RES, "skill_ceiling.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    if bkt_diag:
        ident = {}
        for split_name, diag in bkt_diag.items():
            d = pd.DataFrame(diag)
            ident[split_name] = {
                "n_skills": int(len(d)),
                "T_at_upper_bound": int(d["T_at_bound"].sum()),
                "L0_at_bound": int(d["L0_at_bound"].sum()),
                "T_median": float(d["T"].median()),
                "T_mean": float(d["T"].mean()),
                "skills_n_lt5": int((d["n"] < 5).sum()),
                "skills_n_lt10": int((d["n"] < 10).sum()),
            }
        json.dump({"identifiability": ident, "per_skill": bkt_diag},
                  open(os.path.join(RES, "bkt_params.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)

    json.dump(meta, open(os.path.join(RES, "run_meta.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(pd.DataFrame(rows)[["split", "granularity", "model", "n_test", "auc", "logloss",
                              "brier", "params"]].to_string(index=False))
    print("\n--- deltas vs baseline-acc ---")
    print(pd.DataFrame(deltas)[["split", "granularity", "model", "delta_auc", "d_auc_lo",
                                "d_auc_hi", "delta_logloss", "verdict"]].to_string(index=False))
    if bkt_diag:
        print("\n--- BKT identifiability ---")
        print(json.dumps(json.load(open(os.path.join(RES, "bkt_params.json")))["identifiability"],
                         ensure_ascii=False, indent=1))
    print("\n--- skill ceiling ---")
    print(json.dumps({k: v for k, v in ceiling.items() if k != "overall_acc"},
                     ensure_ascii=False, indent=1)[:2500])
    return 0


if __name__ == "__main__":
    sys.exit(main())
