export const CATEGORY_COLORS = [
  // 雅致色系：翠、金、赫、青、墨、大地
  { bg: "bg-primary/10", text: "text-primary" }, // 翠
  { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400" }, // 金
  { bg: "bg-rose-500/10", text: "text-rose-700 dark:text-rose-400" }, // 赫
  { bg: "bg-teal-500/10", text: "text-teal-700 dark:text-teal-400" }, // 青
  { bg: "bg-stone-500/10", text: "text-stone-700 dark:text-stone-400" }, // 墨
  { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" }, // 大地
];

export const getCategoryColor = (category: string) => {
  if (!category) return CATEGORY_COLORS[0];
  const hash = category
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
};
