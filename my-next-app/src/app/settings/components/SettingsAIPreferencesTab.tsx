import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Settings } from '@/server/actions/settings';

interface SettingsAIPreferencesTabProps {
    settings: Settings;
    setSettings: (settings: Settings) => void;
}

export function SettingsAIPreferencesTab({ settings, setSettings }: SettingsAIPreferencesTabProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-sm">
                <h3 className="font-bold text-neutral-700 mb-4 flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-emerald-600" />
                    AI 辅导强度
                </h3>
                <div className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <label className="text-sm font-medium text-neutral-600">自动复盘触发阈值</label>
                            <span className="text-2xl font-serif font-bold text-emerald-600">
                                {settings.reviewThreshold}
                                <span className="text-sm font-sans text-neutral-400 ml-1">分</span>
                            </span>
                        </div>
                        <input
                            type="range" min="30" max="90" step="5"
                            value={settings.reviewThreshold}
                            onChange={(e) => setSettings({ ...settings, reviewThreshold: parseInt(e.target.value) })}
                            className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                        <p className="text-xs text-neutral-400">
                            当您对某个知识点的掌握度低于此分数时，AI 会在错题解析中自动触发深度复盘模式。
                        </p>
                    </div>

                    <div className="pt-4 border-t border-neutral-50 space-y-3">
                        <label className="text-sm font-medium text-neutral-600">AI 严厉程度</label>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { id: 'low', label: '温柔鼓励', desc: '以鼓励为主' },
                                { id: 'medium', label: '适中', desc: '客观公正' },
                                { id: 'high', label: '严厉鞭策', desc: '高标准要求' }
                            ].map((level) => (
                                <button
                                    key={level.id}
                                    onClick={() => setSettings({ ...settings, aiSeverity: level.id as any })}
                                    className={cn(
                                        "flex flex-col items-center justify-center p-3 rounded-xl border text-sm transition-all h-20",
                                        settings.aiSeverity === level.id
                                            ? "bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-200"
                                            : "bg-white border-neutral-200 text-neutral-500 hover:border-emerald-300 hover:bg-emerald-50/50"
                                    )}
                                >
                                    <span className="font-bold">{level.label}</span>
                                    <span className="text-[10px] opacity-70 mt-1">{level.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
