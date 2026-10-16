import React from "react";

export default function TextbookLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* 侧边栏骨架区域 - PC端 */}
      <div className="hidden md:flex w-64 flex-col border-r bg-muted/20 p-4">
        <div className="h-4 w-24 bg-muted animate-pulse mb-6 rounded"></div>
        <div className="h-6 w-48 bg-muted animate-pulse mb-8 rounded font-semibold"></div>

        <div className="space-y-4 mt-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-6 w-full bg-muted/70 animate-pulse rounded-md"
            ></div>
          ))}
        </div>
      </div>

      {/* 右侧阅读主内容骨架 */}
      <div className="flex-1 p-4 md:p-8 lg:p-12 overflow-hidden flex flex-col">
        <div className="md:hidden flex h-16 items-center border-b mb-4">
          <div className="h-6 w-8 bg-muted animate-pulse rounded mr-4"></div>
          <div className="h-6 w-48 bg-muted animate-pulse rounded"></div>
        </div>

        <div className="max-w-3xl mx-auto w-full flex-1">
          <div className="h-10 w-3/4 bg-muted animate-pulse rounded-lg mb-10"></div>

          {[1, 2, 3, 4].map((block) => (
            <div key={block} className="space-y-3 mb-8">
              <div className="h-5 w-full bg-muted/60 animate-pulse rounded"></div>
              <div className="h-5 w-[92%] bg-muted/60 animate-pulse rounded"></div>
              <div className="h-5 w-[96%] bg-muted/60 animate-pulse rounded"></div>
              <div className="h-5 w-[85%] bg-muted/60 animate-pulse rounded"></div>
              {block % 2 === 0 && (
                <div className="h-32 w-full bg-muted/40 animate-pulse rounded mt-4"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
