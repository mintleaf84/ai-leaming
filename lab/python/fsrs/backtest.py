#!/usr/bin/env python3
"""ai-learning.db 只读离线回测：选题算法有效性量化（v2）"""
import sqlite3, json, statistics as st
from datetime import datetime
from collections import defaultdict

con = sqlite3.connect('file:ai-learning.db?mode=ro', uri=True)
con.row_factory = sqlite3.Row
c = con.cursor()

def pts(s): return datetime.strptime(s.replace('T', ' ')[:19], '%Y-%m-%d %H:%M:%S')
def d(a, b): return (b - a).total_seconds() / 86400.0

logs = [dict(r) for r in c.execute(
    "SELECT question_id,is_correct,duration_ms,timestamp,session_id,user_id FROM practice_logs ORDER BY timestamp,id")]
for l in logs: l['ts'] = pts(l['timestamp'])

sessions = {}
for r in c.execute("SELECT id,practice_mode,created_at,user_id,total_questions,questions_json FROM practice_sessions"):
    s = dict(r)
    try:
        s['qids'] = [q.get('id') for q in json.loads(r['questions_json'])] if r['questions_json'] else []
    except Exception:
        s['qids'] = []
    s['ts'] = pts(r['created_at'])
    sessions[r['id']] = s

qtags = {}
for r in c.execute("SELECT id,tags FROM questions"):
    try: qtags[r['id']] = json.loads(r['tags']) if r['tags'] else []
    except Exception: qtags[r['id']] = []

# 每题作答序列（按用户）
hist = defaultdict(list)  # (user,q) -> [(ts, correct)]
for l in logs:
    hist[(l['user_id'], l['question_id'])].append((l['ts'], l['is_correct']))

print(f"logs={len(logs)}  sessions={len(sessions)}  questions={len(qtags)}")

# ========== 1. 模式使用 ==========
print("\n" + "="*62 + "\n【1】真实曝光：各模式推送题次占比\n" + "="*62)
mode_q = defaultdict(int)
for s in sessions.values():
    mode_q[s['practice_mode'] or 'none'] += len(s['qids'])
tot = sum(mode_q.values()) or 1
for m, n in sorted(mode_q.items(), key=lambda x: -x[1]):
    print(f"  {m:<8} {n:>5} 题次  ({n/tot:.1%})")

# ========== 2. review 陈旧偏置 ==========
print("\n" + "="*62 + "\n【2】错题本推送是否偏向陈旧错题（衰减方向检验）\n" + "="*62)
def wrong_pool(user, t):
    """t 时刻该用户『最近一次作答为错』的题 -> {q: 距那次错误的天数}"""
    pool = {}
    for (u, q), seq in hist.items():
        if u != user: continue
        last_ts, last_c = None, None
        for ts, cor in seq:
            if ts > t: break
            last_ts, last_c = ts, cor
        if last_ts is not None and last_c == 0:
            pool[q] = d(last_ts, t)
    return pool

drift, push_med_l, pool_med_l = [], [], []
for s in sessions.values():
    if s['practice_mode'] != 'review': continue
    pool = wrong_pool(s['user_id'], s['ts'])
    pushed = [pool[q] for q in s['qids'] if q in pool]
    if len(pool) >= 10 and len(pushed) >= 5:
        pm, qm = st.median(pool.values()), st.median(pushed)
        pool_med_l.append(pm); drift.append(qm - pm)
print(f"  可比 review session: {len(drift)} 个（错题池≥10 且命中≥5 题）")
if drift:
    print(f"  池中位『距上次答错』: {st.mean(pool_med_l):.1f} 天")
    print(f"  被推送题的平均漂移（推送 - 池）: {st.mean(drift):+.1f} 天")
    pos_share = sum(1 for x in drift if x > 0) / len(drift)
    print(f"  漂移为正(推陈旧)的 session 占比: {pos_share:.0%}")

