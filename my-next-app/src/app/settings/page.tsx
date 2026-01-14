"use client";

import React, { useEffect, useState } from 'react';
import { getSettingsAction, updateSettingsAction, resetUserDataAction, Settings } from '@/server/actions/settings';
import { getUserProfileAction, updateProfileAction } from '@/server/actions/profile';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ShieldAlert,
  Moon,
  Trash2,
  BrainCircuit,
  Gauge,
  Save,
  Sun,
  User,
  Database,
  Download,
  Eye,
  Monitor,

  Loader2,
  Camera,
  Type
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useTerminology } from '@/lib/hooks/use-terminology';

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
      <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      <span className="ml-2 text-neutral-400 text-sm">正在加载配置...</span>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#faf9f6]">
      {/* Left Sidebar (Settings Navigation) */}
      <div className="w-full md:w-64 flex flex-col border-r border-neutral-200 bg-white/50 backdrop-blur-sm md:h-screen md:sticky md:top-0">
        <div className="p-6">
          <h1 className="text-2xl font-serif font-bold text-neutral-800">设置与偏好</h1>
          <p className="text-xs text-neutral-400 mt-1">打造专属学习环境</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
                activeTab === tab.id
                  ? "bg-emerald-50 text-emerald-700 shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-100"
              )}
            >
              <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-emerald-600" : "text-neutral-400")} />
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="p-4 text-xs text-neutral-300 text-center">
          ZhuoYu v1.2.0 Build 20260114
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 p-6 md:p-12 pb-24 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Header for Mobile */}
          <div className="md:hidden mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              {React.createElement(TABS.find(t => t.id === activeTab)?.icon || Gauge, { className: "w-5 h-5 text-emerald-600" })}
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
          </div>

          {/* --- Content: AI Preferences --- */}
          {activeTab === 'ai' && (
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
                      <span className="text-2xl font-serif font-bold text-emerald-600">{settings.reviewThreshold}<span className="text-sm font-sans text-neutral-400 ml-1">分</span></span>
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
          )}

          {/* --- Content: Appearance --- */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Terminology Switch */}
              <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-sm">
                <h3 className="font-bold text-neutral-700 mb-4 flex items-center gap-2">
                  <Type className="w-4 h-4 text-emerald-600" />
                  命名风格
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => terminology.setMode("standard")}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-xl border transition-all gap-1 text-left",
                      terminology.mode === "standard"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-200"
                        : "bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    )}
                  >
                    <div className="font-bold text-sm">标准模式</div>
                    <div className="text-xs opacity-70">直观清晰：首页、知识库、智能练习</div>
                  </button>
                  <button
                    onClick={() => terminology.setMode("neo-chinese")}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-xl border transition-all gap-1 text-left",
                      terminology.mode === "neo-chinese"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-200"
                        : "bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    )}
                  >
                    <div className="font-bold text-sm font-serif">雅致模式</div>
                    <div className="text-xs opacity-70">沉浸体验：修习、藏经阁、精进</div>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-sm">
                <h3 className="font-bold text-neutral-700 mb-4 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-600" />
                  显示模式
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { id: 'light', label: '明亮模式', icon: Sun },
                    { id: 'dark', label: '深色模式', icon: Moon },
                    { id: 'system', label: '跟随系统', icon: Monitor }, // Using Monitor for System
                    { id: 'eye-care', label: '护眼模式', icon: Eye },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setTheme(mode.id)}
                      className={cn(
                        "flex flex-col items-center p-4 rounded-xl border transition-all gap-2",
                        theme === mode.id || (theme === 'system' && mode.id === 'system') // Simplified active check, next-themes handles resolution
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                          : "bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                      )}
                    >
                      <mode.icon className="w-6 h-6" />
                      <span className="text-xs font-medium">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* --- Content: Profile --- */}
          {activeTab === 'profile' && profile && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-white rounded-2xl border border-neutral-100 p-8 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-4xl font-serif font-bold p-1 border-4 border-white shadow-lg overflow-hidden">
                      {profile.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-not-allowed">
                      <Camera className="w-8 h-8 text-white/80" />
                    </div>
                  </div>
                  <span className="text-xs text-neutral-400">点击头像更换 (暂未开放)</span>
                </div>

                {/* Form Section */}
                <div className="flex-1 space-y-6 w-full">
                  <div className="grid gap-2">
                    <Label htmlFor="username">用户昵称</Label>
                    <Input
                      id="username"
                      value={profile.username}
                      onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                      className="max-w-md"
                      placeholder="请输入您的昵称"
                    />
                    <p className="text-xs text-neutral-400">您的昵称将在排行榜和评论中公开显示。</p>
                  </div>

                  <div className="grid gap-2">
                    <Label>账号身份</Label>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
                        {profile.role === 'admin' ? '管理员' : '普通学员'}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                        {profile.subscription?.status === 'active' ? profile.subscription.plan_name : '免费版'}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>注册时间</Label>
                    <div className="text-sm text-neutral-600">
                      {new Date(profile.created_at).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- Content: Data --- */}
          {activeTab === 'data' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-neutral-700 mb-1">导出学习数据</h3>
                  <p className="text-xs text-neutral-400">下载您的所有 Markdown 格式笔记与记录</p>
                </div>
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  导出 (Zip)
                </Button>
              </div>

              <div className="bg-red-50/50 rounded-2xl border border-red-100 p-6 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <ShieldAlert className="w-32 h-32" />
                </div>
                <h3 className="font-bold text-red-700 mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  危险区域
                </h3>
                <p className="text-xs text-red-600/80 mb-6 max-w-md leading-relaxed">
                  重置操作将永久删除您的所有学习进度、错题记录和 AI 对话历史。
                  此操作一旦执行，<span className="font-bold">无法撤销</span>。
                </p>
                <Button
                  variant="destructive"
                  onClick={handleReset}
                  className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除账号并重置数据
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Sticky Save Button (Global) */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="lg"
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            "rounded-full px-8 shadow-2xl transition-all duration-300",
            isSaving ? "bg-neutral-400" : "bg-emerald-600 hover:bg-emerald-700 hover:scale-105"
          )}
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          保存配置
        </Button>
      </div>
    </div>
  );
}
