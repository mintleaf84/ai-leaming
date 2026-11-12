import { expect, test, type Page } from "@playwright/test";

/**
 * 布局护栏（layout guard）公共判定逻辑
 *
 * 目标：不依赖截图基线，只断言「结构不变量」——
 *   1. 页面没有横向溢出（documentElement / 移动端 main 容器两级）；
 *   2. 主容器可见且渲染出了真实文本（不是骨架、不是错误边界）；
 *   3. 375px 视口下没有元素越出视口右侧；
 *   4. 375px 视口下报告可点区域 < 44×44 与表单双列（报告模式，不阻断）；
 *   5. 375px 视口下不存在两条互相重叠的贴底固定底栏（§6：一个页面最多一条）。
 *
 * 之所以不用截图对比：截图会被字体渲染、动画首帧、机器 DPI 影响，
 * 在 CI 上极易 flaky，且失败时无法定位到底哪个元素出了问题。
 * 这里全部用几何量（getBoundingClientRect / scrollWidth）判定，
 * 失败信息直接带 selector + 坐标。
 *
 * ⚠️ 所有 page.evaluate 的函数体都会被序列化到浏览器里执行，
 * 模块作用域的常量/变量在那边不存在。这里一律通过 evaluate 的第二个
 * 参数把常量传进去（曾经踩过引用模块常量导致 ReferenceError 的坑）。
 */

/** 失败信息里最多列几条越界元素：够定位又读得下去 */
const MAX_REPORTED = 5;

/** 移动端报告里最多列几条明细（报告模式，只在 annotation / console 里汇总） */
const MAX_MOBILE_ITEMS = 10;

/**
 * 单页 DOM 节点预算。
 *
 * 护栏对所有节点做几何扫描（第一趟只读 getBoundingClientRect，成本可控），
 * **不再静默截断**：截断会让越界元素悄悄漏检。代价是节点数直接决定耗时，
 * 所以超过预算就判定该页大到一个"单页布局护栏"已失去意义，直接失败。
 */
const NODE_BUDGET = 8000;

/**
 * 允许横向滚动的容器（ui-system.md §7：移动端禁止用 overflow-x-auto 包表格，
 * 横向滚动只允许出现在代码块与富文本内部）。
 */
const SANCTIONED_SCROLL_SELECTOR = "pre, code, .prose, [data-scroll-ok]";

/**
 * 骨架标记：本项目的 Skeleton 组件是 `.shimmer`（见 components/ui/skeleton.tsx），
 * 外加常见 data-slot 约定。
 * 刻意**不**用 `.animate-pulse`：该 class 也被「思考中光标 / 计时器暂停 /
 * 侧边栏用户骨架」等合法用途使用，拿来判骨架会稳定误报。
 */
export const SKELETON_SELECTOR = '.shimmer, [data-slot="skeleton"]';

/** 移动端最小可点尺寸（ui-system.md §6.2） */
const MIN_TAP_TARGET = 44;

/**
 * `overflow-x: hidden` 的裁剪容忍度（px）。
 *
 * hidden 不产生滚动条，但**会把内容裁掉**：移动端拿 hidden 包一张宽表格，
 * 页面照样"没有横向溢出"，内容却少了一截。所以只豁免亚像素/阴影级别的
 * 轻微裁剪，超过这个量就按缺陷上报（表格无论裁多少都上报）。
 */
const CLIP_TOLERANCE = 8;

/**
 * 底部窗口高度（px）：`rect.top >= innerHeight - 160` 且 `rect.bottom <= innerHeight`
 * 的 `position: fixed` 元素才算「底栏候选」。
 *
 * 为什么用窗口而不是「贴底 Npx」：`MobileNav` 锚在
 * `bottom-[calc(1.5rem+safe-area)]`，底边离视口底 24px；真机 safe-area 不为 0 时
 * 底边会离得更远（`env(safe-area-inset-bottom)` 叠加），任何固定的小阈值都会漏掉它。
 * 160px 覆盖「导航整高 64px + 24px 下边距 + safe-area 余量 + 页面级操作条整高 ~56px」，
 * 同时不会把 body 中段随手 `fixed` 的浮层算进来。
 */
const BOTTOM_BAR_WINDOW = 160;

