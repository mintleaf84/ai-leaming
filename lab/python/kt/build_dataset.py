#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""教综 1680 · 知识追踪（KT）离线回测：数据集构建。

产出 long-format（一次作答一行）attempts.csv，以及多标签展开表 item_skills.csv。

数据来源（全部只读）：
  /public/home/cjb/data/jiaozong_1680/
    output/questions.jsonl                     题库（1834 条，教育学篇 851 条）
    output/api/p1c{1..6}_answers_plan.json     作答（共 472 条客观题）
    kg/ch{N}/ch{N}-edges-v*.json               图谱边（技能定义）
    source/lecture/ch{N}_marked.txt            讲义正文（[[P印刷页]]，考点页区间）

三个技能粒度：
  tag      题库 tags —— 实测每题只有 1 个章级标签（不是树形路径），等价于「章」粒度。
  kaodian  章 × 考点 —— 由命中图谱节点的 printed_page 落到讲义考点页区间得到；
           推不出就退化为章级伪技能 `__chapter_chN__`。
  node     图谱节点 —— 词面匹配（题干 3 / 选项 2 / 解析 1，长名优先），取 top-2。

映射逻辑复制自 kg/map_wrong.py（2026-11-22 版本），**有意不 import**：那个文件正被
另一个会话修改，import 会让本次回测不可复现。复制部分仅含词面匹配/伞节点过滤/别名，
不含任何回测逻辑。

用法：
  /public/apps/anaconda3/bin/python build_dataset.py [--data-root ...] [--out ...]
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA = "/public/home/cjb/data/jiaozong_1680"
DEFAULT_OUT = os.path.join(HERE, "results")

CN_NUM = "一二三四五六七八九十"
USER = "cjb"

# 题库 tags 是章级单标签；这份映射按 create_questions.json 实测得出。
CHAPTER_TAG = {
    1: "教育与教育学",
    2: "教育的基本规律",
    3: "教育目的",
    4: "教育制度",
    5: "学生与教师",
    6: "课程",
}

TYPE_NUM = {"single_choice": 1, "multi_choice": 2, "judgment": 5}
TYPE_ORDER = {"单项选择题": 0, "多项选择题": 1, "判断题": 2}


# --------------------------------------------------------------------------
# 讲义考点页区间（从 marked 文本解析，避免和 kg_coverage.py 的硬编码漂移）
# --------------------------------------------------------------------------

def load_kaodian_ranges(data_root):
    """返回 {chapter: [(code, title, start, end), ...]}。

    chapter_end 用下一章考点一起始页 - 1，最后一章用 107（第六章末页，实测）。
    """
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
    """返回 (nodes, node_page)：node_page 取该节点出现的最小讲义印刷页。"""
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
    """词面匹配：题干 3 / 选项 2 / 解析 1。返回 [(node, score), ...]（已过滤伞节点与父名吞噬）。"""
    stem = q.get("stem") or ""
    opts = " ".join((q.get("options") or {}).values())
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

    # 父名 ⊂ 子名且子节点强命中时删父名（「学制」vs「癸卯学制」）
    matched = list(score)
    drop = {a for a in matched for b in matched
            if a != b and len(a) < len(b) and a in b and score.get(b, 0) >= 2}
    if drop:
        score = {n: sc for n, sc in score.items() if n not in drop}

    if not score:
        return []
    top = max(score.values())
    hits = [(n, sc) for n, sc in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))
            if sc >= max(1, top - 1)][:max_hits]
    return hits


