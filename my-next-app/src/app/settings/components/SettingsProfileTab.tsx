import React from 'react';
import { Camera, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '../../profile/page';

interface SettingsProfileTabProps {
    profile: UserProfile;
    setProfile: (profile: UserProfile) => void;
    onSave: () => void;
    isSaving: boolean;
}

export function SettingsProfileTab({ profile, setProfile, onSave, isSaving }: SettingsProfileTabProps) {
    if (!profile) return null;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-card rounded-2xl border border-border p-8 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-3">
                    <div className="relative group">
                        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-4xl font-serif font-bold p-1 border-4 border-card shadow-lg overflow-hidden">
                            {profile.username.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-not-allowed">
                            <Camera className="w-8 h-8 text-white/80" />
                        </div>
                    </div>
                    <span className="text-xs text-muted-foreground">点击头像更换 (暂未开放)</span>
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
                        <p className="text-xs text-muted-foreground">您的昵称将在排行榜和评论中公开显示。</p>
                    </div>

                    <div className="grid gap-2">
                        <Label>账号类型</Label>
                        <div className="flex items-center gap-2">
                            <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold border border-primary/20">
                                个人版
                            </div>
                            <span className="text-xs text-muted-foreground">当前版本 v1.2.0</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <Button
                    onClick={onSave}
                    disabled={isSaving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[120px]"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    保存修改
                </Button>
            </div>
        </div>
    );
}
