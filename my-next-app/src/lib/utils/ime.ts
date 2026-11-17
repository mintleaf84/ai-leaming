/**
 * 输入法（IME）组合态判定。
 *
 * 中文/日文/韩文用户用拼音、注音、罗马字输入时，按 Enter 是「确认候选词」，
 * 不是「提交」。此时把 Enter 当作提交，会把**半截拼音**（例如想打"待定"却
 * 提交了 "dai"）当内容送出去 —— 见 docs/ux-a11y-audit.md §3.1。
 *
 * 用法（**必须放在任何 preventDefault() 之前**，否则把 IME 的确认动作吞掉，
 * 用户连候选词都选不了，比原 bug 更糟）：
 *
 *   if (isImeComposing(e)) return;
 *   if (e.key === "Enter") { e.preventDefault(); submit(); }
 *
 * 判定口径：
 *   - React 合成事件：`e.nativeEvent.isComposing === true`（唯一事实来源）
 *   - 原生 KeyboardEvent：无 `nativeEvent`，退回 `e.isComposing === true`
 *   - 老浏览器/部分 IME：`keyCode === 229`（组合态期间 keydown/keyup 恒为 229）
 *
 * 只读不写：不做副作用，便于在事件处理器里反复调用。
 */

/** 只描述本判定需要的字段，React 合成事件与原生 KeyboardEvent 都满足 */
export interface ImeComposableKeyboardEvent {
  /** 原生事件上的组合态标志（DOM KeyboardEvent 有，React 合成事件没有） */
  isComposing?: boolean;
  /** 已废弃但仍有 IME 依赖它：组合态期间为 229 */
  keyCode?: number;
  /** React 合成事件把原生事件挂在这里 */
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
}

export function isImeComposing(
  e: ImeComposableKeyboardEvent | null | undefined,
): boolean {
  if (!e) return false;

  const native = e.nativeEvent;
  if (native) {
    if (native.isComposing === true) return true;
    if (native.keyCode === 229) return true;
  }

  if (e.keyCode === 229) return true;

  // 原生 DOM 事件没有 nativeEvent，isComposing 在事件本身上。
  // 有 nativeEvent 时不看合成事件上的同名字段：那个值不可靠（React 不转发）。
  if (!native && e.isComposing === true) return true;

  return false;
}
