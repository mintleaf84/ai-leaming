/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ChatMessage from '../ChatMessage';

// Mock dependencies
vi.mock('next/dynamic', () => ({
  default: (loader: unknown) => {
    const Component = React.lazy(loader);
    return function MockDynamic(props: unknown) {
      return (
        <React.Suspense fallback={null}>
          <Component {...props} />
        </React.Suspense>
      );
    };
  }
}));

vi.mock('../MarkdownViewer', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-viewer">{content}</div>
}));

vi.mock('../ThinkingBlock', () => ({
  default: ({ content, isThinking }: { content: string; isThinking: boolean }) => (
    <div data-testid="thinking-block">
      {content}
      {isThinking && <span data-testid="thinking-indicator">...</span>}
    </div>
  )
}));

vi.mock('@/hooks/use-smooth-stream', () => ({
  useSmoothStream: ({ onUpdate }: unknown) => {
    const contentRef = React.useRef('');
    return {
      addChunk: vi.fn().mockImplementation((chunk: string) => {
        contentRef.current += chunk;
        onUpdate(contentRef.current);
      }),
      reset: vi.fn().mockImplementation((val: string) => {
        contentRef.current = val;
        onUpdate(val);
      }),
    };
  }
}));

describe('ChatMessage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides action buttons when isLoading is true', async () => {
    const assistantMsg = { id: '1', role: 'assistant', content: 'Hello' };
    render(<ChatMessage message={assistantMsg} isLast={true} isLoading={true} />);
    
    // 演进点：验证加载中不显示“复制”等按钮
    expect(screen.queryByText('复制')).not.toBeInTheDocument();
  });

  it('shows pulse cursor during streaming (not in thinking)', async () => {
    const assistantMsg = { id: '1', role: 'assistant', content: 'Hello' };
    const { container } = render(<ChatMessage message={assistantMsg} isLast={true} isLoading={true} />);
    
    // 演进点：由于 Mock 的 useSmoothStream 会被 useEffect 调用，这里能拿到内容并渲染主气泡
    expect(await screen.findByTestId('markdown-viewer')).toHaveTextContent('Hello');
    const pulseCursor = container.querySelector('.animate-pulse');
    expect(pulseCursor).toBeInTheDocument();
  });

  it('passes isThinking=true to ThinkingBlock when think tag is unclosed and loading', async () => {
    const thinkingMsg = {
      id: '2',
      role: 'assistant',
      content: '<think>I am processing...'
    };
    
    render(<ChatMessage message={thinkingMsg} isLast={true} isLoading={true} />);
    
    // 演进点：验证思考块的动态状态
    expect(await screen.findByTestId('thinking-indicator')).toBeInTheDocument();
  });

  it('handles empty message content gracefully', () => {
    const emptyMsg = { id: '3', role: 'assistant', content: '' };
    const { container } = render(<ChatMessage message={emptyMsg} isLast={false} isLoading={false} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('handles malformed think tags correctly', async () => {
    const malformedMsg = {
      id: '4',
      role: 'assistant',
      content: '<think>Normal message'
    };
    
    render(<ChatMessage message={malformedMsg} isLast={false} isLoading={false} />);
    expect(await screen.findByTestId('thinking-block')).toHaveTextContent('Normal message');
  });
});
