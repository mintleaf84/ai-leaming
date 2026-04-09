'use client';

import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import {
  Search,
  Settings,
  Bell,
  Sun,
  Moon,
  Users,
  Coins,
  BookOpen,
  Activity,
  LayoutDashboard,
  BrainCircuit,
  PieChart,
  Calendar,
  User,
  ChevronDown
} from 'lucide-react';

// === Mock Data ===
const lineChartData = [
  { name: '26年1月', active: 45, practice: 2100 },
  { name: '26年2月', active: 52, practice: 1800 },
  { name: '26年3月', active: 60, practice: 2500 },
  { name: '26年4月', active: 68, practice: 1945 },
];

const barChartData = [
  { name: '周一', chatToken: 4000, docToken: 2400 },
  { name: '周二', chatToken: 3000, docToken: 1398 },
  { name: '周三', chatToken: 2000, docToken: 9800 },
  { name: '周四', chatToken: 2780, docToken: 3908 },
  { name: '周五', chatToken: 1890, docToken: 4800 },
  { name: '周六', chatToken: 2390, docToken: 3800 },
  { name: '周日', chatToken: 3490, docToken: 4300 },
];

export default function AdminDashboardDemo() {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* ===== Sidebar ===== */}
      <aside className="w-64 flex flex-col bg-card border-r border-border hidden md:flex">
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
            琢
          </div>
          <span className="font-bold text-xl tracking-wide">琢玉 Admin</span>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase px-3 mb-2">主菜单</p>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 text-primary cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <LayoutDashboard size={18} />
              <span className="font-medium">数据大盘</span>
            </div>
            <ChevronDown size={14} />
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <BookOpen size={18} />
              <span className="font-medium">题库管理</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <BrainCircuit size={18} />
              <span className="font-medium">AI 分析参数</span>
            </div>
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">专业版</span>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <PieChart size={18} />
              <span className="font-medium">行为聚合</span>
            </div>
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">专业版</span>
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase px-3 mt-6 mb-2">其他</p>

          <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
            <Calendar size={18} />
            <span className="font-medium">调度日历</span>
          </div>

          <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
            <User size={18} />
            <span className="font-medium">用户列表</span>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer transition-colors mt-auto">
            <div className="flex items-center gap-3">
              <Settings size={18} />
              <span className="font-medium">系统设置</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ===== Main Content Area ===== */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">

        {/* Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            {/* Title / Breadcrumb (Mobile) */}
            <div className="md:hidden font-bold text-lg text-primary flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">琢</div>
            </div>
          </div>

          {/* Search Bar - Center to Right */}
          <div className="flex-1 max-w-md hidden lg:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="搜索数据指标..."
                className="w-full bg-muted/50 border border-border rounded-full py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>

          <div className="flex flex-1 justify-end items-center gap-3 lg:gap-5">
            <div className="flex bg-muted/50 rounded-full p-1 border border-border">
              <button className="p-1.5 rounded-full bg-background text-foreground shadow-sm">
                <Sun size={14} />
              </button>
              <button className="p-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors">
                <Moon size={14} />
              </button>
            </div>

            <button className="relative p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border-[1.5px] border-card"></span>
            </button>

            <div className="flex items-center gap-3 pl-2 sm:pl-4 border-l border-border cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-secondary-foreground text-background flex items-center justify-center overflow-hidden font-bold text-sm">
                琢玉
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-sm font-semibold leading-none mb-1">琢玉团队</span>
                <span className="text-xs text-muted-foreground leading-none">超级管理员</span>
              </div>
              <ChevronDown size={14} className="text-muted-foreground ml-1" />
            </div>
          </div>
        </header>

        {/* Scrollable Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">琢玉后台数据总览</h1>
            <p className="text-muted-foreground text-sm">监控系统各项核心指标数据</p>
          </div>

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-8">

            {/* Card 1: 用户数量 */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Users size={20} />
                </div>
                <span className="text-muted-foreground/50 hover:text-foreground cursor-pointer">•••</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold">100+</h3>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-muted-foreground text-sm font-medium">总注册用户数量</p>
                  <span className="text-emerald-500 text-xs font-semibold flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    +1.2%
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Token 消耗量 */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <Coins size={20} />
                </div>
                <span className="text-muted-foreground/50 hover:text-foreground cursor-pointer">•••</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold">3231w</h3>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-muted-foreground text-sm font-medium">全局Token消耗量</p>
                  <span className="text-emerald-500 text-xs font-semibold flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    +4.35%
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: 练习次数 */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <BookOpen size={20} />
                </div>
                <span className="text-muted-foreground/50 hover:text-foreground cursor-pointer">•••</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold">8345次</h3>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-muted-foreground text-sm font-medium">累计习题练习次数</p>
                  <span className="text-emerald-500 text-xs font-semibold flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    +2.59%
                  </span>
                </div>
              </div>
            </div>



          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* Line Chart */}
            <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold">活跃与练习趋势图</h2>
                <select className="bg-muted text-sm px-3 py-1.5 rounded-md border border-border outline-none focus:ring-1 focus:ring-primary">
                  <option>月度</option>
                  <option>本周</option>
                  <option>年度</option>
                </select>
              </div>
              <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      dy={10}
                    />
                    <YAxis
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}
                      itemStyle={{ fontWeight: 600 }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line
                      yAxisId="right"
                      name="活跃用户"
                      type="monotone"
                      dataKey="active"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#8b5cf6' }}
                    />
                    <Line
                      yAxisId="left"
                      name="练习频次"
                      type="monotone"
                      dataKey="practice"
                      stroke="var(--primary)"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--primary)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold">各项 Token 消耗分布</h2>
                  <p className="text-sm text-muted-foreground mt-1">本周用量峰值</p>
                </div>
                <select className="bg-muted text-sm px-3 py-1.5 rounded-md border border-border outline-none focus:ring-1 focus:ring-primary">
                  <option>本周</option>
                  <option>上周</option>
                </select>
              </div>

              <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar name="AI 对话交互" dataKey="chatToken" stackId="a" fill="#8b5cf6" radius={[0, 0, 4, 4]} />
                    <Bar name="文档解析与 OCR" dataKey="docToken" stackId="a" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