/** 视口边缘判定容忍度（px）：吸收亚像素/阴影，用于识别「铺满整屏」的固定遮罩 */
const VIEWPORT_EDGE_TOLERANCE = 8;

/** 单个越界元素的最小描述：够定位即可，不 dump 整个 DOM */
export interface OversizeElement {
  /** 尽量可读的选择器：tag#id.class1.class2[data-testid=...] */
  selector: string;
  tag: string;
  id: string | null;
  /** 只取前 3 个 class，避免超长字符串 */
  className: string;
  testId: string | null;
  /** 视口坐标（getBoundingClientRect） */
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
  };
  /** 超出视口右边的像素数 */
  overflowPx: number;
  /**
   * 该元素越界时被哪个祖先的 overflow-x 兜住。
   * - `overflowX: "auto" | "scroll"` 且 `sanctioned=true`：代码块/富文本，合法；
   * - `overflowX: "auto" | "scroll"` 且 `sanctioned=false`：用横向滚动装表格，按 §7 应改为卡片；
   * - `overflowX: "hidden"`：内容被**裁掉**（不是滚动），按 clipAmount 判定是否属于缺陷。
   */
  scrollContainer: {
    selector: string;
    overflowX: string;
    sanctioned: boolean;
    /** 容器被裁掉的宽度（scrollWidth - clientWidth），hidden 时用于判断"轻微溢出" */
    clipAmount: number;
    /** 越界元素属于表格（含 table/thead/tbody/tr/td/th 及其内部元素） */
    tableLike: boolean;
  } | null;
}

/** 移动端硬约束的**报告**数据（不阻断，见 assertLayoutIntact 末尾） */
export interface MobileReport {
  smallTapTargetCount: number;
  smallTapTargets: Array<{ selector: string; width: number; height: number }>;
  twoColumnFormCount: number;
  twoColumnForms: Array<{ selector: string; gridTemplateColumns: string }>;
}

/**
 * 贴底的 `position: fixed` 元素（移动端「底栏」）。
 *
 * ui-system.md §6：一个移动端页面最多一条固定底栏 —— 两条贴底固定元素同时存在，
 * 必然有一方被压住/抢走点击。这里只记录几何量，重叠判定在采集阶段两两算。
 */
export interface BottomBar {
  selector: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  };
}

/** 一对互相重叠的底栏（同时给出双方 selector + rect，便于直接定位） */
export interface BottomBarOverlap {
  a: BottomBar;
  b: BottomBar;
  /** 相交区域面积（px²）；> 0 才算重叠 */
  overlapArea: number;
}

/** 一次采样得到的全部几何数据 */
/** 未被授权的局部横向滚动容器（典型：拿着 overflow-x:auto 装宽表格的工具栏） */
export interface LocalScrollContainer {
  selector: string;
  overflowX: string;
  /** scrollWidth - clientWidth */
  overflowAmount: number;
}

export interface LayoutProbe {
  viewportWidth: number;
  viewportHeight: number;
  /** documentElement.scrollWidth */
  documentScrollWidth: number;
  /** <main> 自身的滚动宽度 */
  main: { scrollWidth: number; clientWidth: number } | null;
  /** 实际扫描的元素数（全量，不截断） */
  totalNodes: number;
  /** 越界元素总数（oversize 只保留前 MAX_REPORTED 个） */
  oversizeCount: number;
  oversize: OversizeElement[];
  /** 是否在本次采样中做了右边缘扫描（只在 ≤375 视口做） */
  oversizeScanned: boolean;
  /** 375 视口下未授权的**局部**横向滚动容器（内容比容器宽，但没越出视口） */
  localScroll: LocalScrollContainer[];
  localScrollCount: number;
  /** 采样时仍可见的骨架标记（应为空） */
  skeletonsVisible: string[];
  /** 仅 ≤375 视口采集；其他视口为 null */
  mobile: MobileReport | null;
  /** 仅 ≤375 视口采集的贴底固定元素 */
  bottomBars: BottomBar[];
  /** 底栏两两重叠（应为空：一个页面最多一条固定底栏） */
  bottomBarOverlaps: BottomBarOverlap[];
}

/** gotoAndSettle 的结果，供用例记录 annotation */
export interface NavigationResult {
  status: number | null;
  /** 10s 内是否到达 networkidle（超时不算失败，只记录） */
  networkIdle: boolean;
  /** 骨架是否在 10s 内消失（结果由采集阶段的 skeletonsVisible 兜底断言） */
  skeletonResolved: boolean;
}

