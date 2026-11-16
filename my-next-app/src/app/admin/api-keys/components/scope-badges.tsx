"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import type { ApiKeyScope } from "@/types/api-key";
import { SCOPE_META } from "./scope-meta";

/** 风险徽标：三档用三种底色，扫一眼就能分出严重程度 */
export function RiskBadge({ scope }: { scope: ApiKeyScope }) {
  const risk = SCOPE_META[scope].risk;
  if (scope === "read") {
    return (
      <Badge variant="secondary" className="font-medium">
        {risk}
      </Badge>
    );
  }
  if (scope === "write") {
    return (
      <Badge variant="warning" className="font-medium">
        {risk}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-destructive/40 font-medium text-destructive"
    >
      {risk}
    </Badge>
  );
}

/** 作用域徽标：只读中性、读写警示、全权用描边红（不铺满，避免整张表都在喊） */
export function ScopeBadge({ scope }: { scope: ApiKeyScope }) {
  const meta = SCOPE_META[scope];
  if (scope === "read") {
    return (
      <Badge variant="secondary" className="whitespace-nowrap font-medium">
        read · {meta.label}
      </Badge>
    );
  }
  if (scope === "write") {
    return (
      <Badge variant="warning" className="whitespace-nowrap font-medium">
        write · {meta.label}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="whitespace-nowrap border-destructive/40 font-medium text-destructive"
    >
      admin · {meta.label}
    </Badge>
  );
}

/** 归属徽标：全局 key 等价站长身份，用警示色单独标出来，不让人误以为是普通机器身份 */
export function OwnerBadge({ userId }: { userId: number | null }) {
  if (userId === null) {
    return (
      <Badge
        variant="warning"
        className="whitespace-nowrap font-medium"
        title="全局 key 以站长身份执行请求，不要分发给他人"
      >
        <ShieldAlert className="mr-1 h-3 w-3 shrink-0" aria-hidden />
        全局
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="whitespace-nowrap font-medium">
      用户 #{userId}
    </Badge>
  );
}
