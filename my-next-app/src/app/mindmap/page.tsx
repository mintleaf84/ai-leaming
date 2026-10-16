import React from "react";
import { Network } from "lucide-react";

export default function MindmapEmptyPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] font-sans bg-background/50">
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4">
        <Network className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">思维导图工作台</h2>
      <p className="text-muted-foreground text-sm">
        请在左侧选择一个导图文件，或点击「新建导图」开始创作。
      </p>
    </div>
  );
}
