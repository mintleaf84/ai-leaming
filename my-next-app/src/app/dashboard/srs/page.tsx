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
  // 这里原来只渲染一句"加载失败"，没有恢复路径。抛给路由错误边界，
  // 用户能拿到带「重试」的 ErrorState，而不是死路一条。
  if (!result?.data) {
    throw new Error(result?.serverError || "记忆分析数据加载失败，请稍后重试");
  }

  return <SrsAnalysisClient stats={result.data} />;
}

export default function SrsAnalysisPage() {
  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-8">
      <Suspense
        fallback={
          <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="animate-spin w-8 h-8 text-primary" />
            <p className="animate-pulse">正在深度分析记忆数据...</p>
          </div>
        }
      >
        <SrsAnalysisContent />
      </Suspense>
    </div>
  );
}
