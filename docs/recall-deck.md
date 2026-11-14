# 回忆自测：卡组文件与导入

> 功能说明见 `/recall` 与 `/recall/decks`；规格见
> `fj-teacher-exam-physics/docs/ai-learning-recall-spec.md`。
> 本文只讲「卡组从哪来、怎么进来、冲突怎么办」。

## 1. 卡组从哪来

**产品仓库不含任何学习卡片**（规格 §0 的硬约束）。内容由卡组文件提供：

| 卡组          | 位置                                                             | 规模           |
| ------------- | ---------------------------------------------------------------- | -------------- |
| 福建教综 2027 | `fj-teacher-exam-physics/docs/recall/fj-jiaozong-2027.deck.json` | 104 卡 / 30 组 |

卡组文件由内容仓的生成脚本产出（`tools/build_recall_deck.py`），不是手写 JSON：
脚本对每张卡的出处做逐字核对（法条引文必须在本仓语料里命中），跑两次输出逐字节相同。

## 2. 导入

**界面**：`/recall/decks` → 「导入卡组」→ 选择 `.json` 文件（或粘贴内容）。

**API**（需要 `write` scope 的 API Key）：

```bash
curl -X POST https://<站点>/api/external/recall/decks \
  -H "Authorization: Bearer $AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"json":open(sys.argv[1]).read()}))' fj-jiaozong-2027.deck.json)"
```

也可以用 CLI：

```bash
jq -Rs '{json: .}' fj-jiaozong-2027.deck.json > payload.json
curl -X POST https://<站点>/api/external/recall/decks \
  -H "Authorization: Bearer $AI_API_KEY" -H "Content-Type: application/json" \
  -d @payload.json
```

导入是**幂等**的：同一份文件重复导入，第二次 `createdCards=0`、`skippedCards=总数`，
**复习进度一行都不会动**（连 `updated_at` 都不碰）。

## 3. 冲突：保留我的 / 采用新文件

`cardId` 相同但内容变了（按 `prompt_hash` 判定），默认行为是 **keep**：

| 策略           | 内容         | 复习进度 | 冲突是否继续提示                    |
| -------------- | ------------ | -------- | ----------------------------------- |
| `keep`（默认） | 不动         | 不动     | **是**（hash 不更新，下次导入仍报） |
| `accept`       | 覆盖为新文件 | **不动** | 否                                  |

所以「忽略一次」不会让冲突永久消失；想定下来必须显式 `accept`。
进度存在另一张表（`recall_card_states`），结构上就不可能被内容更新覆盖。

文件里没有、库里有的卡：**不删除**，只回 `missingInFile[]` 供你确认。

## 4. 导出

`GET` 侧没有导出接口；界面或脚本用服务层 `exportDeck(deckKey)`。
导出只含卡组定义（groups + cards），**不含任何人的作答记录、`typedAnswer`、复习日志**。

## 5. 文件格式（schema 1）

```json
{
  "schema": 1,
  "deckId": "fj-jiaozong-2027",
  "title": "福建教综 2027",
  "groups": [{ "groupId": "L1", "title": "教育法", "order": 5 }],
  "cards": [
    {
      "cardId": "L1-c01",
      "kind": "list",
      "groupId": "L1",
      "prompt": "写出《教育法》规定的受教育者五项权利（5 条）",
      "items": [
        {
          "text": "参加教育教学计划安排的各种活动",
          "keywords": ["参加教育教学"]
        }
      ],
      "verbatim": true
    },
    {
      "cardId": "L3-c05",
      "kind": "cloze",
      "prompt": "教师资格考试合格证明有效期为【　】。",
      "blanks": [{ "answers": ["三年", "3年"] }]
    }
  ]
}
```

约束（服务端 zod 强校验，一次报全错误）：

- `schema` 只接受 `1`，未知版本**直接拒绝**（不做兼容猜测）；
- `items` ≤ 6 条，每条 `keywords` ≥ 1；`blanks` 每空 `answers` 1–3 项；
- `cardId` 在卡组内唯一；`groupId` 必须出现在 `groups` 里；
- 错误信息带定位，形如 `cards[1] (cardId=BAD-2) → blanks[0].answers: …`。

## 6. 当前内容缺口（不是 bug）

- 师德十项准则只收录 8 条：「坚定政治方向」「遵守学术规范」原文在语料中 0 命中，
  按「没有出处就不写」的规矩留空，待人工补。
- `Z` 组 6 张辨析/案例方法论卡是人工归纳（语料无对应题），措辞待复核。
- 路径第 31–46 组未出卡（首版只覆盖前 30 组）。

补完内容后重跑生成脚本 → 导入时按上面的冲突语义处理即可，进度不受影响。
