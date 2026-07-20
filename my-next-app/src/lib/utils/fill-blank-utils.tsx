/**
 * 填空题内容处理工具
 * 用于运行时兼容处理已导入的填空题
 */

/**
 * 检测并修复填空题内容
 * 如果题目包含 <input> 标签，将其替换为下划线占位符
 */
export function processFillBlankContent(content: string): string {
  if (!content) return "";

  // 如果已经包含下划线占位符，说明已经处理过
  if (content.includes("_____")) {
    return content;
  }

  // 如果包含 input 标签，进行转换
  if (content.includes("<input")) {
    return content
      .replace(/<input[^>]*\/?>/gi, "_____")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .trim();
  }

  return content;
}

/**
 * 渲染填空题内容（React 组件中使用）
 * 将 _____ 占位符替换为带下划线的空白区域
 */
export function renderFillBlankContent(content: string) {
  const processedContent = processFillBlankContent(content);
  const parts = processedContent.split(/(_____+)/g);
  let blankIndex = 0;

  return parts.map((part, i) => {
    if (part.startsWith("_____")) {
      blankIndex++;
      return (
        <span
          key={i}
          className="inline-block min-w-[80px] border-b-2 border-teal-500 px-1 text-center"
        >
          <span className="text-xs text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity">
            空{blankIndex}
          </span>
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
