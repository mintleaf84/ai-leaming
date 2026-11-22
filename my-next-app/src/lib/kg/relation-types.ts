/**
 * 教综知识图谱：关系类型登记表（代码内唯一事实来源）。
 *
 * 为什么写在代码里而不是每次读 JSON：导入/校验/读接口都要用同一份定义，
 * 运行时读 `fixtures/kg/relation_types.json` 意味着"测试能跑、线上文件缺失就炸"，
 * 且 JSON 不是可编译契约。这里与 `fixtures/kg/relation_types.json`（version 1.1）
 * 逐条对应；**类型变更走离线 schema + 改这份文件 + 重新导入**，不在产品里动态改。
 *
 * 规则（来自离线登记表）：
 * - 只增不改不删；改名或弃用标 deprecated，存量边不迁移；
 * - `evidence` 必填；无自环；一条边一个类型；
 * - `facet` 只做父节点，不得作为 prerequisite 端点；
 * - 对称关系只存一次。
 */

/** 登记表版本：导入接口的 `schemaVersion` 必须与它完全相等 */
export const RELATION_TYPES_VERSION = "1.1";

export const NODE_KINDS = [
  "concept",
  "facet",
  "work",
  "person",
  "policy",
] as const;
export type KgNodeKind = (typeof NODE_KINDS)[number];

export interface RelationTypeDefinition {
  name: string;
  label: string;
  /** SKOS 对应（无对应时写"无…"） */
  skos?: string;
  definition: string;
  /** 方向说明，人类可读 */
  direction: string;
  inverse: string;
  status: "active" | "proposed";
  example?: string;
}

export const RELATION_TYPES: readonly RelationTypeDefinition[] = [
  {
    name: "subclass",
    label: "上下位 / 分类",
    skos: "skos:broader",
    definition: "from 是 to 的一个子类/子项（同一次划分标准下）",
    direction: "child -> parent",
    inverse: "superclass",
    status: "active",
    example: "社会教育 --subclass--> 广义的教育",
  },
  {
    name: "part_of",
    label: "组成",
    skos: "无直接对应（用 partOf 扩展）",
    definition: "from 是 to 的组成部分（整体-部分，不是分类）",
    direction: "part -> whole",
    inverse: "has_part",
    status: "active",
    example: "教育内容 --part_of--> 教育影响",
  },
  {
    name: "exact_match",
    label: "同义",
    skos: "skos:exactMatch",
    definition: "两个节点在同一语境下指同一事物",
    direction: "symmetric（只存一次，from < to 字典序）",
    inverse: "exact_match",
    status: "active",
    example: "狭义的教育 --exact_match--> 学校教育",
  },
  {
    name: "prerequisite",
    label: "前驱（先修）",
    skos: "无（EduKG 的 prerequisite）",
    definition: "理解 from 是理解 to 的前提；有方向，禁止成环",
    direction: "prereq -> dependent",
    inverse: "requires",
    status: "active",
    example: "教育活动的三要素 --prerequisite--> 教育的形态",
  },
  {
    name: "marks",
    label: "标志",
    definition: "from 是 to 的标志物/里程碑，但不是其组成部分",
    direction: "marker -> marked",
    inverse: "marked_by",
    status: "active",
    example: "《大教学论》--marks--> 教育学的创立阶段",
  },
  {
    name: "related",
    label: "相关（弱边）",
    skos: "skos:related",
    definition: "无法归入上述五类的关联；不进先修排序，仅用于提示",
    direction: "symmetric",
    inverse: "related",
    status: "active",
    example: "教育目的 --related--> 教育制度",
  },
  {
    name: "represented_by",
    label: "代表人物 / 称号",
    definition: "from 由 to 代表，或 to 是 from 的代表人物/著作",
    direction: "concept -> person/work",
    inverse: "represents",
    status: "proposed",
    example: "现代教育学之父 --represented_by--> 赫尔巴特",
  },
  {
    name: "contrast",
    label: "对比",
    definition: "两者在理论上相对立或被教材并置对比",
    direction: "symmetric",
    inverse: "contrast",
    status: "proposed",
    example: "传统教育派 --contrast--> 现代教育派",
  },
  {
    name: "attribute",
    label: "属性",
    definition: "to 是 from 的一个属性/特征（不是子类）",
    direction: "subject -> attribute",
    inverse: "attribute_of",
    status: "proposed",
    example: "教育 --attribute--> 永恒性",
  },
  {
    name: "example_of",
    label: "例证",
    definition: "from 是 to 的一个例子/案例（不是子类，不参与划分）",
    direction: "example -> concept",
    inverse: "has_example",
    status: "proposed",
    example: "苏格拉底法 --example_of--> 启发式教学",
  },
  {
    name: "chronology",
    label: "时间先后",
    definition: "from 在时间上早于 to；只表示朝代/年代的先后，不表示先修或因果",
    direction: "earlier -> later",
    inverse: "later_than",
    status: "proposed",
    example: "察举制 --chronology--> 九品中正制 --chronology--> 科举制",
  },
] as const;

export type RelationTypeName = (typeof RELATION_TYPES)[number]["name"];

/** 已登记的类型名（active + proposed） */
export const RELATION_TYPE_NAMES: readonly string[] = RELATION_TYPES.map(
  (t) => t.name,
);

/** 已正式启用（proposed 导入只告警、不拦） */
export const ACTIVE_RELATION_TYPES: readonly string[] = RELATION_TYPES.filter(
  (t) => t.status === "active",
).map((t) => t.name);

export const PROPOSED_RELATION_TYPES: readonly string[] = RELATION_TYPES.filter(
  (t) => t.status === "proposed",
).map((t) => t.name);

/** 对称关系：只应存一次（双写告警，不硬拦） */
export const SYMMETRIC_RELATION_TYPES: readonly string[] = [
  "exact_match",
  "related",
  "contrast",
];

export function isRegisteredRelationType(name: string): boolean {
  return RELATION_TYPE_NAMES.includes(name);
}

export function isProposedRelationType(name: string): boolean {
  return PROPOSED_RELATION_TYPES.includes(name);
}

export function isNodeKind(value: string): value is KgNodeKind {
  return (NODE_KINDS as readonly string[]).includes(value);
}
