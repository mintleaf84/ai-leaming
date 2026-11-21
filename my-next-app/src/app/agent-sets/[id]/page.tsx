import type { Metadata } from "next";

import AgentSetDetailClient from "./AgentSetDetailClient";

export const metadata: Metadata = {
  title: "题集",
  description: "查看这一批题、逐题练习、反馈有问题的题，或一键成卷。",
};

export default async function AgentSetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgentSetDetailClient setId={Number(id)} />;
}
