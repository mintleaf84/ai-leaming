import {
    AIHighlight,
    CharacterCount,
    CodeBlockLowlight,
    Color,
    CustomKeymap,
    GlobalDragHandle,
    HighlightExtension,
    HorizontalRule,
    Placeholder,
    StarterKit,
    TaskItem,
    TaskList,
    TextStyle,
    TiptapImage,
    TiptapLink,
    TiptapUnderline,
    UpdatedImage,
    UploadImagesPlugin,
} from 'novel';

import { cx } from 'class-variance-authority';
import { common, createLowlight } from 'lowlight';

// AI 高亮
const aiHighlight = AIHighlight;

// Placeholder 配置
const placeholder = Placeholder.configure({
    placeholder: ({ node }) => {
        if (node.type.name === 'heading') {
            return `标题 ${node.attrs.level}`;
        }
        return '输入 / 唤起命令菜单...';
    },
});

// 链接配置
const tiptapLink = TiptapLink.configure({
    HTMLAttributes: {
        class: cx(
            'text-muted-foreground underline underline-offset-[3px] hover:text-primary transition-colors cursor-pointer'
        ),
    },
});

// 图片配置
const tiptapImage = TiptapImage.extend({
    addProseMirrorPlugins() {
        return [
            UploadImagesPlugin({
                imageClass: cx('opacity-40 rounded-lg border border-stone-200'),
            }),
        ];
    },
}).configure({
    allowBase64: true,
    HTMLAttributes: {
        class: cx('rounded-lg border border-muted'),
    },
});

const updatedImage = UpdatedImage.configure({
    HTMLAttributes: {
        class: cx('rounded-lg border border-muted'),
    },
});

// 任务列表配置
const taskList = TaskList.configure({
    HTMLAttributes: {
        class: cx('not-prose pl-2'),
    },
});

const taskItem = TaskItem.configure({
    HTMLAttributes: {
        class: cx('flex gap-2 items-start my-4'),
    },
    nested: true,
});

// 水平线配置
const horizontalRule = HorizontalRule.configure({
    HTMLAttributes: {
        class: cx('mt-4 mb-6 border-t border-muted-foreground'),
    },
});

// StarterKit 配置
const starterKit = StarterKit.configure({
    bulletList: {
        HTMLAttributes: {
            class: cx('list-disc list-outside leading-3 -mt-2'),
        },
    },
    orderedList: {
        HTMLAttributes: {
            class: cx('list-decimal list-outside leading-3 -mt-2'),
        },
    },
    listItem: {
        HTMLAttributes: {
            class: cx('leading-normal -mb-2'),
        },
    },
    blockquote: {
        HTMLAttributes: {
            class: cx('border-l-4 border-primary'),
        },
    },
    codeBlock: {
        HTMLAttributes: {
            class: cx('rounded-md bg-muted text-muted-foreground border p-5 font-mono font-medium'),
        },
    },
    code: {
        HTMLAttributes: {
            class: cx('rounded-md bg-muted px-1.5 py-1 font-mono font-medium'),
            spellcheck: 'false',
        },
    },
    horizontalRule: false,
    dropcursor: {
        color: '#DBEAFE',
        width: 4,
    },
    gapcursor: false,
});

// 代码块高亮
const codeBlockLowlight = CodeBlockLowlight.configure({
    lowlight: createLowlight(common),
});

// 字数统计
const characterCount = CharacterCount.configure();

// 导出默认扩展
export const defaultExtensions = [
    starterKit,
    placeholder,
    tiptapLink,
    tiptapImage,
    updatedImage,
    taskList,
    taskItem,
    horizontalRule,
    aiHighlight,
    codeBlockLowlight,
    characterCount,
    TiptapUnderline,
    HighlightExtension,
    TextStyle,
    Color,
    CustomKeymap,
    GlobalDragHandle,
];
