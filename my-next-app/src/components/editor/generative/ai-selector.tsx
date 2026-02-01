'use client';

import { Command, CommandInput, CommandList } from '@/components/ui/command';
import { useCompletion } from '@ai-sdk/react';
import { ArrowUp } from 'lucide-react';
import { addAIHighlight, useEditor } from 'novel';
import { useState } from 'react';
import Markdown from 'react-markdown';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import Magic from '../icons/magic';
import CrazySpinner from '../icons/crazy-spinner';
import AICompletionCommands from './ai-completion-command';
import AISelectorCommands from './ai-selector-commands';

interface AISelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AISelector({ onOpenChange }: AISelectorProps) {
    const { editor } = useEditor();
    const [inputValue, setInputValue] = useState('');

    const { completion, complete, isLoading, stop, setCompletion } = useCompletion({
        api: '/api/generate',
        streamProtocol: 'text', // 匹配后端 toTextStreamResponse() 格式
        onError: (e: Error) => {
            console.error('[AI Selector] Error:', e);
            toast.error(e.message);
        },
        onFinish: (_prompt, completion) => {
            console.log('[AI Selector] Finished. Completion length:', completion.length);
        },
    });

    const hasCompletion = completion.length > 0;

    if (!editor) return null;

    return (
        <Command className="w-[350px]">
            {hasCompletion && (
                <div className="flex max-h-[400px]">
                    <ScrollArea className="h-full w-full">
                        <div className="prose p-2 px-4 prose-sm dark:prose-invert">
                            <Markdown>{completion}</Markdown>
                        </div>
                    </ScrollArea>
                </div>
            )}

            {isLoading && (
                <div className="flex h-12 w-full items-center px-4 text-sm font-medium text-muted-foreground text-purple-500">
                    <Magic className="mr-2 h-4 w-4 shrink-0" />
                    AI 正在思考...
                    <div className="ml-2 mt-1">
                        <CrazySpinner />
                    </div>
                </div>
            )}
            {!isLoading && (
                <>
                    <div className="relative">
                        <CommandInput
                            value={inputValue}
                            onValueChange={setInputValue}
                            autoFocus
                            placeholder={hasCompletion ? '告诉 AI 下一步做什么' : '让 AI 编辑或生成...'}
                            onFocus={() => addAIHighlight(editor)}
                        />
                        <Button
                            size="icon"
                            className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-purple-500 hover:bg-purple-900"
                            onClick={() => {
                                if (completion)
                                    return complete(completion, {
                                        body: { option: 'zap', command: inputValue },
                                    }).then(() => setInputValue(''));

                                const slice = editor.state.selection.content();
                                // 使用 slice 的文本内容，避免依赖可能不存在的 markdown 扩展
                                const text = slice.content.textBetween(0, slice.content.size, '\n');

                                complete(text, {
                                    body: { option: 'zap', command: inputValue },
                                }).then(() => setInputValue(''));
                            }}
                        >
                            <ArrowUp className="h-4 w-4" />
                        </Button>
                    </div>
                    {hasCompletion ? (
                        <CommandList>
                            <AICompletionCommands
                                onDiscard={() => {
                                    stop(); // 停止正在进行的生成
                                    setCompletion(''); // 清理 completion 状态
                                    editor.chain().unsetHighlight().focus().run();
                                    onOpenChange(false);
                                }}
                                completion={completion}
                            />
                        </CommandList>
                    ) : (
                        <CommandList>
                            <AISelectorCommands onSelect={(value, option) => complete(value, { body: { option } })} />
                        </CommandList>
                    )}
                </>
            )}
        </Command>
    );
}