/** 失败信息里统一带上 路由 + 视口，避免只看到一句 expect 失败 */
function label(route: string, viewport: string): string {
  return `路由 ${route} @ ${viewport}`;
}

/**
 * 跳到目标路由并等待「真实内容」就绪（而不是等一个固定时长）。
 *
 * 顺序：
 *   1. 校验 HTTP 状态码 —— 404/500 页面同样有 main/heading，不校验就是假绿；
 *   2. 等 networkidle（10s 上限；有 SSE/长轮询时到不了，超时只记录不算失败）；
 *   3. 等骨架消失（10s 上限，超时不在这一步失败，由采集阶段兜底）；
 *   4. 等 fonts.ready + 双 rAF + 300ms 静置，避开 framer-motion 首帧位移动画。
 */
export async function gotoAndSettle(
  page: Page,
  route: string,
  viewport: string,
): Promise<NavigationResult> {
  const where = label(route, viewport);

  const response = await page.goto(route);
  const status = response ? response.status() : null;
  expect(
    status !== null && status >= 200 && status < 300,
    `${where}：路由返回 status=${status}（要求 2xx）。404/500 页面同样会渲染 main 与 heading，不校验状态码会把"页面不存在/服务端出错"当成通过；3xx 说明重定向没被跟随到终点。`,
  ).toBe(true);

  let networkIdle = true;
  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    // 页面有 SSE / 轮询时 networkidle 永远不会到达，这不是缺陷，只记录
    networkIdle = false;
  }

  let skeletonResolved = true;
  await page
    .waitForFunction(
      (selector) => {
        const nodes = Array.from(document.querySelectorAll(selector));
        return nodes.every((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return true;
          const cs = getComputedStyle(el);
          return cs.visibility === "hidden" || cs.display === "none";
        });
      },
      SKELETON_SELECTOR,
      { timeout: 10_000 },
    )
    .catch(() => {
      skeletonResolved = false;
    });

  await page
    .evaluate(async () => {
      if (document.fonts) await document.fonts.ready;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    })
    .catch(() => {
      // 页面正在导航/重渲染时 evaluate 可能被打断，静置后采样即可，不算失败
    });
  await page.waitForTimeout(300);

  return { status, networkIdle, skeletonResolved };
}

