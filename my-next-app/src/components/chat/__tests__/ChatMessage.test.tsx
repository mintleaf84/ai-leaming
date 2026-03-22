/** @vitest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ChatMessage from '../ChatMessage';

// Mock next/dynamic to return the component directly
vi.mock('next/dynamic', () => ({
  default: (loader: any) => {
    const Component = React.lazy(loader);
    return function MockDynamic(props: any) {
      return (
        <React.Suspense fallback={null}>
          <Component {...props} />
        </React.Suspense>
      );
    };
  }
}));

// Mock the heavy components that are dynamically imported
vi.mock('../MarkdownViewer', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-viewer">{content}</div>
}));

vi.mock('../ThinkingBlock', () => ({
  default: ({ content }: { content: string }) => <div data-testid="thinking-block">{content}</div>
}));

vi.mock('@/hooks/use-smooth-stream', () => ({
  useSmoothStream: () => ({
    addChunk: vi.fn(),
    reset: vi.fn(),
  })
}));

describe('ChatMessage Component', () => {
  const mockMessage = {
    id: '1',
    role: 'user',
    content: 'Hello World'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user message correctly', async () => {
    render(<ChatMessage message={mockMessage} isLast={false} isLoading={false} />);
    
    expect(await screen.findByTestId('markdown-viewer')).toHaveTextContent('Hello World');
    expect(screen.queryByText('复制')).not.toBeInTheDocument();
  });

  it('renders assistant message with action buttons', async () => {
    const assistantMsg = { ...mockMessage, role: 'assistant', id: 'assistant-1' };
    render(<ChatMessage 
      message={assistantMsg} 
      isLast={false} 
      isLoading={false} 
      onSaveToKnowledge={vi.fn()} 
      onToggleFavorite={vi.fn()}
    />);
    
    // Use findBy to handle potential suspense/dynamic issues
    expect(await screen.findByText('复制')).toBeInTheDocument();
    expect(screen.getByText('知识卡片')).toBeInTheDocument();
    expect(screen.getByText('收藏')).toBeInTheDocument();
  });

  it('parses <think> tags and displays ThinkingBlock', async () => {
    const thinkingMsg = {
      id: '2',
      role: 'assistant',
      content: '<think>Let me think...</think>Final answer.'
    };
    
    render(<ChatMessage message={thinkingMsg} isLast={false} isLoading={false} />);
    
    expect(await screen.findByTestId('thinking-block')).toHaveTextContent('Let me think...');
    expect(screen.getByTestId('markdown-viewer')).toHaveTextContent('Final answer.');
  });

  it('calls onDelete callback when delete button is clicked', async () => {
    const onDelete = vi.fn();
    render(<ChatMessage message={mockMessage} isLast={false} isLoading={false} onDelete={onDelete} />);
    
    // User message logic check: Does it have a delete button?
    // In ChatMessage.tsx: {onDelete && ( <button ...>删除</button> )}
    // This is outside the isAssistant block.
    const deleteBtn = await screen.findByText('删除');
    fireEvent.click(deleteBtn);
    
    expect(onDelete).toHaveBeenCalled();
  });

  it('handles clipboard copy correctly', async () => {
    // Mock navigator.clipboard
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(true)
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true
    });

    const assistantMsg = { ...mockMessage, role: 'assistant', id: 'assistant-1' };
    render(<ChatMessage message={assistantMsg} isLast={false} isLoading={false} />);
    
    const copyBtn = await screen.findByText('复制');
    fireEvent.click(copyBtn);
    
    expect(mockClipboard.writeText).toHaveBeenCalled();
    expect(await screen.findByText('已复制')).toBeInTheDocument();
  });
});
