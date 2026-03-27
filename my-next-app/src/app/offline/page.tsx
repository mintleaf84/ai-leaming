import React from 'react';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function OfflinePage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
            <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <WifiOff className="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">网络连接已断开</h1>
            <p className="text-muted-foreground mb-8 max-w-xs">
                “琢玉”已为您预缓存了核心功能，但某些动态内容（如 AI 聊天）需要互联网连接。
            </p>
            <Link href="/">
                <Button variant="default" className="px-8">
                    重试
                </Button>
            </Link>
        </div>
    );
}