/** 采集几何数据（不做断言） */
export async function collectLayoutProbe(page: Page): Promise<LayoutProbe> {
  return page.evaluate<
    LayoutProbe,
    {
      maxReported: number;
      maxMobileItems: number;
      sanctionedSelector: string;
      skeletonSelector: string;
      minTapTarget: number;
      clipTolerance: number;
      bottomBarWindow: number;
      edgeTolerance: number;
    }
  >(
    ({
      maxReported,
      maxMobileItems,
      sanctionedSelector,
      skeletonSelector,
      minTapTarget,
      clipTolerance,
      bottomBarWindow,
      edgeTolerance,
    }) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const nonLayoutTags = new Set([
        "script",
        "style",
        "link",
        "meta",
        "noscript",
        "template",
        "title",
        "head",
        "br",
        "col",
        "source",
        "track",
      ]);

      const describe = (el: Element): string => {
        let out = el.tagName.toLowerCase();
        if (el.id) out += `#${el.id}`;
        const cls =
          typeof el.className === "string"
            ? el.className.trim().split(/\s+/).filter(Boolean)
            : [];
        if (cls.length > 0) out += `.${cls.slice(0, 3).join(".")}`;
        const testId = el.getAttribute("data-testid");
        if (testId) out += `[data-testid="${testId}"]`;
        return out;
      };

      const isRendered = (el: Element, rect: DOMRect): boolean => {
        if (rect.width <= 0 || rect.height <= 0) return false;
        const cs = getComputedStyle(el);
        return cs.display !== "none" && cs.visibility !== "hidden";
      };

      /** 表格类元素：移动端应改为卡片（ui-system.md §4 / §7） */
      const tableTags = new Set([
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "td",
        "th",
        "caption",
        "colgroup",
      ]);
      const isTableLike = (el: Element): boolean =>
        tableTags.has(el.tagName.toLowerCase()) || !!el.closest("table");

      /**
       * 找到最近的、把横向溢出兜住的祖先容器。
       * <main> / <body> 是「页面级」滚动容器（根 layout 的 main 带
       * overflow-y-auto，按 CSS 规则 overflow-x 会计算成 auto），
       * 元素在它们这一层越界就是页面溢出本身，不算被容器兜住。
       */
      const findScrollContainer = (
        el: Element,
      ): { el: Element; overflowX: string } | null => {
        let parent = el.parentElement;
        while (parent && parent !== document.documentElement) {
          if (
            parent === document.body ||
            parent.tagName.toLowerCase() === "main"
          ) {
            return null;
          }
          const ox = getComputedStyle(parent).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden") {
            const pr = parent.getBoundingClientRect();
            // 容器自身在视口内，才谈得上"兜住"
            if (pr.left >= -1 && pr.right <= vw + 1) {
              return { el: parent, overflowX: ox };
            }
          }
          parent = parent.parentElement;
        }
        return null;
      };

      const nodes = document.body
        ? Array.from(document.body.querySelectorAll("*"))
        : [];

      /**
       * 右边缘扫描：只在移动端视口做（宽屏允许超宽元素，例如横向图表）。
       * 第一趟只读几何（廉价）筛出越界元素，第二趟才对候选查 style 与祖先链。
       */
      const scanOversize = vw <= 375;
      const violations: OversizeElement[] = [];
      const localScroll: LocalScrollContainer[] = [];
      let localScrollCount = 0;

      if (scanOversize) {
        const candidates: Array<{ el: Element; rect: DOMRect }> = [];
        for (const el of nodes) {
          if (nonLayoutTags.has(el.tagName.toLowerCase())) continue;
          // 纯装饰层（aria-hidden / data-decorative）允许出血：它们不承载内容，
          // 被 overflow-hidden 裁掉不影响可读性（如 dashboard 的模糊光斑）
          if (el.closest('[aria-hidden="true"], [data-decorative]')) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (rect.right <= vw + 1) continue;
          candidates.push({ el, rect });
        }

        for (const { el, rect } of candidates) {
          if (!isRendered(el, rect)) continue;

          const container = findScrollContainer(el);
          const sanctioned = container
            ? !!container.el.closest(sanctionedSelector)
            : false;
          const containerClip = container
            ? Math.max(0, container.el.scrollWidth - container.el.clientWidth)
            : 0;
          // 实际被裁掉/溢出多少：元素自身越界的量 + 容器自身裁掉的量，取大者。
          // 只看元素越界量会漏掉「容器很窄、元素在里面被裁掉一大截」的情况。
          const clipAmount = Math.max(
            Math.round(rect.right - vw),
            Math.round(containerClip),
          );
          const tableLike = isTableLike(el);

          if (container && container.overflowX === "hidden") {
            // hidden 不产生滚动条，但内容会被裁掉 —— 只有可忽略的量
            // （阴影/亚像素抖动）才豁免；裁多了或裁的是表格，照样上报。
            if (!tableLike && clipAmount <= clipTolerance) continue;
          } else if (container && sanctioned) {
            // 代码块/富文本内部的横向滚动是 §7 允许的例外
            continue;
          }

          violations.push({
            selector: describe(el),
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className:
              typeof el.className === "string"
                ? el.className.slice(0, 120)
                : "",
            testId: el.getAttribute("data-testid"),
            rect: {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              right: Math.round(rect.right),
            },
            overflowPx: Math.round(rect.right - vw),
            scrollContainer: container
              ? {
                  selector: describe(container.el),
                  overflowX: container.overflowX,
                  sanctioned,
                  clipAmount,
                  tableLike,
                }
              : null,
          });
        }

        // 溢出最多的排前面，明细里先看到最严重的
        violations.sort((a, b) => b.overflowPx - a.overflowPx);

        // 局部横向滚动容器：内容比容器宽但没越出视口，右边缘扫描抓不到。
        // 按 ui-system.md §7，移动端除 pre/code/.prose/[data-scroll-ok] 外
        // 不允许出现横向滚动容器（宽表格应改卡片）。
        for (const el of nodes) {
          if (el.closest('[aria-hidden="true"], [data-decorative]')) continue;
          if (el.closest(sanctionedSelector)) continue;
          const cs = getComputedStyle(el);
          const ox = cs.overflowX;
          if (ox !== "auto" && ox !== "scroll") continue;
          const amount = el.scrollWidth - el.clientWidth;
          if (amount <= 1) continue;
          if (el.clientWidth <= 0) continue;
          localScrollCount += 1;
          if (localScroll.length < maxReported) {
            localScroll.push({
              selector: describe(el),
              overflowX: ox,
              overflowAmount: Math.round(amount),
            });
          }
        }
        localScroll.sort((a, b) => b.overflowAmount - a.overflowAmount);
      }

      const skeletonsVisible = Array.from(
        document.querySelectorAll(skeletonSelector),
      )
        .filter((el) => isRendered(el, el.getBoundingClientRect()))
        .slice(0, maxReported)
        .map(describe);

      // 移动端硬约束（报告模式）只在 375 及更窄的视口采集
      let mobile: MobileReport | null = null;
      if (vw <= 375) {
        const smallTapTargets: MobileReport["smallTapTargets"] = [];
        let smallTapTargetCount = 0;
        for (const el of Array.from(
          document.querySelectorAll('button, a[href], [role="button"]'),
        )) {
          const rect = el.getBoundingClientRect();
          if (!isRendered(el, rect)) continue;
          // 允许 0.5px 的亚像素取整误差
          if (
            rect.width >= minTapTarget - 0.5 &&
            rect.height >= minTapTarget - 0.5
          ) {
            continue;
          }
          smallTapTargetCount += 1;
          if (smallTapTargets.length < maxMobileItems) {
            smallTapTargets.push({
              selector: describe(el),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        }

        const twoColumnForms: MobileReport["twoColumnForms"] = [];
        let twoColumnFormCount = 0;
        // 计算值可能是 "repeat(2, minmax(0px, 1fr))" 也可能是展开后的
        // "183.5px 183.5px"，两种都按列数判断
        const countColumns = (value: string): number => {
          if (!value || value === "none") return 0;
          const repeat = /repeat\(\s*(\d+)/.exec(value);
          if (repeat) return Number(repeat[1]);
          return value.split(/\s+/).filter(Boolean).length;
        };
        for (const form of Array.from(document.querySelectorAll("form"))) {
          for (const el of [form, ...Array.from(form.querySelectorAll("*"))]) {
            const cs = getComputedStyle(el);
            if (cs.display !== "grid") continue;
            const columns = countColumns(cs.gridTemplateColumns);
            if (columns < 2) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0) continue;
            twoColumnFormCount += 1;
            if (twoColumnForms.length < maxMobileItems) {
              twoColumnForms.push({
                selector: describe(el),
                gridTemplateColumns: cs.gridTemplateColumns,
              });
            }
          }
        }

        mobile = {
          smallTapTargetCount,
          smallTapTargets,
          twoColumnFormCount,
          twoColumnForms,
        };
      }

      /**
       * 底栏（ui-system.md §6：一个移动端页面最多一条固定底栏）。
       *
       * 判定口径：`position: fixed`，且整个元素落在视口底部 160px 窗口内
       * （`rect.top >= vh - 160` 且 `rect.bottom <= vh`）—— 不用「贴底 Npx」这种魔数，
       * 因为 `MobileNav` 底边离视口底的距离随 safe-area 变化。
       * 刻意排除三类：
       *   - 装饰层（aria-hidden / data-decorative）与 pre/code/.prose 内部（富文本工具栏）；
       *   - 铺满整屏的固定遮罩（dialog scrim / 全屏 loading）：rect.top ≤ 1 且高度≈视口高，
       *     它盖住一切是设计意图，与「两条底栏抢位置」不是一回事；
       *   - 互为祖先/后代的固定元素：子元素作为底栏内容被定位在底栏内，
       *     属于同一条底栏的内部结构，不是两条。
       */
      const bottomBars: BottomBar[] = [];
      const bottomBarOverlaps: BottomBarOverlap[] = [];
      if (vw <= 375) {
        const candidates: Array<{ el: Element; bar: BottomBar }> = [];
        for (const el of nodes) {
          if (nonLayoutTags.has(el.tagName.toLowerCase())) continue;
          if (el.closest('[aria-hidden="true"], [data-decorative]')) continue;
          if (el.closest(sanctionedSelector)) continue;
          if (getComputedStyle(el).position !== "fixed") continue;
          const rect = el.getBoundingClientRect();
          if (!isRendered(el, rect)) continue;
          // 底部窗口：底边不出视口，顶边进入底部 160px
          if (rect.bottom > vh + edgeTolerance) continue;
          if (rect.top < vh - bottomBarWindow) continue;
          if (rect.top <= 1 && rect.height >= vh - edgeTolerance) continue;
          candidates.push({
            el,
            bar: {
              selector: describe(el),
              rect: {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                right: Math.round(rect.right),
                bottom: Math.round(rect.bottom),
              },
            },
          });
        }

        for (const candidate of candidates) bottomBars.push(candidate.bar);

        for (let i = 0; i < candidates.length; i += 1) {
          for (let j = i + 1; j < candidates.length; j += 1) {
            const first = candidates[i];
            const second = candidates[j];
            if (first.el.contains(second.el) || second.el.contains(first.el)) {
              continue;
            }
            const a = first.bar.rect;
            const b = second.bar.rect;
            const overlapWidth =
              Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapHeight =
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (overlapWidth <= 0 || overlapHeight <= 0) continue;
            bottomBarOverlaps.push({
              a: first.bar,
              b: second.bar,
              overlapArea: Math.round(overlapWidth * overlapHeight),
            });
          }
        }
      }

      const mainEl = document.querySelector("main");

      return {
        viewportWidth: vw,
        viewportHeight: vh,
        documentScrollWidth: document.documentElement.scrollWidth,
        main: mainEl
          ? {
              scrollWidth: mainEl.scrollWidth,
              clientWidth: mainEl.clientWidth,
            }
          : null,
        totalNodes: nodes.length,
        oversizeCount: violations.length,
        oversize: violations.slice(0, maxReported),
        oversizeScanned: scanOversize,
        localScroll,
        localScrollCount,
        skeletonsVisible,
        mobile,
        bottomBars,
        bottomBarOverlaps,
      };
    },
    {
      maxReported: MAX_REPORTED,
      maxMobileItems: MAX_MOBILE_ITEMS,
      sanctionedSelector: SANCTIONED_SCROLL_SELECTOR,
      skeletonSelector: SKELETON_SELECTOR,
      minTapTarget: MIN_TAP_TARGET,
      clipTolerance: CLIP_TOLERANCE,
      bottomBarWindow: BOTTOM_BAR_WINDOW,
      edgeTolerance: VIEWPORT_EDGE_TOLERANCE,
    },
  );
}

/**
 * 记录报告项：annotation（进 HTML 报告）+ console（进 CI 日志）。
 * test.info() 在非用例上下文会抛，这里降级为只打日志。
 */
function annotate(type: string, description: string): void {
  try {
    test.info().annotations.push({ type, description });
  } catch {
    // 拿不到当前用例信息时降级，报告信息仍在 console 里
  }
}

/**
 * 判断页面是否落到「整页级崩溃」。两个来源：
 *   a) `src/components/ErrorBoundary.tsx` —— `<h2>出错了</h2>`，**没有** `role="alert"`，
 *      只能靠「main 内文案」识别（只认 alert 会把渲染崩溃判成通过）；
 *   b) `src/app/error.tsx` → `ErrorState` 组件，本身带 `role="alert"`。
 *
 * 词表刻意只收「整页级崩溃」文案：`ErrorState` 的默认标题「加载失败」不在其中，
 * 局部失败（某张卡片加载失败 + 重试按钮）不会被误判成整页崩溃。
 * 返回 null 表示正常。
 */
export async function detectPageError(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const crashPattern = /出错了|页面出错了|渲染出错|something went wrong/i;
    const alertPattern = /出错了|页面出错|something went wrong/i;
    const squash = (text: string) => text.replace(/\s+/g, " ").trim();

    // 整页级崩溃：ErrorBoundary 的 fallback 是普通 div/h2，没有 alert 角色
    const mainEl = document.querySelector("main");
    const mainText = squash((mainEl as HTMLElement | null)?.innerText || "");
    if (crashPattern.test(mainText)) {
      return `main 文案命中崩溃词表：${mainText.slice(0, 200)}`;
    }

    const alertEl = Array.from(
      document.querySelectorAll('[role="alert"], [role="alertdialog"]'),
    ).find((el) => alertPattern.test(el.textContent || ""));
    if (alertEl) {
      return `role="alert"：${squash(alertEl.textContent || "").slice(0, 200)}`;
    }

    return null;
  });
}

