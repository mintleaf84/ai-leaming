"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertCircle, RefreshCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-red-50 rounded-xl border border-red-100 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="text-red-600 w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-red-900 mb-2">出错了</h2>
            <p className="text-red-700 mb-6 max-w-md">
              系统在处理您的请求时遇到了意外错误。这可能是由于网络波动或数据异常导致的。
            </p>
            <div className="flex gap-4">
              <Button 
                className="bg-red-600 hover:bg-red-700"
                onClick={() => window.location.reload()}
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                重试加载
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.location.href = '/dashboard'}
              >
                返回仪表盘
              </Button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <pre className="mt-8 p-4 bg-gray-900 text-red-400 text-xs rounded overflow-auto max-w-full text-left">
                {this.state.error?.stack}
              </pre>
            )}
          </div>
        )
      );
    }

    return this.props.children;
  }
}
