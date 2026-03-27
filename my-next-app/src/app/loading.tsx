export default function RootLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none">
      {/* 顶部加载进度条 (模拟) */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 overflow-hidden">
        <div className="h-full bg-primary animate-[shimmer_1.5s_infinite] origin-left w-full translate-x-[-100%]" 
             style={{ animation: 'loading-bar 2s ease-in-out infinite' }} />
      </div>

      {/* 中心轻量级加载指示器 */}
      <div className="mt-[20vh] flex flex-col items-center gap-4 bg-background/80 backdrop-blur-sm p-6 rounded-2xl border border-border shadow-xl pointer-events-auto">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 border-2 border-primary/20 rounded-full" />
          <div className="absolute inset-0 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm font-medium text-muted-foreground animate-pulse">正在加载...</p>
      </div>

      <style jsx>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
