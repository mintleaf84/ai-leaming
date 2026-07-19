"use client";

import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  type EditorInstance,
  EditorRoot,
  ImageResizer,
  type JSONContent,
  handleCommandNavigation,
  handleImageDrop,
  handleImagePaste,
} from "novel";
import { useState, useRef, useEffect, useCallback } from "react";
import { defaultExtensions } from "./extensions";
import { slashCommand, suggestionItems } from "./slash-command";
import { uploadFn } from "./image-upload";
import {
  NodeSelector,
  LinkSelector,
  ColorSelector,
  TextButtons,
} from "./selectors";
import { Separator } from "@/components/ui/separator";
import GenerativeMenuSwitch from "./generative/generative-menu-switch";
import QuestionPicker from "./QuestionPicker";

const extensions = [...defaultExtensions, slashCommand];

interface NoteEditorProps {
  initialContent?: string | null;
  onChange?: (content: string) => void;
}

export default function NoteEditor({
  initialContent,
  onChange,
}: NoteEditorProps) {
  const [content, _setContent] = useState<JSONContent | null>(() => {
    if (!initialContent) return null;
    try {
      return JSON.parse(initialContent);
    } catch (_e) {
      // 兼容历史纯文本内容，转换为最小合法文档结构
      return {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: initialContent }],
          },
        ],
      };
    }
  });
  const [saveStatus, setSaveStatus] = useState("已保存");

  // Bubble Menu 状态
  const [openNode, setOpenNode] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [openAI, setOpenAI] = useState(false);

  // QuestionPicker 状态
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);
  const editorRef = useRef<EditorInstance | null>(null);

  // 处理插入题目引用
  const handleInsertQuestion = useCallback((questionId: number) => {
    if (editorRef.current) {
      editorRef.current
        .chain()
        .focus()
        .insertContent({
          type: "questionEmbed",
          attrs: { questionId },
        })
        .run();
    }
  }, []);

  // 监听自定义事件以打开 QuestionPicker
  useEffect(() => {
    const handleOpenPicker = () => setShowQuestionPicker(true);
    window.addEventListener("open-question-picker", handleOpenPicker);
    return () =>
      window.removeEventListener("open-question-picker", handleOpenPicker);
  }, []);

  // 防抖保存
  const handleUpdate = (editor: EditorInstance) => {
    editorRef.current = editor;
    setSaveStatus("保存中...");
    const json = editor.getJSON();

    if (onChange) {
      onChange(JSON.stringify(json));
    }

    setTimeout(() => setSaveStatus("已保存"), 500);
  };

  return (
    <div className="relative w-full max-w-screen-lg">
      {/* 保存状态指示器 */}
      <div className="flex absolute right-5 top-5 z-10 mb-5 gap-2">
        <div className="rounded-lg bg-accent px-2 py-1 text-sm text-muted-foreground">
          {saveStatus}
        </div>
      </div>

      <EditorRoot>
        <EditorContent
          initialContent={content || undefined}
          extensions={extensions}
          className="relative min-h-[500px] w-full max-w-screen-lg border-muted bg-background sm:mb-[calc(10vh)] sm:rounded-lg sm:border sm:shadow-lg"
          editorProps={{
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event),
            },
            handlePaste: (view, event) =>
              handleImagePaste(view, event, uploadFn),
            handleDrop: (view, event, _slice, moved) =>
              handleImageDrop(view, event, moved, uploadFn),
            attributes: {
              class:
                "prose prose-lg dark:prose-invert prose-headings:font-bold font-default focus:outline-none max-w-full p-8",
            },
          }}
          onUpdate={({ editor }) => handleUpdate(editor)}
          slotAfter={<ImageResizer />}
        >
          {/* Slash Command 菜单 */}
          <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-muted bg-background px-1 py-2 shadow-md transition-all">
            <EditorCommandEmpty className="px-2 text-muted-foreground">
              未找到匹配的命令
            </EditorCommandEmpty>
            <EditorCommandList>
              {suggestionItems.map((item) => (
                <EditorCommandItem
                  value={item.title}
                  onCommand={(val) => item.command?.(val)}
                  className="flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent aria-selected:bg-accent"
                  key={item.title}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-muted bg-background">
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </EditorCommandItem>
              ))}
            </EditorCommandList>
          </EditorCommand>

          {/* Generative Bubble Menu */}
          <GenerativeMenuSwitch open={openAI} onOpenChange={setOpenAI}>
            <Separator orientation="vertical" />
            <NodeSelector open={openNode} onOpenChange={setOpenNode} />
            <Separator orientation="vertical" />
            <LinkSelector open={openLink} onOpenChange={setOpenLink} />
            <Separator orientation="vertical" />
            <TextButtons />
            <Separator orientation="vertical" />
            <ColorSelector open={openColor} onOpenChange={setOpenColor} />
          </GenerativeMenuSwitch>
        </EditorContent>
      </EditorRoot>

      {/* 题目选择器弹窗 */}
      <QuestionPicker
        isOpen={showQuestionPicker}
        onClose={() => setShowQuestionPicker(false)}
        onSelect={handleInsertQuestion}
      />
    </div>
  );
}
