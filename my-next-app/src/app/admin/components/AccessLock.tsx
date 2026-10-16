"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface AccessLockProps {
  onUnlock: () => void;
  accessCode: string;
}

export function AccessLock({ onUnlock, accessCode }: AccessLockProps) {
  const [accessInput, setAccessInput] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessInput === accessCode) {
      onUnlock();
    } else {
      alert("访问密码错误");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form
        onSubmit={handleLogin}
        className="p-8 bg-card rounded-xl shadow-md border border-border w-full max-w-sm"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-blue-500/10 p-3 rounded-full">
            <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-center mb-6 text-foreground">
          管理员登录
        </h1>
        <input
          type="password"
          value={accessInput}
          onChange={(e) => setAccessInput(e.target.value)}
          className="w-full p-3 border border-border bg-background rounded mb-4 focus:ring-2 focus:ring-primary outline-none text-foreground placeholder:text-muted-foreground"
          placeholder="请输入访问密码..."
          autoFocus
        />
        <Button type="submit" className="w-full">
          解锁
        </Button>
      </form>
    </div>
  );
}
