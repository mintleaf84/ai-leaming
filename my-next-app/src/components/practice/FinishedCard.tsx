import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BarChart3, Home } from "lucide-react";

interface FinishedCardProps {
  sessionId?: string | null;
  onDashboardClick: () => void;
}

export function FinishedCard({
  sessionId,
  onDashboardClick,
}: FinishedCardProps) {
  const handleViewReport = () => {
    const url = sessionId ? `/report?sessionId=${sessionId}` : "/report";
    window.location.href = url;
  };

  return (
    <motion.div
      key="finished"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="p-8 text-center border border-green-500/20 rounded-xl shadow-sm bg-green-500/10"
    >
      <div className="mb-4 text-5xl">🎉</div>
      <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
        练习会话已完成！
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        掌握度已实时更新至您的知识图谱
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          onClick={handleViewReport}
          className="bg-green-600 hover:bg-green-700 text-white dark:bg-green-600 dark:hover:bg-green-500"
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          查看练习报告
        </Button>
        <Button variant="outline" onClick={onDashboardClick}>
          <Home className="w-4 h-4 mr-2" />
          返回首页
        </Button>
      </div>
    </motion.div>
  );
}
