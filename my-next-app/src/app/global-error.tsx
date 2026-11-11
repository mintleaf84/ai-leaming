"use client";

import { useEffect } from "react";

/**
 * 根错误边界：只有 `app/layout.tsx` 本身抛错时才会命中，
 * 此时不能依赖任何自定义组件（包括 UI 库），所以这里用最朴素的内联样式。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] 根布局渲染失败", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fff",
          color: "#111",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 480 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            应用加载失败
          </h1>
          <p style={{ fontSize: 14, color: "#555", margin: "0 0 16px" }}>
            根布局渲染异常，请刷新页面重试；若持续出现请把下方错误编号发给管理员。
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fafafa",
              cursor: "pointer",
            }}
          >
            重试
          </button>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#999", marginTop: 12 }}>
              错误编号：{error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
