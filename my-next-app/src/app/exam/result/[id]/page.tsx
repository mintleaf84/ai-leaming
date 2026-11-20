import type { Metadata } from "next";

import ExamResultClient from "./ExamResultClient";

export const metadata: Metadata = {
  title: "成绩单",
};

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExamResultClient sessionId={id} />;
}
