/* eslint-disable react-hooks/set-state-in-effect */
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react";
import { Send, Loader2, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChatInputHandle {
  focus: () => void;
  setValue: (value: string) => void;
}

interface ChatInputProps {
  isLoading: boolean;
  showFavorites: boolean;
  enableRag: boolean;
  setEnableRag: (enable: boolean) => void;
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
}

// 快捷指令定义
const COMMANDS = [
  { command: "/quiz", description: "生成练习题", example: "/quiz 教育学基础" },
  {
    command: "/explain",
    description: "解释概念",
    example: "/explain 认知发展理论",
  },
];

export const ChatInput = memo(
  forwardRef<ChatInputHandle, ChatInputProps>(
    (
      {
        isLoading,
        showFavorites,
        enableRag,
        setEnableRag,
        onSendMessage,
        onStopGeneration,
      },
      ref,
    ) => {
      const [inputValue, setInputValue] = useState("");
      const [showCommands, setShowCommands] = useState(false);
      const [filteredCommands, setFilteredCommands] = useState(COMMANDS);
      const textareaRef = useRef<HTMLTextAreaElement>(null);

      useImperativeHandle(ref, () => ({
        focus: () => {
          textareaRef.current?.focus();
        },
        setValue: (value: string) => {
          setInputValue(value);
        },
      }));

      // 处理快捷指令输入
      useEffect(() => {
        if (inputValue.startsWith("/")) {
          const query = inputValue.toLowerCase();
          const filtered = COMMANDS.filter((cmd) =>
            cmd.command.startsWith(query),
          );
          setFilteredCommands(filtered);
          setShowCommands(filtered.length > 0);
        } else {
          setShowCommands(false);
        }
      }, [inputValue]);

      const selectCommand = useCallback((command: string) => {
        setInputValue(command + " ");
        setShowCommands(false);
        textareaRef.current?.focus();
      }, []);

      const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue || !inputValue.trim()) return;

        onSendMessage(inputValue);
        setInputValue("");

        // Reset height
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      };

      const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (inputValue.trim() && !isLoading) {
            handleSubmit(e);
          }
        }
        // 按 Tab 选择第一个指令
        if (e.key === "Tab" && showCommands && filteredCommands.length > 0) {
          e.preventDefault();
          selectCommand(filteredCommands[0].command);
        }
        // 按 Esc 关闭指令列表
        if (e.key === "Escape") {
          setShowCommands(false);
        }
      };

      const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        e.target.style.height = "auto";
        e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
        setInputValue(e.target.value);
      };

      return (
        <footer className="p-4 md:p-6 bg-gradient-to-t from-background via-background to-transparent sticky bottom-0 z-20">
          <div className="max-w-3xl mx-auto relative group">
            {/* 快捷指令自动补全 */}
            {showCommands && (
              <div className="absolute bottom-full mb-2 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-10">
                {filteredCommands.map((cmd) => (
                  <button
                    key={cmd.command}
                    onClick={() => selectCommand(cmd.command)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
                  >
                    <code className="text-sm font-mono text-primary">
                      {cmd.command}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {cmd.description}
                    </span>
                    <span className="text-xs text-muted-foreground/50 ml-auto">
                      {cmd.example}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 工具栏与提示 */}
            <div className="flex justify-between items-center mb-2 px-1">
              <div className="text-xs text-muted-foreground/50">
                {showFavorites ? "" : "支持 Shift + Enter 换行"}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs transition-colors ${enableRag ? "text-primary font-medium" : "text-muted-foreground"}`}
                >
                  {enableRag ? "知识库增强已启用" : "知识库增强已关闭"}
                </span>
                <button
                  type="button"
                  onClick={() => setEnableRag(!enableRag)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    enableRag ? "bg-primary" : "bg-input"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      enableRag ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="relative flex items-end gap-2 bg-muted/50 border border-input rounded-2xl p-2 pl-4 focus-within:bg-background focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20 transition-all duration-300 shadow-sm"
            >
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  showFavorites
                    ? "收藏夹模式下无法发送消息"
                    : "输入问题，Shift + Enter 换行，输入 / 查看指令..."
                }
                className="flex-1 max-h-[200px] py-3 bg-transparent border-none focus:ring-0 text-sm resize-none scrollbar-hide font-medium text-foreground placeholder:text-muted-foreground"
                rows={1}
                disabled={isLoading || showFavorites}
              />

              <div className="pb-1 pr-1">
                {isLoading ? (
                  <Button
                    type="button"
                    onClick={onStopGeneration}
                    variant="destructive"
                    size="icon"
                    data-testid="stop-button"
                    className="h-10 w-10 rounded-xl shrink-0 shadow-lg shadow-destructive/20"
                  >
                    <StopCircle className="w-5 h-5" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      !inputValue || !inputValue.trim() || showFavorites
                    }
                    size="icon"
                    data-testid="send-button"
                    className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                )}
              </div>
            </form>

            {isLoading && (
              <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none">
                <span className="bg-background/90 backdrop-blur text-[10px] font-bold text-primary px-3 py-1 rounded-full shadow-sm border border-border flex items-center gap-2 animate-bounce">
                  <Loader2 className="w-3 h-3 animate-spin" /> AI THINKING
                </span>
              </div>
            )}
          </div>
        </footer>
      );
    },
  ),
);

ChatInput.displayName = "ChatInput";
