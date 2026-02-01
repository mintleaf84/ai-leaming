import { ArrowDownWideNarrow, CheckCheck, RefreshCcwDot, StepForward, WrapText } from 'lucide-react';
import { useEditor } from 'novel';
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';

const options = [
    {
        value: 'improve',
        label: '润色写作',
        icon: RefreshCcwDot,
    },
    {
        value: 'fix',
        label: '修复语法',
        icon: CheckCheck,
    },
    {
        value: 'shorter',
        label: '精简篇幅',
        icon: ArrowDownWideNarrow,
    },
    {
        value: 'longer',
        label: '扩充篇幅',
        icon: WrapText,
    },
];

interface AISelectorCommandsProps {
    onSelect: (value: string, option: string) => void;
}

const AISelectorCommands = ({ onSelect }: AISelectorCommandsProps) => {
    const { editor } = useEditor();

    if (!editor) return null;

    return (
        <>
            <CommandGroup heading="编辑或优化选中内容">
                {options.map((option) => (
                    <CommandItem
                        onSelect={() => {
                            const slice = editor.state.selection.content();
                            // 使用安全的 textBetween 方法，避免依赖可能不存在的 markdown 扩展
                            const text = slice.content.textBetween(0, slice.content.size, '\n');
                            console.log('[AISelectorCommands] Selected text:', text, 'Option:', option.value);
                            if (!text.trim()) {
                                console.warn('[AISelectorCommands] No text selected!');
                            }
                            onSelect(text, option.value);
                        }}
                        className="flex gap-2 px-4"
                        key={option.value}
                        value={option.value}
                    >
                        <option.icon className="h-4 w-4 text-purple-500" />
                        {option.label}
                    </CommandItem>
                ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="使用 AI 做更多">
                <CommandItem
                    onSelect={() => {
                        const pos = editor.state.selection.from;
                        // 使用安全的 textBetween 方法获取光标前的文本，避免 getPrevText 的 serializer 错误
                        const start = Math.max(0, pos - 5000); // 最多获取前5000个字符
                        const text = editor.state.doc.textBetween(start, pos, '\n');
                        onSelect(text, 'continue');
                    }}
                    value="continue"
                    className="gap-2 px-4"
                >
                    <StepForward className="h-4 w-4 text-purple-500" />
                    继续以此续写
                </CommandItem>
            </CommandGroup>
        </>
    );
};

export default AISelectorCommands;
