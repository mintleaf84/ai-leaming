"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Database } from "lucide-react";
import { SystemStatus } from "./types";
import { formatBytes, formatUptime } from "@/lib/utils/utils";

interface ServerResourcesProps {
  status: SystemStatus;
}

export function ServerResources({ status }: ServerResourcesProps) {
  return (
    <Card className="md:col-span-3">
      <CardHeader>
        <CardTitle>服务器资源</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> 运行时间
          </span>
          <span className="font-mono text-sm">
            {formatUptime(status.os.uptime)}
          </span>
        </div>
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-sm font-medium flex items-center gap-2">
            <Database className="w-3.5 h-3.5" /> 数据库体积
          </span>
          <span className="font-mono text-sm">
            {formatBytes(status.db.size)}
          </span>
        </div>
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-sm font-medium">Node 内存 (Heap)</span>
          <span className="font-mono text-sm">
            {formatBytes(status.process.memory.heapUsed)}
          </span>
        </div>
        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-sm font-medium">Node 内存 (RSS)</span>
          <span className="font-mono text-sm">
            {formatBytes(status.process.memory.rss)}
          </span>
        </div>
        <div className="flex justify-between items-center pt-2">
          <span className="text-sm font-medium">应用版本</span>
          <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded-md">
            {status.appVersion}
          </span>
        </div>
        <div className="flex justify-between items-center pt-2">
          <span className="text-sm font-medium">操作系统</span>
          <span className="font-mono text-xs text-muted-foreground">
            {status.os.platform} ({status.os.release})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
