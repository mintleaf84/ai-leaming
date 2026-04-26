---
name: anti-patterns-avoidance
description: 本项目的历史遗留“坑”与反模式（Anti-Patterns）指南。当你在本项目中进行重构、添加新功能，特别是涉及时间处理、文本切片、Markdown解析或复杂状态机开发时，必须遵循本技能中的规范，以避免重复造轮子和重蹈覆辙。
license: Complete terms in LICENSE.txt
---

# 避坑指南：反模式与重复造轮子警示录 (Anti-Patterns Avoidance)

本项目在演进过程中，曾出现过一些典型的“差质量自造轮子”现象。为了保持代码库的健康，AI 助手在开发时必须仔细阅读并避开以下已知反模式。

## 1. 时间处理：严禁伪造时区偏移 (Fake Timezone)

**背景与坑点**：
过去在 `src/lib/utils/datetime.ts` 中存在一个 `getBeijingNow()` 方法，它通过计算北京时间和当前系统时间的 UTC 偏移量，然后直接修改原生 `Date` 对象的内部时间戳 `new Date(beijing.valueOf() + offsetMs)`。

**为什么这是反模式**：
篡改原生 `Date` 对象的时间戳来“视觉伪造”本地时间，会导致任何依赖该对象进行标准操作（如数据库 ORM 序列化、转换为 ISO 字符串等）的库产生严重错乱（错上加错）。

**正确做法**：
- 任何情况下，**原生 `Date` 对象的内部时间戳必须保持为真实的 UTC 时间**。
- 如果需要展示北京时间，必须在**最后一公里（展示/格式化阶段）**使用 `dayjs(date).tz('Asia/Shanghai').format(...)`。
- 本项目已统一使用 `dayjs` 及其 `timezone` 插件，请直接使用 `src/lib/utils/datetime.ts` 提供的 `getBeijingDateString` 等安全方法，绝对不要自己做毫秒级加减法！

## 2. RAG 文本分割：严禁半途而废的自造切片器

**背景与坑点**：
AI 相关的模块中需要进行文本分割（Chunking），过去的 `src/lib/utils/text-splitter.ts` 试图模仿 LangChain 实现递归字符切割，但为了“省事”，最终退化成了简单粗暴的 `\n\n` 分割，并且丢弃了至关重要的 Chunk Overlap（块重叠）逻辑。

**为什么这是反模式**：
对于 RAG（检索增强生成）而言，缺少语义重叠（Overlap）和精确 token 计数的切片，会极大降低检索质量和 AI 生成的准确性。

**正确做法**：
- 严禁手写基于 `split` 或正则的文本切片工具。
- 直接引入并使用业界标准的成熟库，例如 `@langchain/textsplitters` 或 `gpt-tokenizer`，它们自带完美的滑动窗口和 token 计数。

## 3. Markdown 解析：严禁使用简单正则提取结构

**背景与坑点**：
过去的代码（`markdown-parser.ts`）试图用一行正则 `/^(#{1,6})\s+(.+)$/` 逐行扫描来提取 Markdown 的章节标题。

**为什么这是反模式**：
Markdown 的语法极其复杂。简单的正则会直接被代码块内的注释 `# 标题`、引用块内的标题等边界情况击穿，导致解析逻辑崩溃。

**正确做法**：
- 必须基于 **AST (抽象语法树)** 进行解析。
- 本项目 `package.json` 中已安装了 `remark`、`rehype` 等生态工具（如 `remark-gfm`, `react-markdown` 等）。
- 需要提取结构时，请使用 `unified` 工具链将 Markdown 转为 AST，然后遍历节点树来提取标题或内容。

## 4. 复杂 UI 状态：警惕巨型 Reducer 状态机

**背景与坑点**：
练习引擎模块（`use-practice-engine.ts`）使用了一个长达 150+ 行的 `useReducer`，强行手捏了一个复杂的业务状态机（Loading -> Practicing -> Reviewing -> Finished），里面混合了队列索引管理和步骤流转。

**为什么这是反模式**：
随着状态转移条件增加，这种纯手工打造的 Reducer 会变得难以测试，状态切换容易出现竞态或死循环，维护成本极高。

**正确做法**：
- 面对涉及多阶段跳转、回退的复杂 UI 状态，优先考虑解耦。
- **职责分离**：将“数据队列（Queue）管理”与“流程步骤（Flow/Step）流转”拆分为不同的 Hook 或状态对象。
- 如果状态极其复杂，请建议引入 `XState` 等真正的状态机库，而不是继续在庞大的 `switch/case` 中打补丁。

---

**总结**：在本项目开发中，当你觉得某个基础工具类实现起来有些“恶心”或边缘情况很多时，停下来，先去搜索 `package.json` 或 NPM，大概率已经有完美的“轮子”可以用了。**KISS (简洁至上) 不等于手搓一切**，合理使用成熟标准库才是工程化的正确选择。
