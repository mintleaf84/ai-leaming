"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    BookOpen,
    Rocket,
    BookX,
    Bot,
    GraduationCap,
    Settings,
    HelpCircle,
    ChevronRight,
    Menu,
    X,
    Home
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// 文档章节配置
const docSections = [
    { id: 'getting-started', title: '快速开始', icon: Rocket },
    { id: 'practice', title: '智能练习', icon: BookOpen },
    { id: 'wrong-book', title: '错题本', icon: BookX },
    { id: 'ai-assistant', title: 'AI 助手', icon: Bot },
    { id: 'knowledge', title: '知识学习', icon: GraduationCap },
    { id: 'settings', title: '账户与设置', icon: Settings },
    { id: 'faq', title: '常见问题', icon: HelpCircle },
];

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState('getting-started');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // 监听滚动更新活动章节
    useEffect(() => {
        const handleScroll = () => {
            const sections = docSections.map(s => document.getElementById(s.id));
            const scrollY = window.scrollY + 100;

            for (let i = sections.length - 1; i >= 0; i--) {
                const section = sections[i];
                if (section && section.offsetTop <= scrollY) {
                    setActiveSection(docSections[i].id);
                    break;
                }
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveSection(id);
            setIsMobileMenuOpen(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
            {/* 移动端菜单按钮 */}
            <div className="lg:hidden fixed top-4 left-4 z-50">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="bg-white/80 dark:bg-slate-800/80 backdrop-blur"
                >
                    {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
            </div>

            {/* 侧边导航 */}
            <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white/95 dark:bg-slate-900/95 backdrop-blur
        border-r border-slate-200 dark:border-slate-800 z-40
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
                <div className="p-6">
                    <Link href="/" className="flex items-center gap-2 mb-8">
                        <div className="bg-blue-600 p-1.5 rounded-lg">
                            <GraduationCap className="h-5 w-5 text-white" />
                        </div>
                        <span className="font-bold text-lg">使用文档</span>
                    </Link>

                    <nav className="space-y-1">
                        {docSections.map((section) => {
                            const isActive = activeSection === section.id;
                            return (
                                <button
                                    key={section.id}
                                    onClick={() => scrollToSection(section.id)}
                                    className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${isActive
                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                                        }
                  `}
                                >
                                    <section.icon className={`h-4 w-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                                    <span>{section.title}</span>
                                    {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                            <Home className="h-4 w-4" />
                            返回首页
                        </Link>
                    </div>
                </div>
            </aside>

            {/* 移动端遮罩 */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* 主内容区 */}
            <main className="lg:ml-64 p-6 lg:p-12">
                <div className="max-w-3xl mx-auto">

                    {/* 页面标题 */}
                    <header className="mb-12 text-center lg:text-left">
                        <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                            AI 教招 使用指南
                        </h1>
                        <p className="text-lg text-slate-600 dark:text-slate-400">
                            欢迎使用 AI 教招学习系统！本文档将帮助你快速上手各项功能。
                        </p>
                    </header>

                    {/* 快速开始 */}
                    <section id="getting-started" className="mb-16 scroll-mt-20">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <Rocket className="h-6 w-6 text-blue-600" />
                            快速开始
                        </h2>
                        <div className="prose dark:prose-invert max-w-none">
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                AI 教招是一款专为教师招聘考试设计的智能学习系统，结合 AI 技术帮助你高效备考。
                            </p>

                            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 mt-6 shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="text-lg font-semibold mb-4">开始使用的三个步骤：</h3>
                                <ol className="space-y-4">
                                    <li className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-7 h-7 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                                        <div>
                                            <strong>注册账号</strong>
                                            <p className="text-slate-500 text-sm mt-1">访问首页点击"注册"，填写用户名和密码即可创建账号。</p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-7 h-7 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                                        <div>
                                            <strong>开始练习</strong>
                                            <p className="text-slate-500 text-sm mt-1">进入"智能练习"，选择练习模式和题目数量，开始刷题。</p>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-7 h-7 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                                        <div>
                                            <strong>查看分析</strong>
                                            <p className="text-slate-500 text-sm mt-1">练习结束后，系统会生成详细的分析报告，帮助你了解薄弱环节。</p>
                                        </div>
                                    </li>
                                </ol>
                            </div>
                        </div>
                    </section>

                    {/* 智能练习 */}
                    <section id="practice" className="mb-16 scroll-mt-20">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <BookOpen className="h-6 w-6 text-green-600" />
                            智能练习
                        </h2>
                        <div className="space-y-6">
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                智能练习是系统的核心功能，支持多种练习模式和 AI 辅助复盘。
                            </p>

                            <div className="grid gap-4">
                                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">🎯 练习模式</h3>
                                    <ul className="text-slate-600 dark:text-slate-400 space-y-2 text-sm">
                                        <li><strong>顺序练习</strong>：按题目顺序依次作答</li>
                                        <li><strong>随机练习</strong>：随机抽取题目，模拟真实考试</li>
                                        <li><strong>专项练习</strong>：针对特定知识点集中训练</li>
                                        <li><strong>错题巩固</strong>：重做之前答错的题目</li>
                                    </ul>
                                </div>

                                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">🤖 AI 复盘</h3>
                                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                                        答题后点击"AI 复盘"，系统会调用 AI 分析你的答题情况，给出详细解析和学习建议。
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">📊 练习报告</h3>
                                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                                        每次练习结束后，系统会生成包含正确率、用时分析、薄弱知识点等数据的报告。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 错题本 */}
                    <section id="wrong-book" className="mb-16 scroll-mt-20">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <BookX className="h-6 w-6 text-red-600" />
                            错题本
                        </h2>
                        <div className="space-y-4">
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                错题本自动收集你答错的题目，方便集中复习和巩固。
                            </p>

                            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="font-semibold text-slate-900 dark:text-white mb-3">主要功能：</h3>
                                <ul className="text-slate-600 dark:text-slate-400 space-y-2 text-sm">
                                    <li>📌 <strong>自动收集</strong>：答错的题目自动加入错题本</li>
                                    <li>🏷️ <strong>分类查看</strong>：按知识点筛选错题</li>
                                    <li>🔄 <strong>重做练习</strong>：对错题进行针对性复习</li>
                                    <li>✅ <strong>标记掌握</strong>：已掌握的题目可移出错题本</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* AI 助手 */}
                    <section id="ai-assistant" className="mb-16 scroll-mt-20">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <Bot className="h-6 w-6 text-purple-600" />
                            AI 助手
                        </h2>
                        <div className="space-y-4">
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                AI 助手是你的智能学习伙伴，随时解答你的学习疑问。
                            </p>

                            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                                <h3 className="font-semibold text-slate-900 dark:text-white mb-3">你可以这样使用：</h3>
                                <ul className="text-slate-600 dark:text-slate-400 space-y-2 text-sm">
                                    <li>💬 询问教育学、心理学相关概念</li>
                                    <li>📝 请求解释某道题目的答案</li>
                                    <li>🎯 获取针对性的学习建议</li>
                                    <li>📚 让 AI 帮你总结知识点</li>
                                </ul>
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">💡 小贴士</h3>
                                <p className="text-slate-600 dark:text-slate-400 text-sm">
                                    开启"知识增强"开关后，AI 会结合系统内的知识库给出更准确的回答。
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 知识学习 */}
                    <section id="knowledge" className="mb-16 scroll-mt-20">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <GraduationCap className="h-6 w-6 text-amber-600" />
                            知识学习
                        </h2>
                        <div className="space-y-4">
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                系统提供多种形式的知识学习工具，帮助你系统性地掌握考试内容。
                            </p>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">📇 知识卡片</h3>
                                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                                        以卡片形式呈现核心概念，支持翻转查看详细解释，适合碎片化记忆。
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">🗺️ 知识图谱</h3>
                                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                                        可视化展示知识点之间的关联关系，帮助你建立系统的知识体系。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 账户与设置 */}
                    <section id="settings" className="mb-16 scroll-mt-20">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <Settings className="h-6 w-6 text-slate-600" />
                            账户与设置
                        </h2>
                        <div className="space-y-4">
                            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="font-semibold text-slate-900 dark:text-white mb-3">个人中心</h3>
                                <ul className="text-slate-600 dark:text-slate-400 space-y-2 text-sm">
                                    <li>👤 查看和编辑个人信息</li>
                                    <li>📈 查看学习统计和成就</li>
                                    <li>💳 管理订阅状态</li>
                                </ul>
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="font-semibold text-slate-900 dark:text-white mb-3">系统设置</h3>
                                <ul className="text-slate-600 dark:text-slate-400 space-y-2 text-sm">
                                    <li>🌓 切换浅色/深色主题</li>
                                    <li>📥 导出学习数据</li>
                                    <li>🗑️ 重置练习记录</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* 常见问题 */}
                    <section id="faq" className="mb-16 scroll-mt-20">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <HelpCircle className="h-6 w-6 text-cyan-600" />
                            常见问题
                        </h2>
                        <div className="space-y-4">
                            {[
                                { q: 'AI 功能需要付费吗？', a: '基础版每天有一定的免费使用额度。如需更多使用次数，可升级到付费套餐。' },
                                { q: '练习数据会同步吗？', a: '是的，你的所有练习记录都会保存在云端，可在任意设备登录后继续学习。' },
                                { q: '如何反馈问题或建议？', a: '你可以通过 AI 助手留言，或联系系统管理员。' },
                                { q: '支持移动端使用吗？', a: '支持！系统已针对手机和平板进行了响应式适配，使用浏览器访问即可。' },
                            ].map((item, i) => (
                                <div key={i} className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Q: {item.q}</h3>
                                    <p className="text-slate-600 dark:text-slate-400 text-sm">A: {item.a}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 底部导航 */}
                    <footer className="text-center py-8 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            还有疑问？欢迎使用 <Link href="/chat" className="text-blue-600 hover:underline">AI 助手</Link> 获取帮助
                        </p>
                    </footer>

                </div>
            </main>
        </div>
    );
}
