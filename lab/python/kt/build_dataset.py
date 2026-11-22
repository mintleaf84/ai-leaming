#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识追踪（KT）离线回测：数据集构建。

两个数据源：

  --source offline   （默认）本地导出的教综1680 answers plan
      /public/home/cjb/data/jiaozong_1680/output/questions.jsonl
      /public/home/cjb/data/jiaozong_1680/output/api/p1c{1..6}_answers_plan.json
      → 472 次作答 / 472 道不同题 / 无时间戳 / 零重复（导入产物）

  --source zhuoyu    线上实例（真实作答）
      GET /api/external/practice/sessions?limit=100&offset=...
      GET /api/external/practice/sessions/{id}
      需要环境变量 ZY_KEY（Bearer token）；不提供默认值，避免把密钥写进仓库。
      原始 JSON 缓存在 --cache-dir（默认 /tmp/opencode/zy_cache），不进仓库；
      仓库里只落脱敏 CSV。

技能粒度：
  tag          题库 tags 的**最深路径**（叶子）。线上 tags 是「树路径 + 扁平关键词」混装，
               348 条是路径、472 条是扁平概念，所以叶子才是唯一不重复计数的口径。
  tag_chapter  顶层桶（教育学/教育心理学/心理学/时政/其他）—— 线上唯一有足够观测的粗层。
  kaodian      章 × 考点：题目 → 图谱节点 → 节点讲义印刷页 → 考点页区间。
  node         图谱节点：词面匹配（题干 3 / 选项 2 / 解析 1），取 top-2。

  图谱只有「教育学篇 ch1–ch6」；线上真实作答的题大多不是这 1834 道题，
  映射不上的行一律标 `__unmapped__`，由 backtest 判定是否可评估（不静默丢弃）。

用法：
  ZY_KEY=... /public/apps/anaconda3/bin/python build_dataset.py --source zhuoyu
  /public/apps/anaconda3/bin/python build_dataset.py --source offline
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA = "/public/home/cjb/data/jiaozong_1680"
DEFAULT_OUT = os.path.join(HERE, "results")
ZY_BASE = "https://zhuoyu.887780.xyz"
ZY_UA = "Mozilla/5.0 ai-leaming-import/1.0"
ZY_CACHE = "/tmp/opencode/zy_cache"

USER = "cjb"

# 题库 tags 是章级单标签（offline）；这份映射按 create_questions.json 实测得出。
CHAPTER_TAG = {
    1: "教育与教育学",
    2: "教育的基本规律",
    3: "教育目的",
    4: "教育制度",
    5: "学生与教师",
    6: "课程",
}

TYPE_ORDER = {"单项选择题": 0, "多项选择题": 1, "判断题": 2}
CANON_CHAPTERS = ("教育学", "教育心理学", "心理学", "时政")


# --------------------------------------------------------------------------
# 讲义考点页区间（从 marked 文本解析，避免和 kg_coverage.py 的硬编码漂移）
# --------------------------------------------------------------------------

def load_kaodian_ranges(data_root):
    """返回 {chapter: [(code, title, start, end), ...]}。"""
    starts = {}
    for ch in range(1, 7):
        path = os.path.join(data_root, "source", "lecture", f"ch{ch}_marked.txt")
        page, items = None, []
        with open(path, encoding="utf-8") as f:
            for line in f:
                m = re.search(r"\[\[P(\d+)\]\]", line)
                if m:
                    page = int(m.group(1))
                mm = re.match(r"\s*(考点[一二三四五六七八九十]+)\s+(.*)", line)
                if mm:
                    items.append((mm.group(1), mm.group(2).strip(), page))
        if not items:
            raise SystemExit(f"ch{ch} 没解析出考点标题")
        starts[ch] = items

    ranges = {}
    for ch, items in starts.items():
        next_starts = [pg for its in starts.values() for (_, _, pg) in its]
        chapter_end = min([s for s in next_starts if s > items[-1][2]] or [107]) - 1
        out = []
        for i, (code, title, start) in enumerate(items):
            end = items[i + 1][2] - 1 if i + 1 < len(items) else chapter_end
            out.append((code, title, start, end))
        ranges[ch] = out
    return ranges


