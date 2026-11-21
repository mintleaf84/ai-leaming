import type { Metadata } from "next";
import { Info } from "lucide-react";

import { FenbiSyncCard } from "@/components/fenbi/FenbiSyncCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "粉笔同步",
  description: "绑定粉笔账号，把知识点练习记录同步成练习历史与错题本。",
};

const LIMITATIONS = [
  // 与 FenbiSyncCard 里的 FENBI_LIMITATION_TEXT 保持一致（改一处要改两处）
  "试卷/模考记录暂不支持（粉笔还没有开放这类记录的读取），目前只同步知识点练习。",
  "只同步知识点练习，不包含课程、收藏、笔记等内容。",
  "重复同步不会产生重复记录：已同步过的练习会被自动跳过。",
  "登录状态过期后会停止自动同步，重新扫码绑定即可恢复。",
];

export default function FenbiSyncPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 lg:py-10">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          粉笔同步
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          把你在粉笔上做过的知识点练习同步过来，自动生成练习历史、错题本与掌握度，不用再手动导出。
        </p>
      </header>

      <div className="space-y-6">
        <FenbiSyncCard />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Info className="h-4 w-4 text-primary" aria-hidden />
              同步范围与限制
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {LIMITATIONS.map((text) => (
                <li key={text} className="flex gap-2">
                  <span
                    aria-hidden
                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground"
                  />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
