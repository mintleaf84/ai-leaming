"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Check, Edit2, Trash2 } from "lucide-react";
import type { AiConfig } from "@/lib/services/ai-config";

interface ConfigListProps {
  configs: AiConfig[];
  onEdit: (config: AiConfig) => void;
  onDelete: (id: number) => void;
  onActivate: (id: number) => void;
}

export function ConfigList({
  configs,
  onEdit,
  onDelete,
  onActivate,
}: ConfigListProps) {
  return (
    <div className="grid gap-4">
      {configs.map((config) => (
        <div
          key={config.id}
          className={`p-6 rounded-xl border transition-all ${config.is_active ? "bg-blue-500/10 border-blue-500/30 shadow-md" : "bg-card border-border hover:border-border/80 hover:bg-muted/30"}`}
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold text-foreground">
                  {config.name}
                </h3>
                {config.is_active && (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full flex items-center">
                    <Check className="w-3 h-3 mr-1" /> 当前使用
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  接口地址 (Base URL):{" "}
                  <span className="font-mono bg-muted text-foreground px-1 rounded">
                    {config.api_url}
                  </span>
                </p>
                <p>
                  高级模型 (Premium Model):{" "}
                  <span className="font-mono bg-muted text-foreground px-1 rounded">
                    {config.model_premium}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {!config.is_active && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onActivate(config.id)}
                >
                  激活
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(config)}
                aria-label="编辑"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              {!config.is_active && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                  onClick={() => onDelete(config.id)}
                  aria-label="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
      {configs.length === 0 && (
        <div className="text-center p-12 bg-card rounded-xl border border-border text-muted-foreground">
          暂无配置，请先添加一个配置。
        </div>
      )}
    </div>
  );
}
