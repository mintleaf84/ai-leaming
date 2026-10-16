"use client";

import React, { useState } from "react";
import { ConfigManager } from "../components/ConfigManager";
import { PromptManager } from "../components/PromptManager";
import { RouteManager } from "../components/ConfigManager/RouteManager";
import { Cpu, MessageSquareText, Network } from "lucide-react";

export default function AiManagementPage() {
  const [activeTab, setActiveTab] = useState<"config" | "routing" | "prompt">(
    "config",
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">AI 与提示词</h2>
        <p className="text-muted-foreground mt-2">
          配置多模型服务商及其路由，并优化系统提示词模板。
        </p>
      </div>

      <div className="space-y-6">
        <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
          <button
            onClick={() => setActiveTab("config")}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
              activeTab === "config"
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/50 hover:text-foreground"
            }`}
          >
            <Cpu className="w-4 h-4 mr-2" />
            服务商配置
          </button>
          <button
            onClick={() => setActiveTab("routing")}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
              activeTab === "routing"
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/50 hover:text-foreground"
            }`}
          >
            <Network className="w-4 h-4 mr-2" />
            模型路由
          </button>
          <button
            onClick={() => setActiveTab("prompt")}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
              activeTab === "prompt"
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/50 hover:text-foreground"
            }`}
          >
            <MessageSquareText className="w-4 h-4 mr-2" />
            提示词管理
          </button>
        </div>

        <div className="mt-6 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {activeTab === "config" && <ConfigManager />}
          {activeTab === "routing" && <RouteManager />}
          {activeTab === "prompt" && <PromptManager />}
        </div>
      </div>
    </div>
  );
}
