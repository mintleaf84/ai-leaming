"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import { TrendDataItem } from '@/server/actions/stats';

// 动态提取所需的 recharts 组件以实现包体积懒加载
const AreaChart = dynamic(() => import('recharts').then(mod => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(mod => mod.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false });
const ComposedChart = dynamic(() => import('recharts').then(mod => mod.ComposedChart), { ssr: false });
const Line = dynamic(() => import('recharts').then(mod => mod.Line), { ssr: false });

interface TrendChartProps {
    data: TrendDataItem[];
    type?: 'accuracy' | 'practiced' | 'combined';
    height?: number;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

// 自定义 Tooltip
const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-card border rounded-lg shadow-lg p-3 text-sm">
                <p className="font-medium text-foreground mb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={index} style={{ color: entry.color }}>
                        {entry.name}: {entry.value}{entry.name === '正确率' ? '%' : ' 题'}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

// 正确率趋势图
export function AccuracyTrendChart({ data, height = 200 }: Omit<TrendChartProps, 'type'>) {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                    <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                    type="monotone"
                    dataKey="accuracy"
                    name="正确率"
                    stroke="hsl(var(--primary))"
                    fill="url(#accuracyGradient)"
                    strokeWidth={2}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

// 练习量柱状图
export function PracticedBarChart({ data, height = 200 }: Omit<TrendChartProps, 'type'>) {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                    dataKey="practiced"
                    name="练习量"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    opacity={0.8}
                />
                <Bar
                    dataKey="correct"
                    name="正确数"
                    fill="hsl(142 76% 36%)"
                    radius={[4, 4, 0, 0]}
                    opacity={0.8}
                />
            </BarChart>
        </ResponsiveContainer>
    );
}

// 综合趋势图 (柱状图 + 折线图)
export function CombinedTrendChart({ data, height = 250 }: Omit<TrendChartProps, 'type'>) {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                    yAxisId="left"
                    dataKey="practiced"
                    name="练习量"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    opacity={0.6}
                />
                <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="accuracy"
                    name="正确率"
                    stroke="hsl(142 76% 36%)"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(142 76% 36%)', r: 3 }}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