def kaodian_of_page(chapter, page, ranges):
    for code, title, start, end in ranges[chapter]:
        if start <= page <= end:
            return f"ch{chapter}:{code}:{title[:18]}"
    return None


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=DEFAULT_DATA)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    data_root, out = args.data_root, args.out
    os.makedirs(out, exist_ok=True)

    ranges = load_kaodian_ranges(data_root)

    questions = {}
    with open(os.path.join(data_root, "output", "questions.jsonl"), encoding="utf-8") as f:
        for line in f:
            q = json.loads(line)
            if q["part"]["index"] != 1:
                continue
            questions[q["id"]] = q

    # 作答：每个 externalId 只会出现一次（实测 472 条 / 472 唯一题）
    plans = []
    for ch in range(1, 7):
        p = os.path.join(data_root, "output", "api", f"p1c{ch}_answers_plan.json")
        d = json.load(open(p, encoding="utf-8"))
        m = re.match(r"jz1680-p1c(\d+)-(\d{4}-\d{2}-\d{2})", d.get("sessionKey", ""))
        session_date = m.group(2) if m else ""
        for a in d["answers"]:
            ext = a["externalId"]                       # jz1680_jz00001
            qid = ext.split("_", 1)[1].upper()          # JZ00001
            plans.append({
                "chapter": ch,
                "externalId": ext,
                "item": qid,
                "session_date": session_date,
                "userAnswer": a.get("userAnswer"),
                "correct": 1 if a.get("isCorrect") else 0,
                "duration_ms": a.get("durationMs"),
            })

    # 伪时间：章序 → 题型序 → 题号（章节顺序反映学习推进；见 RESULTS.md 的时间戳说明）
    def pseudo_key(p):
        q = questions[p["item"]]
        return (p["chapter"], TYPE_ORDER.get(q["section_type"], 9), q["number"])
    plans.sort(key=pseudo_key)
    for i, p in enumerate(plans):
        p["order_index"] = i

    graphs = {ch: load_chapter_graph(data_root, ch) for ch in range(1, 7)}
    umbrellas = {ch: load_umbrella(data_root, ch) for ch in range(1, 7)}

    rows, skill_rows, no_node, ambig = [], [], [], 0
    node_hits, kaodian_hits = Counter(), Counter()
    skill_item_count = defaultdict(set)

    for p in plans:
        q = questions[p["item"]]
        ch = p["chapter"]
        nodes, node_page = graphs[ch]
        hits = match_nodes(q, nodes, umbrellas[ch])

        tag = CHAPTER_TAG.get(ch, f"ch{ch}")
        if hits:
            node_primary, node_score = hits[0][0], hits[0][1]
            node_list = [h[0] for h in hits]
            pages = [node_page[n] for n in node_list if n in node_page]
            kd = kaodian_of_page(ch, min(pages), ranges) if pages else None
            if kd is None:
                kd = f"__chapter_ch{ch}__"
        else:
            node_primary, node_list, node_score = f"__chapter_ch{ch}__", [], 0
            kd = f"__chapter_ch{ch}__"
            no_node.append({"item": p["item"], "chapter": ch,
                            "section_type": q["section_type"], "number": q["number"],
                            "stem": (q.get("stem") or "")[:60]})

        node_hits[node_primary] += 1
        kaodian_hits[kd] += 1
        skill_item_count[("node", node_primary)].add(p["item"])
        skill_item_count[("kaodian", kd)].add(p["item"])
        skill_item_count[("tag", tag)].add(p["item"])

        rows.append({
            "user": USER, "item": p["item"], "chapter": ch,
            "section_type": q["section_type"],
            "skill_tag": tag, "skill_kaodian": kd, "skill_node": node_primary,
            "correct": p["correct"], "order_index": p["order_index"],
            "duration_ms": p["duration_ms"], "has_timestamp": 0,
            "session_date": p["session_date"],
            "question_type": q["question_type"],
            "n_nodes": len(node_list), "node_list": "|".join(node_list),
            "node_score": node_score,
        })

        # 多标签展开：节点层按 1/n 均摊（单标签模型可忽略 weight）
        for g, skill, w in (("tag", tag, 1.0), ("kaodian", kd, 1.0)):
            skill_rows.append({"user": USER, "item": p["item"], "granularity": g,
                               "skill": skill, "weight": w, "correct": p["correct"],
                               "order_index": p["order_index"]})
        for n in node_list:
            skill_rows.append({"user": USER, "item": p["item"], "granularity": "node",
                               "skill": n, "weight": 1.0 / len(node_list),
                               "correct": p["correct"], "order_index": p["order_index"]})

    cols = ["user", "item", "chapter", "section_type", "skill_tag", "skill_kaodian",
            "skill_node", "correct", "order_index", "duration_ms", "has_timestamp",
            "session_date", "question_type", "n_nodes", "node_list", "node_score"]
    with open(os.path.join(out, "attempts.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    with open(os.path.join(out, "item_skills.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["user", "item", "granularity", "skill",
                                          "weight", "correct", "order_index"])
        w.writeheader()
        w.writerows(skill_rows)

    # 数据事实
    n_nodes_dist = Counter(r["n_nodes"] for r in rows)
    facts = {
        "attempts": len(rows),
        "unique_items": len({r["item"] for r in rows}),
        "repeat_attempts": len(rows) - len({r["item"] for r in rows}),
        "has_absolute_timestamp": False,
        "timestamp_evidence": {
            "answers_plan_keys": ["externalId", "userAnswer", "isCorrect", "durationMs"],
            "durationMs_unique_values": sorted({r["duration_ms"] for r in rows}),
            "session_dates": dict(Counter(r["session_date"] for r in rows)),
            "note": "answers plan 只有常量 durationMs=60000，无绝对时间；"
                    "sessionKey 只到日期粒度；生产 practice_logs 有 timestamp 列，但本机无该库导出。",
        },
        "skills": {
            g: {"n_skills": len({s for (gg, s) in skill_item_count if gg == g}),
                "items_per_skill": {
                    "min": min(len(v) for (gg, s), v in skill_item_count.items() if gg == g),
                    "median": sorted(len(v) for (gg, s), v in skill_item_count.items() if gg == g)[
                        len([1 for (gg, _) in skill_item_count if gg == g]) // 2],
                    "max": max(len(v) for (gg, s), v in skill_item_count.items() if gg == g),
                }}
            for g in ("tag", "kaodian", "node")
        },
        "node_count_distribution": {str(k): v for k, v in sorted(n_nodes_dist.items())},
        "items_without_node": {"count": len(no_node), "pct": round(len(no_node) / len(rows), 4),
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
        "kaodian_ranges": {str(ch): [[c, t, s, e] for c, t, s, e in rs]
                           for ch, rs in ranges.items()},
        "top_kaodian_skills": kaodian_hits.most_common(40),
        "top_node_skills": node_hits.most_common(30),
    }
    with open(os.path.join(out, "data_facts.json"), "w", encoding="utf-8") as f:
        json.dump(facts, f, ensure_ascii=False, indent=1)

    print(json.dumps({k: facts[k] for k in
                      ("attempts", "unique_items", "repeat_attempts", "has_absolute_timestamp",
                       "skills", "node_count_distribution", "accuracy_overall")},
                     ensure_ascii=False, indent=1))
    print(f"\n未命中节点：{len(no_node)}/{len(rows)} ({len(no_node)/len(rows):.1%})")
    print("写出：", os.path.join(out, "attempts.csv"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
