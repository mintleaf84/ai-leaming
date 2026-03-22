import React from 'react';
import { BookOpen } from 'lucide-react';

export function WrongBookSkeleton() {
    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto max-w-4xl px-4 py-8 pb-32">
                {/* 头部骨架 */}
                <div className="mb-8 animate-pulse">
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <BookOpen className="text-muted h-8 w-8" />
                        <div className="h-8 w-24 bg-muted rounded"></div>
                    </h1>
                    <div className="mt-2 h-4 w-64 bg-muted rounded"></div>
                </div>

                {/* 统计卡片骨架 */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-card rounded-xl p-4 border shadow-sm animate-pulse">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-4 h-4 bg-muted rounded-full"></div>
                                <div className="h-3 w-16 bg-muted rounded"></div>
                            </div>
                            <div className="h-8 w-12 bg-muted rounded mt-2"></div>
                        </div>
                    ))}
                </div>

                {/* 操作栏骨架 */}
                <div className="flex items-center justify-between mb-4 animate-pulse">
                    <div className="flex gap-2">
                        <div className="h-8 w-20 bg-muted rounded-lg"></div>
                        <div className="h-8 w-20 bg-muted rounded-lg"></div>
                        <div className="h-8 w-20 bg-muted rounded-lg"></div>
                    </div>
                </div>

                {/* 列表内容骨架 */}
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-card rounded-2xl border border-border p-5 animate-pulse flex gap-4">
                            <div className="w-6 h-6 rounded-full bg-muted flex-shrink-0"></div>
                            <div className="flex-1 space-y-3">
                                <div className="h-4 w-3/4 bg-muted rounded"></div>
                                <div className="h-4 w-1/2 bg-muted rounded"></div>
                                <div className="flex gap-2 mt-4">
                                    <div className="h-6 w-12 bg-muted rounded-full"></div>
                                    <div className="h-6 w-16 bg-muted rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
