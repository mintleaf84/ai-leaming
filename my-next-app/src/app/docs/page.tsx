"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    BookOpen,
    Rocket,
    BookX,
    Bot,
    GraduationCap,
    ScanText,
    Settings,
    HelpCircle,
    CheckCircle2,
    ChevronRight,
    Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// 文档章节配置
const docSections = [
    { id: 'getting-started', title: '快速开始', icon: Rocket },
    { id: 'practice', title: '智能练习', icon: BookOpen },
    { id: 'wrong-book', title: '错题本', icon: BookX },
    { id: 'ai-assistant', title: 'AI 助手', icon: Bot },
    { id: 'deep-dive', title: '深度解析', icon: ScanText },
    { id: 'knowledge', title: '知识学习', icon: GraduationCap },
    { id: 'settings', title: '账户与设置', icon: Settings },
    { id: 'faq', title: '常见问题', icon: HelpCircle },
];

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState('getting-started');
    const observerRefs = useRef<Map<string, IntersectionObserverEntry>>(new Map());

    // 使用 IntersectionObserver 监听章节可见性
    useEffect(() => {
        const callback = (entries: IntersectionObserverEntry[]) => {
            entries.forEach((entry) => {
                observerRefs.current.set(entry.target.id, entry);
            });

            // 找到当前视口中可见比例最高或者最靠前的 section
            const visibleSections = Array.from(observerRefs.current.values())
                .filter(entry => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

            if (visibleSections.length > 0) {
                setActiveSection(visibleSections[0].target.id);
            }
        };

        const observer = new IntersectionObserver(callback, {
            root: null, // viewport
            rootMargin: '-20% 0px -60% 0px', // 调整判定区域，不仅是顶部
            threshold: [0, 0.2, 0.4, 0.6, 0.8, 1]
        });

        docSections.forEach(section => {
            const el = document.getElementById(section.id);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, []);

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveSection(id);
        }
    };

    return (
        <div className="min-h-screen bg-[#faf9f6]">
            <div className="container mx-auto px-6 py-12 md:py-20 flex flex-col lg:flex-row gap-12 max-w-7xl">

                {/* 左侧主要内容区 */}
                <article className="flex-1 min-w-0">
                    {/* Header */}
                    <header className="mb-16 border-b border-neutral-200 pb-10">
                        <Badge variant="outline" className="mb-4 px-3 py-1 border-emerald-200 text-emerald-700 bg-emerald-50/50 rounded-full font-serif">
                            Documentation
                        </Badge>
                        <h1 className="text-4xl md:text-5xl font-bold text-neutral-800 font-serif mb-6 tracking-tight">
                            使用指南
                        </h1>
                        <p className="text-xl text-neutral-500 leading-relaxed max-w-3xl">
                            欢迎来到 AI 教招智学中心。这里汇集了所有功能的使用说明，帮助您高效利用 AI 技术备考。
                        </p>
                    </header>

                    {/* 快速开始 */}
                    <section id="getting-started" className="mb-20 scroll-mt-24 group">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                                <Rocket className="w-5 h-5" />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-800 font-serif">快速开始</h2>
                        </div>

                        <div className="prose max-w-none text-neutral-600">
                            <p className="leading-7 mb-6">
                                AI 教招是一款专为教师招聘考试设计的智能学习系统。我们通过深度集成的 AI 技术，为您提供个性化的出题、批改和答疑服务。
                            </p>

                            <div className="grid md:grid-cols-3 gap-6 my-8 not-prose">
                                {[
                                    { step: '01', title: '注册账号', desc: '创建您的专属学习档案，同步多端进度。' },
                                    { step: '02', title: '智能练习', desc: '选择科目开始刷题，AI 实时分析薄弱项。' },
                                    { step: '03', title: '查看报告', desc: '获取详细的能力分析报告，查漏补缺。' }
                                ].map((item) => (
                                    <div key={item.step} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="text-4xl font-serif font-bold text-emerald-100 mb-4">{item.step}</div>
                                        <h3 className="text-lg font-bold text-neutral-800 mb-2">{item.title}</h3>
                                        <p className="text-sm text-neutral-500">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* 智能练习 */}
                    <section id="practice" className="mb-20 scroll-mt-24">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-800 font-serif">智能练习</h2>
                        </div>

                        <div className="space-y-6">
                            <p className="text-neutral-600 leading-7">
                                告别题海战术。我们的智能练习引擎会根据您的历史答题数据，动态调整题目难度和出题范围。
                            </p>

                            <div className="bg-white rounded-2xl border border-neutral-200 p-8 shadow-sm">
                                <h3 className="font-bold text-neutral-800 mb-4 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    练习模式详解
                                </h3>
                                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
                                    <div>
                                        <h4 className="font-medium text-neutral-900 mb-1">顺序练习</h4>
                                        <p className="text-sm text-neutral-500">按章节顺序系统性刷题，打牢基础。</p>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-neutral-900 mb-1">随机模拟</h4>
                                        <p className="text-sm text-neutral-500">全真模拟考试环境，检测真实水平。</p>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-neutral-900 mb-1">错题巩固</h4>
                                        <p className="text-sm text-neutral-500">智能推荐易错题，定向爆破。</p>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-neutral-900 mb-1">AI 专项</h4>
                                        <p className="text-sm text-neutral-500">针对薄弱知识点生成变式题。</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 错题本 */}
                    <section id="wrong-book" className="mb-20 scroll-mt-24">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700">
                                <BookX className="w-5 h-5" />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-800 font-serif">错题本</h2>
                        </div>
                        <div className="bg-[#fff1f2] border border-rose-100 rounded-2xl p-6 flex gap-4">
                            <div className="shrink-0 mt-1">
                                <CheckCircle2 className="w-5 h-5 text-rose-500" />
                            </div>
                            <div>
                                <h3 className="font-bold text-rose-900 mb-1">自动化管理</h3>
                                <p className="text-sm text-rose-700/80 leading-relaxed">
                                    无需手动录入，系统会自动将您答错的题目加入错题本。当您在错题本中正确回答同一题目达到 3 次后，系统会建议将其移除。
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* AI 助手 */}
                    <section id="ai-assistant" className="mb-20 scroll-mt-24">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700">
                                <Bot className="w-5 h-5" />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-800 font-serif">AI 助手</h2>
                        </div>
                        <div className="space-y-4 text-neutral-600">
                            <p className="leading-7">
                                遇到不懂的概念？对解析有疑问？随时唤起右下角的 AI 助手。它不仅能回答具体问题，还能帮您拆解复杂的教心学理论。
                            </p>
                            <div className="flex flex-wrap gap-3 mt-4">
                                {['什么是皮亚杰的认知发展阶段？', '如何区分正强化和负强化？', '帮我总结一下班级管理的原则'].map(q => (
                                    <span key={q} className="bg-white border border-neutral-200 px-4 py-2 rounded-full text-sm text-neutral-600 shadow-sm">
                                        "{q}"
                                    </span>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* 深度解析 */}
                    <section id="deep-dive" className="mb-20 scroll-mt-24">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
                                <ScanText className="w-5 h-5" />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-800 font-serif">智能标注与深度解析</h2>
                        </div>
                        <div className="space-y-6">
                            <p className="text-neutral-600 leading-7">
                                我们不仅提供答案，更提供思维工具。在练习或阅读解析时，选中文本即可唤起智学工具栏。
                            </p>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm hover:border-purple-200 transition-colors">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200">🧬 第一性原理</Badge>
                                        <span className="text-xs text-neutral-400">First Principles</span>
                                    </div>
                                    <h3 className="font-bold text-neutral-800 mb-2">拒绝死记硬背</h3>
                                    <p className="text-sm text-neutral-500 leading-relaxed">
                                        选中任何晦涩的教育学概念，点击“第一性原理”，AI 将为您递归拆解，直到最底层的公理。帮您建立从 0 到 1 的认知链路。
                                    </p>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm hover:border-purple-200 transition-colors">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Badge variant="secondary" className="bg-neutral-100 text-neutral-700 hover:bg-neutral-200">📋 智能摘录</Badge>
                                    </div>
                                    <h3 className="font-bold text-neutral-800 mb-2">所见即所得</h3>
                                    <p className="text-sm text-neutral-500 leading-relaxed">
                                        选中文本后可快速复制或添加到笔记（开发中）。工具栏智能跟随您的阅读视线，触手可及。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 知识学习 */}
                    <section id="knowledge" className="mb-20 scroll-mt-24">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                                <GraduationCap className="w-5 h-5" />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-800 font-serif">知识学习</h2>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
                                <h3 className="font-bold text-neutral-800 mb-2">📇 知识卡片</h3>
                                <p className="text-sm text-neutral-500">
                                    碎片化学习利器。利用间隔重复记忆算法 (Spaced Repetition)，帮您高效记忆核心考点。
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
                                <h3 className="font-bold text-neutral-800 mb-2">🗺️ 知识图谱</h3>
                                <p className="text-sm text-neutral-500">
                                    上帝视角看考点。可视化展示知识点间的层级与关联，构建完整的知识大厦。
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 常见问题 */}
                    <section id="faq" className="mb-20 scroll-mt-24">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-700">
                                <HelpCircle className="w-5 h-5" />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-800 font-serif">常见问题</h2>
                        </div>
                        <div className="space-y-4">
                            {[
                                { q: 'AI 额度不够用怎么办？', a: '您可以前往订阅页面升级到 Pro 套餐，获取无限量的 AI 对话和高级复盘权益。' },
                                { q: '统计数据的时间怎么算？', a: '系统统一使用北京时间 (UTC+8) 进行数据统计。每日练习记录会在凌晨 0:00 自动归档到新的一天，请注意保持签到连续性。' },
                                { q: '可以离线使用吗？', a: '目前系统依赖云端 AI 算力，需要保持网络连接。未来我们会探索离线轻量化模型。' },
                                { q: '数据安全吗？', a: '您的所有数据都经过加密传输和存储。我们不会将您的个人数据用于训练公共大模型。' },
                            ].map((item, i) => (
                                <div key={i} className="bg-white rounded-xl p-6 border border-neutral-100 shadow-sm">
                                    <h3 className="font-bold text-neutral-900 mb-2 text-sm">{item.q}</h3>
                                    <p className="text-neutral-500 text-sm leading-relaxed">{item.a}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                </article>

                {/* 右侧悬浮目录 (Desktop Only) */}
                <aside className="hidden lg:block w-64 min-w-[250px] relative">
                    <div className="sticky top-24">
                        <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 px-2">
                            Table of Contents
                        </div>
                        <nav className="space-y-1 relative">
                            {/* Active Indicator Line (Optional visual flair) */}
                            <div className="absolute left-0 w-0.5 bg-emerald-200 h-full rounded-full opacity-20" />

                            {docSections.map((section) => {
                                const isActive = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => scrollToSection(section.id)}
                                        className={cn(
                                            "group flex items-center gap-3 w-full px-3 py-2 text-sm transition-all duration-200 rounded-lg text-left border-l-2 border-transparent -ml-[2px]",
                                            isActive
                                                ? "text-emerald-700 font-medium border-emerald-500 bg-emerald-50/50"
                                                : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
                                        )}
                                    >
                                        <span className={cn(
                                            "transition-transform duration-200",
                                            isActive ? "translate-x-1" : ""
                                        )}>
                                            {section.title}
                                        </span>
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="mt-8 p-4 bg-emerald-900 rounded-xl text-emerald-50 shadow-lg shadow-emerald-900/20">
                            <p className="text-xs font-medium opacity-80 mb-1">Still need help?</p>
                            <p className="text-sm font-bold mb-3">Ask our AI Assistant</p>
                            <Button size="sm" variant="secondary" className="w-full bg-emerald-50 text-emerald-900 hover:bg-white" onClick={() => window.location.href = '/chat'}>
                                Go to Chat
                            </Button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
