/** @vitest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import NoteEditor from '../NoteEditor';

vi.mock('novel', () => {
    const mockExt = {
        configure: vi.fn().mockReturnThis(),
        extend: vi.fn().mockReturnThis(),
    };
    return {
        EditorRoot: ({ children }: unknown) => <div data-testid="editor-root">{children}</div>,
        EditorContent: ({ onUpdate, slotAfter, initialContent }: unknown) => (
            <div data-testid="editor-content">
                <button 
                    data-testid="simulate-update" 
                    onClick={() => onUpdate({ 
                        editor: { 
                            getJSON: () => ({ type: 'doc', content: [{ type: 'paragraph', text: 'new content' }] }) 
                        } 
                    })}
                >
                    Simulate Update
                </button>
                {slotAfter}
                <div data-testid="initial-content-passed">{JSON.stringify(initialContent || null)}</div>
            </div>
        ),
        EditorCommand: ({ children }: unknown) => <div data-testid="editor-command">{children}</div>,
        EditorCommandEmpty: ({ children }: unknown) => <div>{children}</div>,
        EditorCommandItem: ({ children }: unknown) => <div>{children}</div>,
        EditorCommandList: ({ children }: unknown) => <div>{children}</div>,
        ImageResizer: () => <div data-testid="image-resizer" />,
        handleCommandNavigation: vi.fn(),
        handleImageDrop: vi.fn(),
        handleImagePaste: vi.fn(),
        // Extensions
        AIHighlight: mockExt,
        CharacterCount: mockExt,
        CodeBlockLowlight: mockExt,
        Color: mockExt,
        CustomKeymap: mockExt,
        GlobalDragHandle: mockExt,
        HighlightExtension: mockExt,
        HorizontalRule: mockExt,
        Placeholder: mockExt,
        StarterKit: mockExt,
        TaskItem: mockExt,
        TaskList: mockExt,
        TextStyle: mockExt,
        TiptapImage: mockExt,
        TiptapLink: mockExt,
        TiptapUnderline: mockExt,
        UpdatedImage: mockExt,
        UploadImagesPlugin: vi.fn(() => ({})),
        createImageUpload: vi.fn(() => vi.fn()),
        Command: mockExt,
        createSuggestionItems: vi.fn((items) => items),
        renderItems: vi.fn(),
    };
});

// Mock local sub-components
vi.mock('../extensions', () => ({ defaultExtensions: [] }));
vi.mock('../slash-command', () => ({ slashCommand: {}, suggestionItems: [] }));
vi.mock('../image-upload', () => ({ uploadFn: vi.fn() }));
vi.mock('../selectors', () => ({
    NodeSelector: () => <div />,
    LinkSelector: () => <div />,
    ColorSelector: () => <div />,
    TextButtons: () => <div />,
}));
vi.mock('../generative/generative-menu-switch', () => ({
    default: ({ children }: unknown) => <div>{children}</div>
}));
vi.mock('../QuestionPicker', () => ({
    default: ({ isOpen, onClose }: unknown) => (
        isOpen ? (
            <div data-testid="question-picker">
                Question Picker Open
                <button onClick={onClose}>Close</button>
            </div>
        ) : null
    )
}));

describe('NoteEditor Component', () => {
    const defaultProps = {
        initialContent: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', text: 'hello' }] }),
        onChange: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    it('renders and parses initialContent correctly', () => {
        render(<NoteEditor {...defaultProps} />);
        
        expect(screen.getByTestId('editor-root')).toBeInTheDocument();
        expect(screen.getByText('已保存')).toBeInTheDocument();
        
        // Initial content should be passed to EditorContent
        const initialDisplay = screen.getByTestId('initial-content-passed');
        expect(initialDisplay.textContent).toContain('hello');
    });

    it('handles JSON parse error gracefully', () => {
        render(<NoteEditor initialContent="invalid-json" />);
        expect(screen.getByText('已保存')).toBeInTheDocument();
    });

    it('updates save status and calls onChange on editor update', async () => {
        render(<NoteEditor {...defaultProps} />);
        
        const updateBtn = screen.getByTestId('simulate-update');
        fireEvent.click(updateBtn);
        
        expect(screen.getByText('保存中...')).toBeInTheDocument();
        expect(defaultProps.onChange).toHaveBeenCalledWith(expect.stringContaining('new content'));
        
        // Fast-forward 500ms
        act(() => {
            vi.advanceTimersByTime(500);
        });
        
        expect(screen.getByText('已保存')).toBeInTheDocument();
    });

    it('opens QuestionPicker when custom event is fired', () => {
        render(<NoteEditor {...defaultProps} />);
        
        expect(screen.queryByTestId('question-picker')).not.toBeInTheDocument();
        
        // Dispatch custom event
        act(() => {
            window.dispatchEvent(new CustomEvent('open-question-picker'));
        });
        
        expect(screen.getByTestId('question-picker')).toBeInTheDocument();
        
        // Close it
        fireEvent.click(screen.getByText('Close'));
        expect(screen.queryByTestId('question-picker')).not.toBeInTheDocument();
    });
});
