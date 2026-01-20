import {
    CheckSquare,
    Code,
    Heading1,
    Heading2,
    Heading3,
    ImageIcon,
    List,
    ListOrdered,
    Text,
    TextQuote,
    Minus,
    BookOpen,
} from 'lucide-react';
import { Command, createSuggestionItems, renderItems } from 'novel';
import { uploadFn } from './image-upload';
import Magic from './icons/magic';

export const suggestionItems = createSuggestionItems([
    {
        title: 'AI 续写',
        description: '让 AI 帮你写一段',
        searchTerms: ['ai', 'gpt', 'continue'],
        icon: <Magic className="h-4 w-4" />,
        command: ({ editor, range }) => {
            // 删除 / 命令字符
            editor.chain().focus().deleteRange(range).run();
            // 选中光标前的段落文本以提供上下文
            editor.chain().focus().selectParentNode().run();
            // 注意：AI 助手会在文本被选中时自动出现在 Bubble Menu 中
            // 用户可以点击 "AI 助手" 按钮来触发续写
        },
    },
    {
        title: '文本',
        description: '普通段落文本',
        searchTerms: ['p', 'paragraph', 'text'],
        icon: <Text size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleNode('paragraph', 'paragraph').run();
        },
    },
    {
        title: '待办事项',
        description: '任务检查清单',
        searchTerms: ['todo', 'task', 'list', 'check', 'checkbox'],
        icon: <CheckSquare size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleTaskList().run();
        },
    },
    {
        title: '标题 1',
        description: '大标题',
        searchTerms: ['title', 'big', 'large', 'h1'],
        icon: <Heading1 size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
        },
    },
    {
        title: '标题 2',
        description: '中标题',
        searchTerms: ['subtitle', 'medium', 'h2'],
        icon: <Heading2 size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
        },
    },
    {
        title: '标题 3',
        description: '小标题',
        searchTerms: ['subtitle', 'small', 'h3'],
        icon: <Heading3 size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
        },
    },
    {
        title: '无序列表',
        description: '项目符号列表',
        searchTerms: ['unordered', 'point', 'bullet'],
        icon: <List size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleBulletList().run();
        },
    },
    {
        title: '有序列表',
        description: '数字编号列表',
        searchTerms: ['ordered', 'number'],
        icon: <ListOrdered size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        },
    },
    {
        title: '引用',
        description: '引用段落',
        searchTerms: ['blockquote', 'quote'],
        icon: <TextQuote size={18} />,
        command: ({ editor, range }) =>
            editor.chain().focus().deleteRange(range).toggleNode('paragraph', 'paragraph').toggleBlockquote().run(),
    },
    {
        title: '代码块',
        description: '代码片段',
        searchTerms: ['codeblock', 'code'],
        icon: <Code size={18} />,
        command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
        title: '图片',
        description: '上传本地图片',
        searchTerms: ['photo', 'picture', 'media', 'image'],
        icon: <ImageIcon size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async () => {
                if (input.files?.length) {
                    const file = input.files[0];
                    const pos = editor.view.state.selection.from;
                    uploadFn(file, editor.view, pos);
                }
            };
            input.click();
        },
    },
    {
        title: '分隔线',
        description: '水平分隔线',
        searchTerms: ['hr', 'divider', 'horizontal'],
        icon: <Minus size={18} />,
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setHorizontalRule().run();
        },
    },
    {
        title: '引用题目',
        description: '插入题目引用卡片',
        searchTerms: ['question', 'embed', '题目', '引用', 'timu'],
        icon: <BookOpen size={18} />,
        command: ({ editor, range }) => {
            // 删除 / 命令字符
            editor.chain().focus().deleteRange(range).run();
            // 触发自定义事件打开题目选择器
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('open-question-picker'));
            }
        },
    },
]);

export const slashCommand = Command.configure({
    suggestion: {
        items: () => suggestionItems,
        render: renderItems,
    },
});
