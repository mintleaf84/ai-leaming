import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/auth";
import { redirect } from 'next/navigation';
import Image from 'next/image';

export default async function LandingPage() {
    const session = await getSession();
    if (session?.user) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-[oklch(0.985_0.002_85)] text-[oklch(0.2_0_0)] font-sans selection:bg-emerald-100">
            {/* Navbar for Landing Page */}
            <nav className="flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-2">
                    <div className="relative w-8 h-8">
                        <Image src="/logo.png" alt="ZhuoYu Logo" width={32} height={32} className="object-contain" />
                    </div>
                    <span className="font-bold text-xl font-serif">ZhuoYu</span>
                </div>
                <div className="flex items-center gap-4">
                    <Link href="/login" className="text-sm font-medium hover:text-emerald-700 transition-colors">
                        登录
                    </Link>
                    <Link href="/register">
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6">
                            注册
                        </Button>
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="flex flex-col md:flex-row items-center justify-between max-w-7xl mx-auto px-6 py-12 md:py-24 gap-12">

                {/* Left Content */}
                <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <h1 className="text-5xl md:text-7xl font-bold font-serif leading-tight tracking-tight">
                        精琢每一分，<br />
                        只为成师<span className="text-emerald-600">。</span>
                    </h1>
                    <p className="text-lg md:text-xl text-neutral-500 max-w-md leading-relaxed">
                        AI 驱动的教师招聘备考助手。
                        告别题海战术，用数字化“琢玉”的方式，重塑你的备考体验。
                    </p>

                    <div className="flex items-center gap-4 pt-4">
                        <Link href="/register">
                            <Button size="lg" className="h-12 px-8 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg shadow-emerald-200/50 transition-all hover:scale-105">
                                立即开始修行
                            </Button>
                        </Link>
                        <Link href="#features">
                            <Button variant="outline" size="lg" className="h-12 px-8 text-lg rounded-full border-neutral-300 hover:bg-neutral-50">
                                了解更多
                            </Button>
                        </Link>
                    </div>

                    <div className="pt-8 flex items-center gap-3 text-sm text-neutral-400">
                        <div className="flex -space-x-2">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="w-8 h-8 rounded-full bg-neutral-200 border-2 border-white flex items-center justify-center text-xs overflow-hidden">
                                    <span className="scale-75">👤</span>
                                </div>
                            ))}
                        </div>
                        <span>Trusted by 10k+ Candidates</span>
                    </div>
                </div>

                {/* Right Visual: Floating Cards */}
                <div className="flex-1 w-full relative h-[500px] flex items-center justify-center animate-in fade-in justify-self-end duration-1000 delay-200">
                    {/* Background Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-100/30 rounded-full blur-3xl -z-10" />

                    {/* Stacked Cards */}
                    <div className="relative w-80 md:w-96 perspective-1000">
                        {/* Bottom Card */}
                        <div className="absolute top-8 left-4 w-full h-80 bg-white/40 backdrop-blur-sm border border-white/50 rounded-3xl shadow-xl transform rotate-3 scale-95 transition-all duration-500 hover:rotate-6"></div>
                        {/* Middle Card */}
                        <div className="absolute top-4 left-2 w-full h-80 bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl shadow-xl transform -rotate-2 scale-100 transition-all duration-500 hover:-rotate-4"></div>

                        {/* Top Card (Active) */}
                        <div className="relative w-full h-80 bg-white/80 backdrop-blur-xl border border-white/80 rounded-3xl shadow-2xl p-6 flex flex-col justify-between transform transition-all duration-500 hover:-translate-y-2 hover:shadow-emerald-100/50">

                            {/* Card Header */}
                            <div className="flex items-center justify-between">
                                <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 border border-emerald-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    每日一琢
                                </div>
                                <div className="text-neutral-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                </div>
                            </div>

                            {/* Card Content */}
                            <div className="space-y-4">
                                <h3 className="text-xl font-serif text-neutral-800 leading-snug">
                                    谈谈“最近发展区”理论对教学的启示？
                                </h3>
                                <div className="h-1 w-12 bg-emerald-500 rounded-full"></div>
                                <p className="text-sm text-neutral-500 leading-relaxed font-sans">
                                    维果斯基认为，儿童有两种发展水平：一是现有的水平，二是可能达到的水平...
                                </p>
                            </div>

                            {/* Card Footer */}
                            <div className="pt-4 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-400">
                                <span>记忆强度</span>
                                <div className="w-24 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                    <div className="w-[85%] h-full bg-emerald-500 rounded-full"></div>
                                </div>
                            </div>
                        </div>

                        {/* Floating Pills - Repositioned to avoid blocking text */}
                        <div className="absolute -right-16 top-0 bg-white/80 backdrop-blur border border-white/50 px-3 py-1.5 rounded-full text-xs font-medium text-emerald-700 shadow-lg animate-bounce delay-700">
                            记忆率 +40%
                        </div>
                        <div className="absolute -left-12 bottom-12 bg-white/80 backdrop-blur border border-white/50 px-3 py-1.5 rounded-full text-xs font-medium text-amber-600 shadow-lg animate-bounce delay-1000">
                            连续打卡 12 天 🔥
                        </div>
                    </div>
                </div>
            </main>

            {/* Features Section */}
            <section id="features" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">为什么选择“琢玉”？</h2>
                        <p className="text-neutral-500 max-w-2xl mx-auto">
                            传统的备考方式往往陷入“资料堆积”与“无效刷题”的怪圈。我们用技术让学习回归本质。
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="group p-8 rounded-2xl border border-neutral-100 bg-neutral-50 hover:bg-white hover:shadow-xl hover:shadow-emerald-100/50 transition-all duration-300">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <span className="text-2xl">📚</span>
                            </div>
                            <h3 className="text-xl font-bold mb-3">Mineru 智能导入</h3>
                            <p className="text-neutral-500 leading-relaxed text-sm">
                                资料比书还厚？一键上传 PDF，AI 自动提取考点与真题，将死板的文档转化为可交互的知识库。
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="group p-8 rounded-2xl border border-neutral-100 bg-neutral-50 hover:bg-white hover:shadow-xl hover:shadow-emerald-100/50 transition-all duration-300">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <span className="text-2xl">🧠</span>
                            </div>
                            <h3 className="text-xl font-bold mb-3">艾宾浩斯记忆曲线</h3>
                            <p className="text-neutral-500 leading-relaxed text-sm">
                                错题做完就忘？系统根据遗忘规律自动安排复习计划，只在关键节点提醒你回顾，告别无效重复。
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="group p-8 rounded-2xl border border-neutral-100 bg-neutral-50 hover:bg-white hover:shadow-xl hover:shadow-emerald-100/50 transition-all duration-300">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <span className="text-2xl">💡</span>
                            </div>
                            <h3 className="text-xl font-bold mb-3">上下文 AI 助教</h3>
                            <p className="text-neutral-500 leading-relaxed text-sm">
                                解析看不懂？基于当前章节内容的深度答疑，像私教一样为你拆解每一个晦涩难懂的知识点。
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
