"use client";

import React from "react";
import type { ApiKeyScope } from "@/types/api-key";
import { cn } from "@/lib/utils/utils";
import { RiskBadge } from "./scope-badges";
import { SCOPE_META } from "./scope-meta";

/** 作用域单选卡：点击整行即可选中，键盘用原生 radio 的焦点行为 */
export function ScopeOption({
  scope,
  checked,
  onSelect,
}: {
  scope: ApiKeyScope;
  checked: boolean;
  onSelect: (scope: ApiKeyScope) => void;
}) {
  const meta = SCOPE_META[scope];
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        checked
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:bg-muted/60",
      )}
    >
      <input
        type="radio"
        name="api-key-scope"
        value={scope}
        checked={checked}
        onChange={() => onSelect(scope)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-primary" : "border-input",
        )}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{meta.label}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {scope}
          </code>
          <RiskBadge scope={scope} />
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {meta.summary}
        </span>
      </span>
    </label>
  );
}
