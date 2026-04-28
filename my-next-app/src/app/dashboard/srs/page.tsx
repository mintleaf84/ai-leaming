import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import SrsAnalysisClient from "./SrsAnalysisClient";
import { getSrsGlobalStatsAction } from "@/server/actions/srs";

export const metadata = {
  title: "记忆引擎分析 - 琢玉",
  description: "基于 FSRS 算法的个性化记忆状态深度分析",
};

async function SrsAnalysisContent() {
  const result = await getSrsGlobalStatsAction();
  if (!result.data) return <div className="text-center text-muted-foreground p-8">加载失败</div>;
  
  return <SrsAnalysisClient stats={result.data} />;
}

export default function SrsAnalysisPage() {
  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-8">
      <Suspense fallback={
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Loader2 className="animate-spin w-8 h-8 text-primary" />
          <p className="animate-pulse">正在深度分析记忆数据...</p>
        </div>
      }>
        <SrsAnalysisContent />
      </Suspense>
    </div>
  );
}