# --------------------------------------------------------------------------
# 图谱节点与词面匹配（复制自 kg/map_wrong.py，见模块 docstring）
# --------------------------------------------------------------------------

PERSON_TO_STAGE = {
    "孔子": "教育学的萌芽阶段", "孟子": "教育学的萌芽阶段", "荀子": "教育学的萌芽阶段",
    "墨子": "教育学的萌芽阶段", "学记": "教育学的萌芽阶段", "苏格拉底": "教育学的萌芽阶段",
    "柏拉图": "教育学的萌芽阶段", "亚里士多德": "教育学的萌芽阶段", "昆体良": "教育学的萌芽阶段",
    "夸美纽斯": "教育学的创立阶段", "赫尔巴特": "教育学的创立阶段", "杜威": "教育学的创立阶段",
    "卢梭": "教育学的创立阶段", "裴斯泰洛齐": "教育学的创立阶段", "洛克": "教育学的创立阶段",
    "蔡元培": "教育学的发展阶段", "陶行知": "教育学的发展阶段", "陈鹤琴": "教育学的发展阶段",
    "朱熹": "教育的起源", "沛西·能": "教育的起源", "利托尔诺": "教育的起源", "孟禄": "教育的起源",
    "赞科夫": "教育学的发展阶段", "布鲁纳": "教育学的发展阶段", "瓦根舍因": "教育学的发展阶段",
    "巴班斯基": "教育学的发展阶段",
}

TEXT_ALIAS = {
    "显学": "儒墨显学", "四大私学": "儒墨显学", "稷下": "稷下学宫",
    "产婆术": "苏格拉底法", "五步教学法": "教学阶段",
    "新增专业": "人才培养规格与教育结构",
    "撤销一些专业": "人才培养规格与教育结构",
    "政治发展": "教育对政治的反作用",
    "可能的劳动力": "劳动力再生产",
    "广义教育": "广义的教育", "狭义教育": "狭义的教育",
    "现实的教育目的": "现实（发展性）的教育目的",
    "理想的教育目的": "理想（终极性）的教育目的",
    "马克思主义关于人的全面发展学说": "马克思主义人的全面发展学说",
}


def latest_edges(data_root, chapter):
    for name in (f"ch{chapter}-edges-v3.json", f"ch{chapter}-edges-v2.json",
                 f"ch{chapter}-edges-v1.json"):
        p = os.path.join(data_root, "kg", f"ch{chapter}", name)
        if os.path.exists(p):
            return p
    raise SystemExit(f"找不到第{chapter}章边文件")


def load_chapter_graph(data_root, chapter):
    d = json.load(open(latest_edges(data_root, chapter), encoding="utf-8"))
    nodes, node_page = set(), {}
    for e in d["edges"]:
        for n in (e["from"], e["to"]):
            nodes.add(n)
    for n in nodes:
        pages = [e.get("printed_page") for e in d["edges"]
                 if n in (e["from"], e["to"]) and e.get("printed_page")]
        if pages:
            node_page[n] = min(pages)
    return sorted(nodes, key=len, reverse=True), node_page


def load_umbrella(data_root, chapter):
    try:
        cfg = json.load(open(os.path.join(data_root, "kg", "umbrella.json"), encoding="utf-8"))
        return set(cfg.get("chapters", {}).get(str(chapter), {}).get("umbrella", []))
    except FileNotFoundError:
        return set()


