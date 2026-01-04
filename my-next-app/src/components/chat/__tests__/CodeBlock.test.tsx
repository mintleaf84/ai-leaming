
import { render, screen, fireEvent } from '@testing-library/react';
import CodeBlock from '../CodeBlock';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock Navigator Clipboard
const mockWriteText = vi.fn();
Object.assign(navigator, {
    clipboard: {
        writeText: mockWriteText,
    },
});

describe('CodeBlock', () => {
    beforeEach(() => {
        mockWriteText.mockClear();
    });

    it('renders code content and language', () => {
        const code = 'console.log("hello")';
        const language = 'javascript';

        // 注意：Prism 可能会把代码分割成多个 span，但整体内容应该在文档中
        render(<CodeBlock language={language} value={code} />);

        // 检查是否显示特定文字（SyntaxHighlighter 可能会拆分，但 textContent 应包含它）
        // 使用 getAllByText 或 container 查询比较稳妥
        const preview = screen.getByText(/console/i);
        expect(preview).toBeInTheDocument();

        // 检查语言标识
        expect(screen.getByText(language)).toBeInTheDocument();
    });

    it('copies code to clipboard when button is clicked', async () => {
        const code = 'const a = 1;';
        render(<CodeBlock language="typescript" value={code} />);

        const copyButton = screen.getByLabelText('复制代码');

        fireEvent.click(copyButton);

        expect(mockWriteText).toHaveBeenCalledWith(code);
        expect(mockWriteText).toHaveBeenCalledTimes(1);
    });
});
