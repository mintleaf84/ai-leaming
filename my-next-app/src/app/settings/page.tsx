"use client";

import React, { useEffect, useState } from 'react';
import { getSettingsAction, updateSettingsAction, resetUserDataAction, Settings } from '@/server/actions/settings';
import { getUserProfileAction, updateProfileAction } from '@/server/actions/profile';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ShieldAlert,
  Trash2,
  BrainCircuit,
  Gauge,
  Save,
  User,
  Database,
  Download,
  Loader2,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useTerminology } from '@/lib/hooks/use-terminology';
import { usePWAInstall } from '@/hooks/usePWAInstall';

import { SettingsProfileTab } from './components/SettingsProfileTab';
import { SettingsAIPreferencesTab } from './components/SettingsAIPreferencesTab';
import { SettingsAppearanceTab } from './components/SettingsAppearanceTab';

// --- Tab Configuration ---
type SettingsTab = 'profile' | 'ai' | 'appearance' | 'data';

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: '个人资料', icon: User },
  { id: 'ai', label: 'AI 偏好', icon: BrainCircuit },
  { id: 'appearance', label: '界面外观', icon: Gauge },
  { id: 'data', label: '数据管理', icon: Database },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { theme, setTheme } = useTheme();
  const terminology = useTerminology();
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();

  useEffect(() => {
    getSettingsAction().then(setSettings);
    getUserProfileAction().then((res) => {
      if (res.success) setProfile(res.profile);
    });
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      // Parallel Save
      const promises = [updateSettingsAction(settings)];
      if (profile) {
        promises.push(updateProfileAction({ username: profile.username }));
      }

      const results = await Promise.all(promises);
      const profileResult = results[1] as any; // updateProfileAction result

      if (profileResult && !profileResult.success) {
        toast.error(profileResult.error || "资料更新失败");
      } else {
        toast.success("配置已保存");
        // Refresh to sync sidebar
        if (profileResult) window.location.reload();
      }
    } catch (e) {
      toast.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("⚠️极度危险操作⚠️\n\n确定要【删号重练】吗？\n此操作将永久清空所有练习记录、错题本和掌握度数据！")) return;

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

  if (!settings) return (
    <div className="flex h-[calc(100vh-64px)] w-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="ml-2 text-muted-foreground text-sm">正在加载配置...</span>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      {/* Left Sidebar (Settings Navigation) */}
      <div className="w-full md:w-64 flex flex-col border-r border-border bg-background/50 backdrop-blur-sm md:h-screen md:sticky md:top-0">
        <div className="p-6">
          <h1 className="text-2xl font-serif font-bold text-foreground">设置与偏好</h1>
          <p className="text-xs text-muted-foreground mt-1">打造专属学习环境</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-primary" : "text-muted-foreground")} />
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="p-4 text-xs text-muted-foreground/50 text-center">
          ZhuoYu v1.2.0 Build 20260114
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 p-6 md:p-12 pb-24 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Header for Mobile */}
          <div className="md:hidden mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              {React.createElement(TABS.find(t => t.id === activeTab)?.icon || Gauge, { className: "w-5 h-5 text-primary" })}
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
          </div>

          {/* --- Content: AI Preferences --- */}
          {activeTab === 'ai' && (
            <SettingsAIPreferencesTab settings={settings} setSettings={setSettings} />
          )}

          {/* --- Content: Appearance --- */}
          {activeTab === 'appearance' && (
            <SettingsAppearanceTab
              theme={theme}
              setTheme={setTheme}
              terminologyMode={terminology.mode}
              setTerminologyMode={terminology.setMode}
            />
          )}

          {/* --- Content: Profile --- */}
          {activeTab === 'profile' && (
            <SettingsProfileTab
              profile={profile}
              setProfile={setProfile}
              onSave={handleSave}
              isSaving={isSaving}
            />
          )}

          {/* --- Content: Data Management --- */}
          {activeTab === 'data' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* 安装应用卡片 */}
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" />
                  安装应用
                </h3>
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-foreground">添加到桌面</div>
                    <div className="text-xs text-muted-foreground">
                      {isInstalled
                        ? '应用已安装，可从桌面启动'
                        : '像原生 App 一样使用琢玉'}
                    </div>
                  </div>
                  {isInstalled ? (
                    <div className="flex items-center gap-2 text-primary text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      已安装
                    </div>
                  ) : isInstallable ? (
                    <Button
                      onClick={promptInstall}
                      size="sm"
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Smartphone className="w-4 h-4 mr-2" />
                      立即安装
                    </Button>
                  ) : (
                    <div className="text-xs text-muted-foreground max-w-[140px] text-right">
                      请使用 Chrome/Edge 浏览器访问
                    </div>
                  )}
                </div>
              </div>

              {/* 数据管理卡片 */}
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  数据管理
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-xl border border-border flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-foreground">导出个人数据</div>
                      <div className="text-xs text-muted-foreground">下载您的所有学习记录与设置</div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      导出 CSV
                    </Button>
                  </div>

                  <div className="p-4 bg-destructive/5 rounded-xl border border-destructive/20 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-destructive">危险操作</div>
                      <div className="text-xs text-destructive/70">数据一旦删除将无法恢复</div>
                    </div>
                    <Button variant="ghost" size="sm"
                      onClick={handleReset}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      清空数据
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Save Button (Floating) - Only for AI Tab as specific setting */}
          {activeTab === 'ai' && (
            <div className="fixed bottom-6 right-6 md:absolute md:bottom-0 md:right-0">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="shadow-2xl shadow-primary/20 dark:shadow-primary/10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 py-6 h-auto text-lg transition-transform hover:scale-105 active:scale-95"
              >
                {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
