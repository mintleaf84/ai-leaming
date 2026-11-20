import type { Metadata } from "next";

import ExamSessionClient from "./ExamSessionClient";

export const metadata: Metadata = {
  title: "作答中",
};

export default async function ExamSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExamSessionClient sessionId={id} />;
}
