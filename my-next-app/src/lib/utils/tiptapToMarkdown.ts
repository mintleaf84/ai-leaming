export function tiptapToMarkdown(content: string | null): string {
  if (!content) return "";
  try {
    const json = JSON.parse(content);
    if (json && json.type === "doc" && Array.isArray(json.content)) {
      return convertNode(json).trim();
    }
    return content;
  } catch (_e) {
    // audit-allow: 入参 content 可能本身就是 Markdown 纯文本（非 TipTap JSON），
    // 解析失败按原文返回是本函数的契约，不属于异常
    return content;
  }
}

function convertNode(node: Record<string, unknown>, listLevel = 0): string {
  if (!node) return "";

  if (node.type === "text") {
    return (node.text as string) || "";
  }

  let text = "";
  if (Array.isArray(node.content)) {
    text = (node.content as Record<string, unknown>[])
      .map((n: Record<string, unknown>) =>
        convertNode(
          n,
          listLevel +
            (node.type === "bulletList" || node.type === "orderedList" ? 1 : 0),
        ),
      )
      .join("");
  }

  switch (node.type) {
    case "heading":
      return `\n${"#".repeat((node.attrs as Record<string, number>)?.level || 1)} ${text}\n`;
    case "paragraph":
      return `${text}\n`;
    case "bulletList":
    case "orderedList":
      return `\n${text}\n`;
    case "listItem":
      return `${"  ".repeat(Math.max(0, listLevel - 1))}- ${text}\n`;
    case "doc":
      return text;
    default:
      return text;
  }
}
