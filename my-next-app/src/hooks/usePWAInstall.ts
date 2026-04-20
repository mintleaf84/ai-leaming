'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Hook 用于处理 PWA 安装提示
 * - isInstallable: 是否可安装（浏览器支持且未安装）
 * - isInstalled: 是否已安装
 * - promptInstall: 触发安装对话框
 */
export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // 检查是否已安装（standalone 模式运行）
        if (window.matchMedia('(display-mode: standalone)').matches) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsInstalled(true);
            return;
        }

        // 监听安装提示事件
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        // 监听安装完成事件
        const handleAppInstalled = () => {
            setIsInstalled(true);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const promptInstall = async () => {
        if (!deferredPrompt) return false;

        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            return true;
        }
        return false;
    };

    return {
        isInstallable: !!deferredPrompt && !isInstalled,
        isInstalled,
        promptInstall,
    };
}