# ========== 3. 再现间隔 × 再答正确率（调度质量的黄金指标） ==========
print("\n" + "="*62 + "\n【3】错题再现：间隔 vs 再答正确率（理想 SRS 应在 80%+ 区间找到节奏）\n" + "="*62)
gap_ok = defaultdict(lambda: [0, 0])
for seq in hist.values():
    for i in range(1, len(seq)):
        ts_prev, c_prev = seq[i-1]; ts, cor = seq[i]
        if c_prev == 0:  # 上次答错 → 本次是错题再现
            band = int(min(d(ts_prev, ts), 60) // 7) * 7
            g = gap_ok[band]; g[1] += 1; g[0] += cor
for band in sorted(gap_ok):
    ok, n = gap_ok[band]
    if n >= 10:
        bar = '#' * int(ok / n * 30)
        print(f"  {band:>2}-{band+7:<2}天  n={n:<4} 正确率={ok/n:5.1%} {bar}")

# ========== 4. user_mastery 预测力回放 ==========
print("\n" + "="*62 + "\n【4】user_mastery.score 回放校准（tag 级累计正确率）\n" + "="*62)
state = defaultdict(lambda: [0, 0])
pairs = []
for l in logs:
    for t in qtags.get(l['question_id'], []):
        k = (l['user_id'], t)
        ct, tt = state[k]
        if tt >= 5: pairs.append((ct/tt*100, l['is_correct']))
        state[k][1] += 1
        state[k][0] += l['is_correct']
n = len(pairs)
pos = sum(o for _, o in pairs); base = pos/n if n else 0
# AUC
sp = sorted(pairs, key=lambda x: x[0])
rs, i = 0.0, 0
while i < len(sp):
    j = i
    while j < len(sp) and sp[j][0] == sp[i][0]: j += 1
    ar = (i + j - 1)/2 + 1
    for k2 in range(i, j):
        if sp[k2][1]: rs += ar
    i = j
np_, nn = pos, n-pos
auc = (rs - np_*(np_+1)/2)/(np_*nn) if np_ and nn else float('nan')
brier = sum((p/100 - o)**2 for p, o in pairs)/n
bbase = base*(1-base)
print(f"  样本={n}（同 tag 历史≥5 次后发生的作答）  基础正确率={base:.1%}")
print(f"  AUC  = {auc:.3f}（0.5 为无信息）")
print(f"  Brier= {brier:.4f}  vs 基线 {bbase:.4f}  技巧分={1-brier/bbase:+.3f}")
bk = defaultdict(lambda: [0, 0])
for p, o in pairs:
    b = min(int(p//20)*20, 80); bk[b][1] += 1; bk[b][0] += o
print("  分段校准：")
for b in sorted(bk):
    ok, t = bk[b]
    if t >= 15:
        print(f"    预测 {b}%-{b+20}%  → 实际 {ok/t:5.1%}  (n={t})")

# 对照基线：同题上次作答对错 → 本次正确率
pw_t = pw_c = pl_t = pl_c = 0
for seq in hist.values():
    for i in range(1, len(seq)):
        if seq[i-1][1]:
            pw_t += 1; pw_c += seq[i][1]
        else:
            pl_t += 1; pl_c += seq[i][1]
print(f"  对照：同题上次答对→本次正确率 {pw_c/max(pw_t,1):.1%} (n={pw_t}) | 上次答错→本次 {pl_c/max(pl_t,1):.1%} (n={pl_t})")

# ========== 5. FSRS 利用率 ==========
print("\n" + "="*62 + "\n【5】FSRS 复习债\n" + "="*62)
now = pts('2026-08-23 03:00:00')
rows = list(c.execute("SELECT user_id,question_id,due_date,state,reps,lapses FROM question_srs"))
due = [r for r in rows if r['due_date'] and pts(r['due_date']) <= now]
print(f"  SRS 卡片={len(rows)}, 截至备份日到期未处理={len(due)} ({len(due)/max(len(rows),1):.0%})")
by_user = defaultdict(int)
for r in due: by_user[r['user_id']] += 1
print(f"  到期分布(user:张数): {dict(by_user)}")
lapses = sum(r['lapses'] for r in rows)
print(f"  总 lapse 次数={lapses}（lapses 高但 score 不降 = mastery 与 FSRS 信号不互通的旁证）")

print("\n回测完成。数据不含选题 trace，以上为可回放的外部行为指标。")