def match_nodes(q, nodes, umbrella, max_hits=2):
    """词面匹配：题干 3 / 选项 2 / 解析 1。返回 [(node, score), ...]。"""
    stem = q.get("stem") or ""
    opts = " ".join((q.get("options") or {}).values()) if isinstance(q.get("options"), dict) \
        else " ".join(q.get("options") or [])
    expl = q.get("explanation") or ""

    def score_of(name, s, o, e):
        return (3 if name in s else 0) + (2 if name in o else 0) + (1 if name in e else 0)

    score = {}
    for n in nodes:
        sc = score_of(n, stem, opts, expl)
        if n == "教育影响" and re.search(r"教育影响(最|很|较|极)", stem):
            sc -= 3
        if sc > 0:
            score[n] = sc

    node_set = set(nodes)
    for key, node_name in TEXT_ALIAS.items():
        sc = score_of(key, stem, opts, expl)
        if sc > 0 and node_name in node_set:
            score[node_name] = max(score.get(node_name, 0), sc + 4)

    for key, stage in PERSON_TO_STAGE.items():
        sc = score_of(key, stem, opts, expl)
        if sc > 0 and stage in node_set:
            score[stage] = max(score.get(stage, 0), sc)

    for base in ("家庭教育", "学校教育", "社会教育"):
        sc = score_of(base, stem, opts, expl)
        if sc <= 0:
            continue
        target = f"形态·{base}" if re.search(r"形态|特点|空间|划分", stem) else f"广义教育·{base}"
        if target in node_set:
            score[target] = max(score.get(target, 0), sc)

    for school in ("批判教育学", "实用主义教育学", "制度教育学"):
        if school in stem and "教育学的发展阶段" in node_set:
            score["教育学的发展阶段"] = max(score.get("教育学的发展阶段", 0), 3)

    score = {n: sc for n, sc in score.items() if n not in umbrella}

    matched = list(score)
    drop = {a for a in matched for b in matched
            if a != b and len(a) < len(b) and a in b and score.get(b, 0) >= 2}
    if drop:
        score = {n: sc for n, sc in score.items() if n not in drop}

    if not score:
        return []
    top = max(score.values())
    return [(n, sc) for n, sc in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))
            if sc >= max(1, top - 1)][:max_hits]


def kaodian_of_page(chapter, page, ranges):
    for code, title, start, end in ranges[chapter]:
        if start <= page <= end:
            return f"ch{chapter}:{code}:{title[:18]}"
    return None


# --------------------------------------------------------------------------
# offline：本地 answers plan
# --------------------------------------------------------------------------

