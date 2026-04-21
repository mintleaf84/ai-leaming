
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, Loader2, Bot, User } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import dynamic from 'next/dynamic';
const MarkdownViewer = dynamic(() => import('@/components/chat/MarkdownViewer'), { ssr: false });

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface TextbookChatProps {
    context: string;
    title: string;
}

export function TextbookChat({ context, title }: TextbookChatProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: `你好！我是你的 AI 助教。我已经阅读了《${title}》的当前章节，有什么不懂的随时问我！`
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
                    enableRag: true, // Enable RAG tools if needed, though context is primary
                    context: context // Inject current chapter content
                })
            });

            if (!response.ok) throw new Error(response.statusText);

            // Stream handling
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let aiMessageContent = '';
            let streamBuffer = '';

            // Add placeholder AI message
            const aiMessageId = (Date.now() + 1).toString();
            setMessages(prev => [...prev, { id: aiMessageId, role: 'assistant', content: '' }]);

            while (reader) {
                const { done, value } = await reader.read();
                if (done) break;

                streamBuffer += decoder.decode(value, { stream: true });
                const events = streamBuffer.split('\n\n');
                streamBuffer = events.pop() || '';

                for (const eventBlock of events) {
                    const dataLines = eventBlock
                        .split('\n')
                        .filter(line => line.startsWith('data: '))
                        .map(line => line.slice(6).trim());

                    if (dataLines.length === 0) {
                        // 兼容纯文本流
                        aiMessageContent += eventBlock;
                        continue;
                    }

                    for (const payload of dataLines) {
                        if (!payload || payload === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(payload) as { type?: string; delta?: string };
                            if (parsed.type === 'text-delta' && typeof parsed.delta === 'string') {
                                aiMessageContent += parsed.delta;
                            }
                        } catch {
                            // 兼容旧文本协议
                            aiMessageContent += payload;
                        }
                    }
                }

                setMessages(prev => prev.map(m =>
                    m.id === aiMessageId ? { ...m, content: aiMessageContent } : m
                ));
            }

        } catch (error) {
            console.error('Chat failed:', error);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: '抱歉，我现在有点累，请稍后再试。'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button
                    className="fixed bottom-8 right-8 h-14 w-14 rounded-full shadow-lg z-50 bg-primary/90 hover:bg-primary transition-all hover:scale-105"
                    size="icon"
                >
                    <MessageCircle className="h-7 w-7" />
                </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0 gap-0">
                <SheetHeader className="p-4 border-b bg-muted/40">
                    <SheetTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-primary" />
                        AI 助教 ({title})
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                            >
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border'
                                    }`}>
                                    {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                </div>
                                <div className={`rounded-lg px-4 py-2 max-w-[85%] text-sm ${m.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/50 border'
                                    }`}>
                                    {m.role === 'assistant' ? (
                                        <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
                                            <MarkdownViewer content={m.content} />
                                        </div>
                                    ) : (
                                        m.content
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>

                <div className="p-4 border-t bg-background">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex items-center gap-2"
                    >
                        <Input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="基于当前章节提问..."
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </form>
                </div>
            </SheetContent>
        </Sheet>
    );
}
