
import React from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Brain, GraduationCap, _Sparkles } from 'lucide-react';
import { _cn } from '@/lib/utils';

export type ChatMode = 'standard' | 'socratic';

interface ChatModeToggleProps {
    mode: ChatMode;
    onModeChange: (mode: ChatMode) => void;
}

export function ChatModeToggle({ mode, onModeChange }: ChatModeToggleProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2 bg-muted/50 hover:bg-muted">
                    {mode === 'standard' ? (
                        <>
                            <Brain className="h-4 w-4 text-blue-500" />
                            <span className="text-xs font-medium">标准助手</span>
                        </>
                    ) : (
                        <>
                            <GraduationCap className="h-4 w-4 text-purple-600" />
                            <span className="text-xs font-medium text-purple-600">苏格拉底导师</span>
                        </>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuItem onClick={() => onModeChange('standard')} className="gap-2 cursor-pointer">
                    <Brain className="h-4 w-4 text-blue-500" />
                    <div className="flex flex-col text-left">
                        <span className="font-medium">标准助手</span>
                        <span className="text-xs text-muted-foreground">直接回答，简洁明了</span>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onModeChange('socratic')} className="gap-2 cursor-pointer bg-purple-50/50 dark:bg-purple-900/10">
                    <GraduationCap className="h-4 w-4 text-purple-600" />
                    <div className="flex flex-col text-left">
                        <span className="font-medium text-purple-600">苏格拉底导师</span>
                        <span className="text-xs text-muted-foreground">循循善诱，启发思考</span>
                    </div>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

ChatModeToggle.displayName = 'ChatModeToggle';