def build_offline(data_root, out):
    ranges = load_kaodian_ranges(data_root)
    questions = {}
    with open(os.path.join(data_root, "output", "questions.jsonl"), encoding="utf-8") as f:
        for line in f:
            q = json.loads(line)
            if q["part"]["index"] != 1:
                continue
            questions[q["id"]] = q

    plans = []
    for ch in range(1, 7):
        p = os.path.join(data_root, "output", "api", f"p1c{ch}_answers_plan.json")
        d = json.load(open(p, encoding="utf-8"))
        m = re.match(r"jz1680-p1c(\d+)-(\d{4}-\d{2}-\d{2})", d.get("sessionKey", ""))
        session_date = m.group(2) if m else ""
        for a in d["answers"]:
            ext = a["externalId"]
            qid = ext.split("_", 1)[1].upper()
            plans.append({
                "chapter": ch, "externalId": ext, "item": qid,
                "session_date": session_date,
                "userAnswer": a.get("userAnswer"),
                "correct": 1 if a.get("isCorrect") else 0,
                "duration_ms": a.get("durationMs"),
            })

    def pseudo_key(p):
        q = questions[p["item"]]
        return (p["chapter"], TYPE_ORDER.get(q["section_type"], 9), q["number"])
    plans.sort(key=pseudo_key)
    for i, p in enumerate(plans):
        p["order_index"] = i

    graphs = {ch: load_chapter_graph(data_root, ch) for ch in range(1, 7)}
    umbrellas = {ch: load_umbrella(data_root, ch) for ch in range(1, 7)}

    rows, skill_rows, no_node = [], [], []
    node_hits, kaodian_hits = Counter(), Counter()
    skill_item_count = {}

    def _add(g, s, item):
        skill_item_count.setdefault((g, s), set()).add(item)

    for p in plans:
        q = questions[p["item"]]
        ch = p["chapter"]
        nodes, node_page = graphs[ch]
        hits = match_nodes(q, nodes, umbrellas[ch])

        tag = CHAPTER_TAG.get(ch, f"ch{ch}")
        if hits:
            node_primary = hits[0][0]
            node_list = [h[0] for h in hits]
            pages = [node_page[n] for n in node_list if n in node_page]
            kd = kaodian_of_page(ch, min(pages), ranges) if pages else None
            kd = kd or f"__chapter_ch{ch}__"
        else:
            node_primary, node_list, kd = f"__chapter_ch{ch}__", [], f"__chapter_ch{ch}__"
            no_node.append({"item": p["item"], "chapter": ch, "number": q["number"],
                            "stem": (q.get("stem") or "")[:60]})

        node_hits[node_primary] += 1
        kaodian_hits[kd] += 1
        for g, s in (("tag", tag), ("kaodian", kd), ("node", node_primary)):
            _add(g, s, p["item"])

        rows.append({
            "user": USER, "item": p["item"], "chapter": ch,
            "section_type": q["section_type"],
            "skill_tag": tag, "skill_tag_chapter": tag,
            "skill_kaodian": kd, "skill_node": node_primary,
            "correct": p["correct"], "order_index": p["order_index"],
            "duration_ms": p["duration_ms"], "has_timestamp": 0,
            "session_date": p["session_date"], "session_id": f"offline-ch{ch}",
            "mode": "offline", "started_at": "",
            "question_type": q["question_type"],
            "n_nodes": len(node_list), "node_list": "|".join(node_list),
            "n_tag_leaves": 1, "tag_leaf_list": tag,
            "source": "offline",
        })

        for g, skill, w in (("tag", tag, 1.0), ("tag_chapter", tag, 1.0),
                            ("kaodian", kd, 1.0)):
            skill_rows.append({"user": USER, "item": p["item"], "granularity": g,
                               "skill": skill, "weight": w, "correct": p["correct"],
                               "order_index": p["order_index"]})
        for n in node_list:
            skill_rows.append({"user": USER, "item": p["item"], "granularity": "node",
                               "skill": n, "weight": 1.0 / len(node_list),
                               "correct": p["correct"], "order_index": p["order_index"]})

    _write(out, rows, skill_rows, "offline")

    def _items_per(sizes):
        v = sorted(sizes)
        return {"min": v[0], "median": v[len(v) // 2], "max": v[-1]}

    facts = {
        "source": "offline",
        "attempts": len(rows),
        "unique_items": len({r["item"] for r in rows}),
        "repeat_attempts": len(rows) - len({r["item"] for r in rows}),
        "has_absolute_timestamp": False,
        "timestamp_evidence": {
            "answers_plan_keys": ["externalId", "userAnswer", "isCorrect", "durationMs"],
            "durationMs_unique_values": sorted({r["duration_ms"] for r in rows}),
            "session_dates": dict(Counter(r["session_date"] for r in rows)),
            "note": "answers plan 只有常量 durationMs=60000，无绝对时间；"
                    "sessionKey 只到日期粒度；生产 practice_logs 有 timestamp 列，但离线导出未包含。",
        },
        "skills": {
            g: {"n_skills": len({s for (gg, s) in skill_item_count if gg == g}),
                "items_per_skill": _items_per([len(v) for (gg, _), v in skill_item_count.items()
                                               if gg == g])}
            for g in ("tag", "kaodian", "node")
            if any(gg == g for (gg, _) in skill_item_count)
        },
        "node_count_distribution": {str(k): c for k, c in
                                    sorted(Counter(r["n_nodes"] for r in rows).items())},
        "items_without_node": {"count": len(no_node),
                               "pct": round(len(no_node) / len(rows), 4),
                               "detail": no_node},
        "accuracy_overall": round(sum(r["correct"] for r in rows) / len(rows), 4),
        "accuracy_by_chapter": {
            str(ch): round(sum(r["correct"] for r in rows if r["chapter"] == ch)
                           / max(1, sum(1 for r in rows if r["chapter"] == ch)), 4)
            for ch in range(1, 7)},
        "accuracy_by_question_type": {
            t: {"n": sum(1 for r in rows if r["question_type"] == t),
                "acc": round(sum(r["correct"] for r in rows if r["question_type"] == t)
                             / max(1, sum(1 for r in rows if r["question_type"] == t)), 4)}
            for t in sorted({r["question_type"] for r in rows})},
        "kaodian_ranges": {str(ch): [[c, t, s0, e] for c, t, s0, e in rs]
                           for ch, rs in ranges.items()},
        "top_kaodian_skills": kaodian_hits.most_common(40),
        "top_node_skills": node_hits.most_common(30),
    }
    json.dump(facts, open(os.path.join(out, "data_facts.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return rows, skill_rows, facts


# --------------------------------------------------------------------------
# zhuoyu：线上真实作答
# --------------------------------------------------------------------------

def _zy_get(url, key, tries=6):
    """带 UA 与 Bearer 的 GET；Cloudflare 偶发空响应，重试直到拿到合法 JSON。"""
    last = None
    for i in range(tries):
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {key}",
            "User-Agent": ZY_UA,
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
            return json.loads(raw.decode("utf-8"))
        except Exception as e:  # 网络抖动/空 body/非 JSON
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"GET 失败 {url}: {last}")


def fetch_zhuoyu(cache_dir, key):
    """拉全部会话列表 + 详情，缓存到 cache_dir。返回 (sessions, failures)。"""
    os.makedirs(cache_dir, exist_ok=True)
    list_path = os.path.join(cache_dir, "sessions.json")
    sessions, failures = [], []
    if os.path.exists(list_path):
        sessions = json.load(open(list_path, encoding="utf-8"))
    else:
        off = 0
        while True:
            d = _zy_get(f"{ZY_BASE}/api/external/practice/sessions?limit=100&offset={off}", key)
            batch = d.get("data") or []
            sessions += batch
            total = (d.get("meta") or {}).get("total", len(sessions))
            off += len(batch)
            if not batch or len(sessions) >= total:
                break
        json.dump(sessions, open(list_path, "w", encoding="utf-8"), ensure_ascii=False)

    for s in sessions:
        path = os.path.join(cache_dir, f"d_{s['id']}.json")
        if os.path.exists(path):
            try:
                if "questions" in json.load(open(path, encoding="utf-8")):
                    continue
            except Exception:
                pass
        try:
            d = _zy_get(f"{ZY_BASE}/api/external/practice/sessions/{s['id']}", key)
            if "questions" not in d:
                raise RuntimeError("响应缺 questions")
            json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False)
        except Exception as e:
            failures.append({"session": s["id"], "error": str(e)})
    return sessions, failures


def zy_leaf_tags(tags):
    ts = set(tags or [])
    return sorted({t for t in ts if not any(o != t and o.startswith(t + "/") for o in ts)})


def zy_tag_chapter(tags):
    tops = {t.split("/")[0] for t in (tags or [])}
    for c in CANON_CHAPTERS:
        if c in tops:
            return c
    return "其他"


def zy_question_type(correct_answer, user_answer):
    """只用于 type-prior 参考基线；**判分一律用服务端 isCorrect**，不重算。"""
    ca = str(correct_answer if correct_answer is not None else "")
    if ca in ("正确", "错误"):
        return "judgment"
    if ca.startswith("["):
        try:
            return "multi" if len(json.loads(ca)) > 1 else "single"
        except Exception:
            return "multi"
    s = ca.strip()
    if "," in s or "，" in s:
        return "multi"
    if len(s) == 1 and s in "ABCDEF":
        return "single"
    if len(s) > 1 and all(ch in "ABCDEF" for ch in s):
        return "multi"
    return "other"


def _norm(x):
    return re.sub(r"[\s\u3000]", "", x or "")


def build_zhuoyu(data_root, out, cache_dir, key):
    ranges = load_kaodian_ranges(data_root)

    # 1680 题库：内容 → 题目（仅第一篇 ch1–6 有图谱）
    bank = {}
    with open(os.path.join(data_root, "output", "questions.jsonl"), encoding="utf-8") as f:
        for line in f:
            q = json.loads(line)
            bank[_norm(q.get("stem") or "")] = q
    graphs = {ch: load_chapter_graph(data_root, ch) for ch in range(1, 7)}
    umbrellas = {ch: load_umbrella(data_root, ch) for ch in range(1, 7)}

    sessions, failures = fetch_zhuoyu(cache_dir, key)
    raw = []
    fetch_report = []
    for s in sessions:
        path = os.path.join(cache_dir, f"d_{s['id']}.json")
        if not os.path.exists(path):
            continue
        d = json.load(open(path, encoding="utf-8"))
        qs = d.get("questions") or []
        fetch_report.append({"session": s["id"], "mode": s.get("mode"),
                             "declared": s.get("totalQuestions"), "returned": len(qs),
                             "name": s.get("name")})
        for i, q in enumerate(qs):
            raw.append({"q": q, "s": s, "idx": i})

    real_modes = {"review", "random"}
    real = [r for r in raw if r["s"].get("mode") in real_modes]
    imp = [r for r in raw if r["s"].get("mode") == "import"]
    other = [r for r in raw if r["s"].get("mode") not in real_modes and r["s"].get("mode") != "import"]

    # order_index 的依据：会话 startedAt（服务器只有会话级时间）+ 会话 id + API questions[]
    # 数组下标。接口没有逐题时间戳，所以同一会话内的先后只能用它返回的顺序，不能解释成精确时刻。
    real.sort(key=lambda r: (r["s"]["startedAt"], r["s"]["id"], r["idx"]))
    rows, skill_rows, mapped_stats = [], [], Counter()
    tag_leaf_counts, tag_ch_counts = Counter(), Counter()
    node_hits = Counter()

    for order, r in enumerate(real):
        q, s = r["q"], r["s"]
        leaves = zy_leaf_tags(q.get("tags"))
        primary = sorted(leaves, key=lambda t: (-t.count("/"), -len(t), t))[0] if leaves else "未分类"
        chap = zy_tag_chapter(q.get("tags"))

        # 图谱映射：内容必须精确命中 1680 题库（仅第一篇）
        bq = bank.get(_norm(q.get("content")))
        ch, node_list, kd = 0, [], "__unmapped__"
        if bq is not None and bq.get("part", {}).get("index") == 1:
            ch = bq["chapter"]["index"]
            nodes, node_page = graphs[ch]
            hits = match_nodes(bq, nodes, umbrellas[ch])
            if hits:
                node_list = [h[0] for h in hits]
                pages = [node_page[n] for n in node_list if n in node_page]
                kd = (kaodian_of_page(ch, min(pages), ranges) if pages else None) \
                    or f"__chapter_ch{ch}__"
        node_primary = node_list[0] if node_list else "__unmapped__"

        tag_leaf_counts[primary] += 1
        tag_ch_counts[chap] += 1
        node_hits[node_primary] += 1
        mapped_stats["kaodian" if kd != "__unmapped__" else "kaodian_unmapped"] += 1

        rows.append({
            "user": "prod", "item": str(q.get("questionId")), "chapter": ch,
            "section_type": zy_question_type(q.get("correctAnswer"), q.get("userAnswer")),
            "skill_tag": primary, "skill_tag_chapter": chap,
            "skill_kaodian": kd, "skill_node": node_primary,
            "correct": 1 if q.get("isCorrect") else 0,
            "order_index": order,
            "duration_ms": q.get("durationMs"), "has_timestamp": 1,
            "session_date": s["startedAt"][:10], "session_id": s["id"],
            "mode": s.get("mode"), "started_at": s["startedAt"],
            "question_type": zy_question_type(q.get("correctAnswer"), q.get("userAnswer")),
            "n_nodes": len(node_list), "node_list": "|".join(node_list),
            "n_tag_leaves": len(leaves), "tag_leaf_list": "|".join(leaves),
            "source": "zhuoyu",
        })

        for g, skill, w in (("tag", primary, 1.0), ("tag_chapter", chap, 1.0)):
            skill_rows.append({"user": "prod", "item": str(q.get("questionId")),
                               "granularity": g, "skill": skill, "weight": w,
                               "correct": rows[-1]["correct"], "order_index": order})
        if node_list:
            for n in node_list:
                skill_rows.append({"user": "prod", "item": str(q.get("questionId")),
                                   "granularity": "node", "skill": n,
                                   "weight": 1.0 / len(node_list),
                                   "correct": rows[-1]["correct"], "order_index": order})
        if kd != "__unmapped__":
            skill_rows.append({"user": "prod", "item": str(q.get("questionId")),
                               "granularity": "kaodian", "skill": kd, "weight": 1.0,
                               "correct": rows[-1]["correct"], "order_index": order})

    os.makedirs(out, exist_ok=True)
    _write(out, rows, skill_rows, "zhuoyu")

    # import 会话单独落盘：只能当「题目覆盖/初始能力」，不能当时间序列
    imp_rows = []
    for r in imp:
        q, s = r["q"], r["s"]   # 必须取本条记录自己的会话，不能用上一轮遗留的 s
        leaves = zy_leaf_tags(q.get("tags"))
        imp_rows.append({
            "item": str(q.get("questionId")), "session_id": s["id"], "mode": "import",
            "started_at": s["startedAt"], "tags": "|".join(q.get("tags") or []),
            "skill_tag": sorted(leaves, key=lambda t: (-t.count("/"), -len(t), t))[0] if leaves else "未分类",
            "skill_tag_chapter": zy_tag_chapter(q.get("tags")),
            "correct": 1 if q.get("isCorrect") else 0,
            "duration_ms": q.get("durationMs"),
            "question_type": zy_question_type(q.get("correctAnswer"), q.get("userAnswer")),
        })
    with open(os.path.join(out, "attempts_import.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(imp_rows[0].keys()) if imp_rows else ["item"])
        w.writeheader()
        w.writerows(imp_rows)

    # 数据事实
    item_counts = Counter(r["item"] for r in rows)
    def dist(c):
        v = sorted(c.values())
        return {"n": len(c), "median": float(v[len(v) // 2]), "mean": round(sum(v) / len(v), 2),
                "min": v[0], "max": v[-1],
                "lt5": sum(1 for x in v if x < 5), "lt10": sum(1 for x in v if x < 10),
                "ge50": sum(1 for x in v if x >= 50)}
    durs = sorted(int(r["duration_ms"] or 0) for r in rows)
    repeat_hist = Counter(item_counts.values())
    facts = {
        "source": "zhuoyu",
        "sessions_listed": len(sessions),
        "sessions_fetched": len(fetch_report),
        "sessions_empty_or_partial": [x for x in fetch_report
                                      if x["returned"] != x["declared"]],
        "fetch_failures": failures,
        "attempts_api_declared": sum(s.get("totalQuestions") or 0 for s in sessions),
        "attempts_received": len(raw),
        "by_mode": dict(Counter(r["s"].get("mode") for r in raw)),
        "real_attempts": len(rows),
        "real_sessions": len({r["session_id"] for r in rows}),
        "import_attempts": len(imp_rows),
        "other_mode_attempts": len(other),
        "other_mode_sessions": [{"id": r["s"]["id"], "mode": r["s"].get("mode"),
                                 "name": r["s"].get("name")} for r in other[:5]],
        "date_span_real": [rows[0]["started_at"], rows[-1]["started_at"]] if rows else [],
        "active_days": len({r["session_date"] for r in rows}),
        "has_absolute_timestamp": True,
        "duration_ms": {"median": durs[len(durs) // 2], "p90": durs[int(len(durs) * 0.9)],
                        "max": durs[-1], "eq_60000": sum(1 for x in durs if x == 60000),
                        "zero": sum(1 for x in durs if x == 0)},
        "unique_items": len(item_counts),
        "repeat_attempts": len(rows) - len(item_counts),
        "repeat_distribution": {str(k): v for k, v in sorted(repeat_hist.items())},
        "items_repeated": sum(v for k, v in repeat_hist.items() if k >= 2),
        "items_ge5": sum(v for k, v in repeat_hist.items() if k >= 5),
        "accuracy_overall": round(sum(r["correct"] for r in rows) / len(rows), 4),
        "accuracy_by_type": {t: round(sum(r["correct"] for r in rows if r["question_type"] == t)
                                      / max(1, sum(1 for r in rows if r["question_type"] == t)), 4)
                             for t in sorted({r["question_type"] for r in rows})},
        "tag_rows_mixed": {
            "rows_with_path_tag": sum(1 for r in rows if "/" in r["tag_leaf_list"]),
            "rows_all_flat": sum(1 for r in rows if r["n_tag_leaves"] and "/" not in r["tag_leaf_list"]),
            "rows_multi_leaf": sum(1 for r in rows if r["n_tag_leaves"] > 1),
        },
        "skill_obs": {"tag": dist(tag_leaf_counts), "tag_chapter": dist(tag_ch_counts)},
        "graph_mapping": {
            "rows_mapped": sum(1 for r in rows if r["skill_node"] != "__unmapped__"),
            "items_mapped": len({r["item"] for r in rows if r["skill_node"] != "__unmapped__"}),
            "coverage_pct": round(100 * sum(1 for r in rows if r["skill_node"] != "__unmapped__")
                                  / max(1, len(rows)), 2),
            "kaodian_only_rows": mapped_stats["kaodian"],
        },
        "top_skills": {"tag": tag_leaf_counts.most_common(20),
                       "tag_chapter": tag_ch_counts.most_common(),
                       "node": node_hits.most_common(10)},
    }
    json.dump(facts, open(os.path.join(out, "data_facts.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(json.dumps({k: facts[k] for k in
                      ("sessions_listed", "sessions_fetched", "attempts_received", "by_mode",
                       "real_attempts", "unique_items", "repeat_attempts", "date_span_real",
                       "skill_obs", "graph_mapping", "accuracy_overall")},
                     ensure_ascii=False, indent=1))
    return rows, skill_rows, facts


# --------------------------------------------------------------------------
# 落盘
# --------------------------------------------------------------------------

COLS = ["user", "item", "chapter", "section_type", "skill_tag", "skill_tag_chapter",
        "skill_kaodian", "skill_node", "correct", "order_index", "duration_ms",
        "has_timestamp", "session_date", "session_id", "mode", "started_at",
        "question_type", "n_nodes", "node_list", "n_tag_leaves", "tag_leaf_list", "source"]


def _write(out, rows, skill_rows, name):
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "attempts.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(out, "item_skills.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["user", "item", "granularity", "skill",
                                          "weight", "correct", "order_index"])
        w.writeheader()
        w.writerows(skill_rows)
    print(f"写出：{os.path.join(out, 'attempts.csv')}（{len(rows)} 行）")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["offline", "zhuoyu"], default="offline")
    ap.add_argument("--data-root", default=DEFAULT_DATA)
    ap.add_argument("--out", default=None)
    ap.add_argument("--cache-dir", default=ZY_CACHE)
    args = ap.parse_args()

    if args.source == "offline":
        out = args.out or DEFAULT_OUT
        build_offline(args.data_root, out)
    else:
        key = os.environ.get("ZY_KEY", "").strip()
        if not key:
            raise SystemExit("缺少环境变量 ZY_KEY（Bearer token）。不要把密钥写进仓库。")
        out = args.out or os.path.join(DEFAULT_OUT, "zhuoyu")
        build_zhuoyu(args.data_root, out, args.cache_dir, key)
    return 0


if __name__ == "__main__":
    sys.exit(main())