/**
 * 移动端硬约束的报告（报告模式，不阻断）。
 *
 * 必须在任何会抛错的断言之前调用：页面一旦横向溢出，溢出断言先抛错，
 * 这里的 annotation 与 console 汇总就再也不会执行，清单会整批丢失。
 */
function reportMobileConstraints(probe: LayoutProbe, where: string): void {
  if (!probe.mobile) return;
  const {
    smallTapTargetCount,
    smallTapTargets,
    twoColumnFormCount,
    twoColumnForms,
  } = probe.mobile;

  if (smallTapTargetCount > 0) {
    const summary = `${where}：${smallTapTargetCount} 个可点元素小于 ${MIN_TAP_TARGET}×${MIN_TAP_TARGET}（报告模式，不影响结果）：${JSON.stringify(smallTapTargets)}`;
    annotate("mobile-tap-target", summary);
    console.warn(summary);
  }
  if (twoColumnFormCount > 0) {
    const summary = `${where}：表单内 ${twoColumnFormCount} 个 grid 容器在 375px 下仍是多列（报告模式，不影响结果）：${JSON.stringify(twoColumnForms)}`;
    annotate("mobile-form-columns", summary);
    console.warn(summary);
  }
}

/**
 * 对单个路由做完整布局断言。
 *
 * @param route 例如 "/dashboard"
 * @param viewport 人类可读的视口标识，例如 "375x812"
 */
