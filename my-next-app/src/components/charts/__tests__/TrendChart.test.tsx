/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AccuracyTrendChart, PracticedBarChart, CombinedTrendChart } from '../TrendChart';

// Mock next/dynamic to render components synchronously
vi.mock('next/dynamic', () => ({
    default: (_loader: unknown) => {
        // Simple mock that renders children or a div
        const MockComponent = (props: unknown) => (
            <div data-testid="mock-chart-component" {...props}>
                {props.children}
            </div>
        );
        MockComponent.displayName = 'MockDynamicComponent';
        return MockComponent;
    }
}));

// Mock recharts (though next/dynamic mock should handle most of it)
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: unknown) => <div data-testid="responsive-container">{children}</div>,
    AreaChart: ({ children }: unknown) => <div data-testid="area-chart">{children}</div>,
    Area: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
    BarChart: ({ children }: unknown) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => <div />,
    ComposedChart: ({ children }: unknown) => <div data-testid="composed-chart">{children}</div>,
    Line: () => <div />,
}));

const mockData = [
    { displayDate: '2023-01-01', accuracy: 80, practiced: 10, correct: 8, timestamp: Date.now() },
    { displayDate: '2023-01-02', accuracy: 90, practiced: 20, correct: 18, timestamp: Date.now() },
] as unknown;

describe('TrendChart Components', () => {
    it('renders AccuracyTrendChart correctly', () => {
        render(<AccuracyTrendChart data={mockData} />);
        // next/dynamic mock 会用 mock-chart-component 替代所有动态加载的图表组件
        const charts = screen.getAllByTestId('mock-chart-component');
        expect(charts.length).toBeGreaterThan(0);
    });

    it('renders PracticedBarChart correctly', () => {
        render(<PracticedBarChart data={mockData} />);
        const charts = screen.getAllByTestId('mock-chart-component');
        expect(charts.length).toBeGreaterThan(0);
    });

    it('renders CombinedTrendChart correctly', () => {
        render(<CombinedTrendChart data={mockData} />);
        const charts = screen.getAllByTestId('mock-chart-component');
        expect(charts.length).toBeGreaterThan(0);
    });
});
