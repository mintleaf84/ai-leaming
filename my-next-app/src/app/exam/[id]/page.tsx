import type { Metadata } from "next";

import ExamPreviewClient from "./ExamPreviewClient";

export const metadata: Metadata = {
  title: "试卷预览",
};

export default async function ExamPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExamPreviewClient paperId={Number(id)} />;
}