export async function assertLayoutIntact(
  page: Page,
  route: string,
  viewport: string,
): Promise<void> {
  const where = label(route, viewport);

  // 前置 1：确认真的停在该路由（登录态失效时会被踢回 /login，
  // 那样后面的断言虽然还是"绿"的，但校验的其实是登录页 —— 属于假绿）。
  // 用 pathname 精确比对：登录重定向常见形态是 /login?next=/dashboard，
  // 对整串 URL 做 contain 会把这种情况误判成"已就位"。
  const pathname = new URL(page.url()).pathname;
  expect(
    pathname === route || pathname.startsWith(`${route}/`),
    `${where}：当前 pathname=${pathname}，未停在目标路由（可能被重定向到登录页），布局断言不可信`,
  ).toBe(true);

  // 前置 2：错误边界与 404 也长着 main/heading，会假绿（判定细节见 detectPageError）。
  expect(
    /^\/error(\/|$)/.test(pathname),
    `${where}：URL 落在错误路由 ${pathname}，布局断言无意义`,
  ).toBe(false);
  const pageError = await detectPageError(page);
  expect(
    pageError,
    `${where}：页面落到错误边界/渲染崩溃（${pageError ?? ""}），布局断言无意义`,
  ).toBeNull();

  // 采集
  const probe = await collectLayoutProbe(page);
  const detail = probe.oversizeScanned
    ? JSON.stringify(probe.oversize, null, 2)
    : "（非移动端视口，未做右边缘扫描）";
  const isMobileViewport = probe.viewportWidth <= 375;

  // ⚠️ 报告必须在任何会抛错的断言之前写：页面一旦横向溢出，后面的 expect 先抛，
  // 44×44 / 表单双列的 annotation 与 console 汇总就整批丢了。
  reportMobileConstraints(probe, where);

  // 断言 1：节点预算（全量扫描不截断，页面过大就明确失败而不是悄悄放过）
  expect(
    probe.totalNodes,
    `${where}：页面 DOM 元素 ${probe.totalNodes} 个，超过护栏预算 ${NODE_BUDGET}。护栏已全量扫描（不截断）；节点这么多说明该页需要拆分，或应为它单开一条更粗的检查。`,
  ).toBeLessThanOrEqual(NODE_BUDGET);

  // 断言 2：采样时不应还是骨架（否则测的是加载态，等于白跑）
  expect(
    probe.skeletonsVisible,
    `${where}：采样时仍有可见骨架 ${JSON.stringify(probe.skeletonsVisible)}，此时断言的是加载态而不是真实内容`,
  ).toEqual([]);

  // 断言 3：页面级横向溢出（所有视口都要求）
  expect(
    probe.documentScrollWidth,
    `${where}：documentElement.scrollWidth=${probe.documentScrollWidth} 超过视口宽 ${probe.viewportWidth}（页面出现横向滚动）。越界元素：${detail}`,
  ).toBeLessThanOrEqual(probe.viewportWidth + 1);

  // 断言 4：移动端主内容区不得内部横向滚动。
  // 宽屏下允许宽元素（横向图表等）由容器自己滚动，所以这条只在移动端断言。
  if (isMobileViewport && probe.main) {
    expect(
      probe.main.scrollWidth,
      `${where}：<main> scrollWidth=${probe.main.scrollWidth} 超过 clientWidth=${probe.main.clientWidth}（移动端主内容区内部可横向滚动）。越界元素：${detail}`,
    ).toBeLessThanOrEqual(probe.main.clientWidth + 1);
  }

  // 断言 5：主容器可见，且渲染出了真实文本（骨架/空壳/白屏都不算）
  const main = page.locator("main").first();
  if ((await main.count()) > 0) {
    await expect(main, `${where}：主容器 <main> 不可见`).toBeVisible();
    const mainText = await main.evaluate((el) =>
      ((el as HTMLElement).innerText || "").trim(),
    );
    expect(
      mainText.length,
      `${where}：<main> 内没有可见文本（innerText 为空），疑似仍在加载或渲染失败`,
    ).toBeGreaterThan(0);
  } else {
    await expect(
      page.getByRole("heading").first(),
      `${where}：既没有 <main>，也没有可见的 heading，页面疑似未渲染`,
    ).toBeVisible();
  }

  // 断言 6：越界元素必须为空 —— 只在移动端扫描（宽屏允许超宽元素）
  if (isMobileViewport) {
    const scrollNotes = probe.oversize.flatMap((item) => {
      const container = item.scrollContainer;
      if (!container) return [];
      if (container.overflowX === "hidden") {
        return [
          `被 ${container.selector} 以 overflow-x:hidden 裁剪（容器裁掉约 ${container.clipAmount}px，元素越界 ${item.overflowPx}px）；` +
            (container.tableLike
              ? "宽表格在移动端应改为卡片"
              : "内容被裁掉，按 ui-system.md §7 应改为卡片或收窄内容"),
        ];
      }
      if (container.sanctioned) return [];
      return [
        `容器 ${container.selector} 使用 overflow-x:${container.overflowX}，按 ui-system.md §7 应改为卡片`,
      ];
    });
    expect(
      probe.oversize,
      `${where}：发现 ${probe.oversizeCount} 个元素越出视口右侧（列出溢出最多的 ${probe.oversize.length} 个，共扫描 ${probe.totalNodes} 个元素）：\n${detail}` +
        (scrollNotes.length > 0
          ? `\n规范提示：\n- ${scrollNotes.join("\n- ")}`
          : ""),
    ).toEqual([]);

    // 局部横向滚动容器：内容比容器宽但右边缘没越出视口，上面那圈扫不到。
    // 按 ui-system.md §7，移动端不允许（宽表格应改卡片，代码块要包 pre/code/.prose）。
    expect(
      probe.localScroll,
      `${where}：发现 ${probe.localScrollCount} 个未授权的局部横向滚动容器` +
        `（除 pre/code/.prose/[data-scroll-ok] 外，移动端应改成卡片）：\n` +
        JSON.stringify(probe.localScroll, null, 2),
    ).toEqual([]);

    // 底栏重叠（ui-system.md §6）：一个移动端页面最多一条固定底栏。
    // 典型冲突：MobileNav 与 wrong-book / practice-setup 的页面级操作条同时贴底。
    expect(
      probe.bottomBarOverlaps,
      `${where}：发现 ${probe.bottomBarOverlaps.length} 对互相重叠的贴底固定元素` +
        `（一个移动端页面最多一条固定底栏；有页面级固定操作条的路由应让 MobileNav 不渲染，见 docs/ui-system.md §6）：\n` +
        JSON.stringify(probe.bottomBarOverlaps, null, 2) +
        (probe.bottomBars.length > 1
          ? `\n本次采样到的贴底固定元素（${probe.bottomBars.length} 个）：\n${JSON.stringify(probe.bottomBars, null, 2)}`
          : ""),
    ).toEqual([]);
  }
}
