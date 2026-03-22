/** @vitest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ChatSidebar from '../ChatSidebar';

// Mock useTerminology
vi.mock('@/lib/hooks/use-terminology', () => ({
  useTerminology: () => ({
    t: (key: string) => {
        const terms: Record<string, string> = {
            'chat.new': '新建对话',
            'chat.search': '搜索聊天记录...',
            'chat.favorites': '我的收藏',
            'chat.empty': '暂无历史对话',
        };
        return terms[key] || key;
    }
  })
}));

describe('ChatSidebar Component', () => {
  const mockSessions = [
    { id: 1, title: 'Session 1', updated_at: '2023-01-01T10:00:00Z', message_count: 5 },
    { id: 2, title: 'Session 2', updated_at: '2023-01-02T11:00:00Z', message_count: 2 },
  ];

  const defaultProps = {
    sessions: mockSessions,
    currentSessionId: 1,
    onSessionSelect: vi.fn(),
    onNewSession: vi.fn(),
    onDeleteSession: vi.fn(),
    showFavorites: false,
    onToggleShowFavorites: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.confirm
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('renders session list correctly', () => {
    render(<ChatSidebar {...defaultProps} />);
    
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('Session 2')).toBeInTheDocument();
    expect(screen.getByText('5 条消息')).toBeInTheDocument();
  });

  it('calls onNewSession when new button is clicked', () => {
    render(<ChatSidebar {...defaultProps} />);
    
    const newBtn = screen.getByText('新建对话');
    fireEvent.click(newBtn);
    
    expect(defaultProps.onNewSession).toHaveBeenCalled();
  });

  it('calls onSessionSelect when a session is clicked', () => {
    render(<ChatSidebar {...defaultProps} />);
    
    const session2Btn = screen.getByText('Session 2');
    fireEvent.click(session2Btn);
    
    expect(defaultProps.onSessionSelect).toHaveBeenCalledWith(2);
  });

  it('calls onDeleteSession when delete button is clicked and confirmed', () => {
    render(<ChatSidebar {...defaultProps} />);
    
    // Deletion button is usually visible on hover (opacity-0 group-hover). 
    // In JSDOM we can still find it.
    // In the component, it's the 2nd button in the group for session 1.
    const deleteBtns = screen.getAllByRole('button').filter(btn => btn.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteBtns[0]);
    
    expect(window.confirm).toHaveBeenCalled();
    expect(defaultProps.onDeleteSession).toHaveBeenCalledWith(1);
  });

  it('updates search query state on input change', () => {
    render(<ChatSidebar {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText('搜索聊天记录...');
    fireEvent.change(searchInput, { target: { value: 'test query' } });
    
    expect(searchInput).toHaveValue('test query');
  });
});
