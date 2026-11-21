import type { Metadata } from "next";

import AgentSetsListClient from "./AgentSetsListClient";

export const metadata: Metadata = {
  title: "AI 题集",
  description: "外部 Agent 按弱项推来的练习批次，可逐题练、可一键成卷。",
};

export default function AgentSetsPage() {
  return <AgentSetsListClient />;
}
