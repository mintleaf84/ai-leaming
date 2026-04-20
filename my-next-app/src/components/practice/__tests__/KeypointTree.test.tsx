/** @vitest-environment jsdom */
import { render, screen, fireEvent, _waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { KeypointTree, KeypointNode } from '../KeypointTree';

// Mock useQuery
const mockUseQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

// Mock fetchJson
vi.mock('@/lib/utils/api-client', () => ({
    fetchJson: vi.fn(),
}));

const mockData: KeypointNode[] = [
    {
        id: 1,
        name: '数学',
        count: 10,
        children: [
            {
                id: 11,
                name: '代数',
                count: 5,
                children: [
                    { id: 111, name: '方程', count: 3, children: null },
                    { id: 112, name: '不等式', count: 2, children: null },
                ]
            },
            { id: 12, name: '几何', count: 5, children: null }
        ]
    },
    {
        id: 2,
        name: '英语',
        count: 5,
        children: null
    }
];

describe('KeypointTree Component', () => {
    const defaultProps = {
        selectedTags: [],
        onSelectionChange: vi.fn(),
        maxHeight: '400px',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseQuery.mockReturnValue({
            data: mockData,
            isLoading: false,
        });
    });

    it('renders initial tree correctly (first level expanded by default)', () => {
        render(<KeypointTree {...defaultProps} />);
        
        expect(screen.getByText('数学')).toBeInTheDocument();
        expect(screen.getByText('英语')).toBeInTheDocument();
        
        // Check if children of '数学' are visible (because first level is expanded by useEffect)
        expect(screen.getByText('代数')).toBeInTheDocument();
        expect(screen.getByText('几何')).toBeInTheDocument();
    });

    it('shows loading state', () => {
        mockUseQuery.mockReturnValue({
            data: [],
            isLoading: true,
        });
        render(<KeypointTree {...defaultProps} />);
        expect(screen.getByText('加载知识点结构...')).toBeInTheDocument();
    });

    it('toggles node expansion', () => {
        render(<KeypointTree {...defaultProps} />);
        
        // '代数' has children ('方程'), let's check if '方程' is visible initially
        // Wait, the component only expands the FIRST level automatically.
        // First level is ID 1 (数学) and 2 (英语).
        // So '代数' (ID 11) is visible, but its children are NOT visible yet.
        expect(screen.queryByText('方程')).not.toBeInTheDocument();

        // Find the expand button for '代数'
        // In the code, it's a button with ChevronRight/Down
        const _toggleButtons = screen.getAllByRole('button');
        // This is a bit brittle, let's find by clicking the name if it's supposed to expand?
        // No, clicking the name toggles SELECT. Clicking the Chevron toggles EXPAND.
        
        // Let's use the text '代数' to find the container and then the button
        const daishuContainer = screen.getByText('代数').closest('div');
        const expandBtn = daishuContainer?.querySelector('button');
        
        if (expandBtn) {
            fireEvent.click(expandBtn);
        }
        
        expect(screen.getByText('方程')).toBeInTheDocument();
    });

    it('filters nodes based on search term', () => {
        render(<KeypointTree {...defaultProps} />);
        
        const searchInput = screen.getByPlaceholderText('搜索知识点...');
        fireEvent.change(searchInput, { target: { value: '几何' } });
        
        expect(screen.getByText('几何')).toBeInTheDocument();
        expect(screen.queryByText('代数')).not.toBeInTheDocument();
        // Father node '数学' should still be visible because it contains '几何'
        expect(screen.getByText('数学')).toBeInTheDocument();
    });

    it('calls onSelectionChange when checkbox is clicked', () => {
        render(<KeypointTree {...defaultProps} />);
        
        // Checkbox for '英语'
        const yingyuContainer = screen.getByText('英语').closest('div');
        const checkbox = yingyuContainer?.querySelector('button[role="checkbox"]');
        
        if (checkbox) {
            fireEvent.click(checkbox);
        }
        
        expect(defaultProps.onSelectionChange).toHaveBeenCalledWith(['英语']);
    });

    it('handles Toolbar actions: Expand All / Collapse All', () => {
        render(<KeypointTree {...defaultProps} />);
        
        // Initially '方程' is hidden
        expect(screen.queryByText('方程')).not.toBeInTheDocument();
        
        const expandAllBtn = screen.getByText('展开全部');
        fireEvent.click(expandAllBtn);
        expect(screen.getByText('方程')).toBeInTheDocument();
        
        const collapseAllBtn = screen.getByText('折叠全部');
        fireEvent.click(collapseAllBtn);
        // Due to useEffect in KeypointTree.tsx, if expandedIds.size === 0, it re-expands first level.
        // So first level children (like '代数') are still visible, but deeper ones (like '方程') are hidden.
        expect(screen.queryByText('方程')).not.toBeInTheDocument();
        expect(screen.getByText('代数')).toBeInTheDocument();
        expect(screen.getByText('数学')).toBeInTheDocument();
    });

    it('clears selection when clear button is clicked', () => {
        const propsWithSelection = {
            ...defaultProps,
            selectedTags: ['数学', '英语'],
        };
        render(<KeypointTree {...propsWithSelection} />);
        
        const clearBtn = screen.getByText(/清空/);
        fireEvent.click(clearBtn);
        
        expect(defaultProps.onSelectionChange).toHaveBeenCalledWith([]);
    });

    it('shows selected children count badge', () => {
        // If '方程' is selected, its parent '代数' should show '1选中'
        // and grandparent '数学' should show '1选中'
        const propsWithSubSelection = {
            ...defaultProps,
            selectedTags: ['方程'],
        };
        render(<KeypointTree {...propsWithSubSelection} />);
        
        // Expand to see '代数'
        // '数学' is already expanded by default.
        expect(screen.getByText('代数')).toBeInTheDocument();
        // Both '数学' and '代数' will have '1选中' badge
        const badges = screen.getAllByText('1选中');
        expect(badges.length).toBeGreaterThanOrEqual(2);
    });
});
