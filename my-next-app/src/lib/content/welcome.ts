export const WELCOME_NOTE_CONTENT = {
    type: 'doc',
    content: [
        {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: '👋 欢迎使用智能笔记' }],
        },
        {
            type: 'paragraph',
            content: [
                { type: 'text', text: '这是一个基于 ' },
                { type: 'text', marks: [{ type: 'bold' }], text: 'AI 驱动' },
                { type: 'text', text: ' 的现代化笔记应用。在这里，你可以体验流畅的写作和强大的 AI 辅助功能。' },
            ],
        },
        { type: 'horizontalRule' },
        {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: '🚀 快速上手指南' }],
        },
        {
            type: 'taskList',
            content: [
                {
                    type: 'taskItem',
                    attrs: { checked: false },
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                { type: 'text', marks: [{ type: 'bold' }], text: '唤起命令菜单' },
                                { type: 'text', text: '：在空行输入 ' },
                                { type: 'text', marks: [{ type: 'code' }], text: '/' },
                                { type: 'text', text: ' 即可插入标题、列表、图片等。' },
                            ],
                        },
                    ],
                },
                {
                    type: 'taskItem',
                    attrs: { checked: false },
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                { type: 'text', marks: [{ type: 'bold' }], text: '使用 AI 助手' },
                                { type: 'text', text: '：' },
                                { type: 'text', marks: [{ type: 'highlight', attrs: { color: '#faf594' } }], text: '选中这段文字' },
                                { type: 'text', text: '，点击浮出的 ' },
                                { type: 'text', marks: [{ type: 'bold' }], text: 'AI 助手' },
                                { type: 'text', text: ' 按钮，尝试“润色”或“续写”。' },
                            ],
                        },
                    ],
                },
                {
                    type: 'taskItem',
                    attrs: { checked: false },
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                { type: 'text', marks: [{ type: 'bold' }], text: 'Markdown 语法' },
                                { type: 'text', text: '：不仅支持鼠标操作，还支持标准的 Markdown 快捷键。' },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: '💡 Tips' }],
        },
        {
            type: 'blockquote',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: '试着把光标移到这行文字左侧，你会看到一个可以拖拽的手柄，用它可以随意排列段落顺序！' }],
                },
            ],
        },
        {
            type: 'codeBlock',
            attrs: { language: 'javascript' },
            content: [
                {
                    type: 'text',
                    text: '// 代码高亮示例\nconsole.log("Hello, AI Note!");',
                },
            ],
        },
        {
            type: 'paragraph',
            content: [{ type: 'text', text: '祝你写作愉快！🎉' }],
        },
    ],
};
