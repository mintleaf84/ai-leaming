"use client";

import React, { useEffect, useState } from 'react';
import { getSettingsAction, updateSettingsAction, resetUserDataAction, Settings } from '@/server/actions/settings';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ShieldAlert,
  Moon,
  Trash2,
  BrainCircuit,
  Gauge,
  Save,
  Sun
} from 'lucide-react';
import { useTheme } from 'next-themes';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    getSettingsAction().then(setSettings);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettingsAction(settings);
      toast.success("设置已成功保存");
    } catch (e) {
      toast.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("确定要删除所有练习记录和掌握度数据吗？此操作不可撤销！")) return;

    try {
      const res = await resetUserDataAction();
      if (res.success) {
        toast.success(res.message);
        window.location.reload();
      }
    } catch (e) {
      toast.error("重置失败");
    }
  };

  if (!settings) return <div className="p-8 text-center text-muted-foreground">正在加载配置...</div>;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20 min-h-[calc(100vh-64px)] bg-background">
      <h1 className="text-3xl font-bold mb-8 text-foreground">系统设置</h1>

      <div className="space-y-6">
        {/* AI Configuration */}
        <section className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border flex items-center gap-3">
            <BrainCircuit className="text-blue-500 h-5 w-5" />
            <h2 className="font-bold text-foreground">AI 学习引擎配置</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground flex justify-between">
                <span>复盘触发阈值 (当前: {settings.reviewThreshold}分)</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">{settings.reviewThreshold}</span>
              </label>
              <input
                type="range"
                min="30"
                max="90"
                step="5"
                value={settings.reviewThreshold}
                onChange={(e) => setSettings({ ...settings, reviewThreshold: parseInt(e.target.value) })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <p className="text-xs text-muted-foreground">掌握度低于此分数的考点在错题后将立即触发 AI 深度复盘。</p>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-foreground">AI 严厉程度</label>
              <div className="grid grid-cols-3 gap-3">
                {(['low', 'medium', 'high'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setSettings({ ...settings, aiSeverity: level })}
                    className={`py-2 px-4 rounded-xl border text-sm font-medium transition-all ${settings.aiSeverity === level
                      ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'bg-card border-border text-muted-foreground hover:border-blue-500/30'
                      }`}
                  >
                    {level === 'low' ? '温柔' : level === 'medium' ? '适中' : '严厉'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">严厉模式下，AI 会生成更具挑战性的变式题，且对逻辑一致性要求更高。</p>
            </div>
          </div>
        </section>

        {/* Interface Settings */}
        <section className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border flex items-center gap-3">
            <Gauge className="text-purple-500 h-5 w-5" />
            <h2 className="font-bold text-foreground">界面与体验</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  {theme === 'dark' ? <Moon className="h-4 w-4 text-foreground" /> : <Sun className="h-4 w-4 text-foreground" />}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">外观主题</div>
                  <div className="text-xs text-muted-foreground">
                    当前: {theme === 'light' ? '明亮模式' : theme === 'dark' ? '深色模式' : '护眼模式'}
                  </div>
                </div>
              </div>

              {/* Note: The main ThemeToggle is in the Navbar. Here we just show a hint or a simple switcher if needed, 
                  but for now let's reuse the logic or just point users to Navbar. 
                  Actually, let's allow switching here too via next-themes. */}
              <div className="flex gap-2">
                <Button size="sm" variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}>明亮</Button>
                <Button size="sm" variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}>深色</Button>
                <Button size="sm" variant={theme === 'eye-care' ? 'default' : 'outline'} onClick={() => setTheme('eye-care')}>护眼</Button>
              </div>
            </div>
          </div>
        </section>

        {/* Dangerous Zone */}
        <section className="bg-destructive/5 rounded-2xl border border-destructive/20 overflow-hidden">
          <div className="p-6 border-b border-destructive/20 flex items-center gap-3">
            <ShieldAlert className="text-destructive h-5 w-5" />
            <h2 className="font-bold text-destructive">危险区域</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-destructive">重置学习数据</div>
                <div className="text-xs text-destructive/80 mt-1">这将清空所有的练习记录、错题本和掌握度数据，系统将恢复到初始状态。</div>
              </div>
              <Button
                variant="destructive"
                onClick={handleReset}
                className="bg-destructive hover:bg-destructive/90 shrink-0"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删号重练
              </Button>
            </div>
          </div>
        </section>

        {/* Sticky Save Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] z-40">
          <div className="max-w-3xl mx-auto flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSaving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              保存配置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
