import { notFound } from "next/navigation";
import { getMindmapDetailAction } from "@/server/actions/mindmap";
import MindmapEditorClient from "./MindmapEditorClient";

export default async function MindmapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { success, data } = await getMindmapDetailAction(Number(id));

  if (!success || !data) {
    notFound();
  }

  return <MindmapEditorClient mindmap={data} />;
}
