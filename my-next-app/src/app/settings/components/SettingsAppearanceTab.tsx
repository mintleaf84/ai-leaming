import React from 'react';
import { Type, Eye, Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TerminologyMode } from '@/lib/hooks/use-terminology';

interface SettingsAppearanceTabProps {
    theme: string | undefined;
    setTheme: (theme: string) => void;
    terminologyMode: TerminologyMode;
    setTerminologyMode: (mode: TerminologyMode) => void;
}

export function SettingsAppearanceTab({ theme, setTheme, terminologyMode, setTerminologyMode }: SettingsAppearanceTabProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Terminology Switch */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                    <Type className="w-4 h-4 text-primary" />
                    命名风格
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => setTerminologyMode("standard")}
                        className={cn(
                            "flex flex-col items-start p-4 rounded-xl border transition-all gap-1 text-left",
                            terminologyMode === "standard"
                                ? "bg-primary/10 border-primary text-primary ring-1 ring-primary/20"
                                : "bg-card border-border text-muted-foreground hover:bg-accent"
                        )}
                    >
                        <div className="font-bold text-sm">标准模式</div>
                        <div className="text-xs opacity-70">直观清晰：首页、知识库、智能练习</div>
                    </button>
                    <button
                        onClick={() => setTerminologyMode("neo-chinese")}
                        className={cn(
                            "flex flex-col items-start p-4 rounded-xl border transition-all gap-1 text-left",
                            terminologyMode === "neo-chinese"
                                ? "bg-primary/10 border-primary text-primary ring-1 ring-primary/20"
                                : "bg-card border-border text-muted-foreground hover:bg-accent"
                        )}
                    >
                        <div className="font-bold text-sm font-serif">雅致模式</div>
                        <div className="text-xs opacity-70">沉浸体验：修习、藏经阁、精进</div>
                    </button>
                </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" />
                    显示模式
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { id: 'light', label: '明亮模式', icon: Sun },
                        { id: 'dark', label: '深色模式', icon: Moon },
                        { id: 'system', label: '跟随系统', icon: Monitor },
                        { id: 'eye-care', label: '护眼模式', icon: Eye },
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => setTheme(mode.id)}
                            className={cn(
                                "flex flex-col items-center p-4 rounded-xl border transition-all gap-2",
                                theme === mode.id || (theme === 'system' && mode.id === 'system')
                                    ? "bg-primary/10 border-primary text-primary"
                                    : "bg-card border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <mode.icon className="w-6 h-6" />
                            <span className="text-xs font-medium">{mode.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
