'use client';

import { useEffect, useRef, useState } from 'react';
import 'driver.js/dist/driver.css';

const STORAGE_KEY = 'onboarding_completed';

const steps = [
  {
    element: '#smart-practice',
    popover: {
      title: '🧠 智能刷题',
      description: '根据你的掌握情况，AI 智能推荐最适合的题目。每天进步一点点！',
      position: 'bottom',
    },
  },
  {
    element: '#review-questions',
    popover: {
      title: '📚 错题强化',
      description: '定期复习错题是巩固知识的关键。这里会显示你需要加强的题目。',
      position: 'bottom',
    },
  },
  {
    element: '#focus-practice',
    popover: {
      title: '🎯 专项突破',
      description: '选择一个知识点进行集中训练，适合考前突击或查漏补缺。',
      position: 'right',
    },
  },
  {
    element: '#module-knowledge',
    popover: {
      title: '💡 知识卡片',
      description: '碎片化记忆，利用 AI 生成的记忆卡片巩固知识点。',
      position: 'right',
    },
  },
  {
    element: '#module-wrongbook',
    popover: {
      title: '📖 错题本',
      description: '收录你的所有错题，定期回顾，避免重复踩坑。',
      position: 'top',
    },
  },
  {
    element: '#module-textbooks',
    popover: {
      title: '📚 教材库',
      description: '上传 PDF 教材，AI 帮你总结重点、解答疑问。',
      position: 'top',
    },
  },
];

export function OnboardingGuide() {
  const [isCompleted, setIsCompleted] = useState(true);
  const [inited, setInited] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setIsCompleted(false);
    }
  }, []);

  useEffect(() => {
    if (isCompleted || inited) return;
    setInited(true);

    let cancelled = false;

    // 动态加载，只在客户端执行
    import('driver.js').then((mod) => {
      if (cancelled) return;

      // @ts-expect-error driver.js 导出类型不标准
      const driver = mod.driver({
        animate: true,
        opacity: 0.75,
        padding: 10,
        allowClose: true,
        showButtons: ['close', 'next'],
        nextBtnText: '下一步',
        closeBtnText: '跳过',
        doneBtnText: '完成',
        onDestroyStarted: () => {
          localStorage.setItem(STORAGE_KEY, 'true');
          setIsCompleted(true);
        },
      });

      driver.setSteps(steps);

      // 延迟启动，确保 DOM 渲染完成
      const timer = setTimeout(() => {
        if (!cancelled) driver.drive(0);
      }, 1500);

      cleanupRef.current = () => {
        clearTimeout(timer);
        driver.destroy();
      };
    }).catch(console.error);

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [isCompleted, inited]);

  if (isCompleted) return null;

  return null;
}

export function restartOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}