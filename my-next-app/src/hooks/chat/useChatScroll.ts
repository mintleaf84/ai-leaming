
import { useRef, useEffect, useState } from 'react';

interface UseChatScrollProps {
    messagesLength: number;
}

export function useChatScroll({ messagesLength }: UseChatScrollProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [targetMessageId, setTargetMessageId] = useState<number | null>(null);
    const ignoreScrollRef = useRef(false);

    // 自动滚动到底部或目标位置
    useEffect(() => {
        // 1. 如果有目标消息，优先跳转到目标消息
        if (targetMessageId) {
            const element = document.getElementById(`message-${targetMessageId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // 添加高亮动画
                element.classList.add('bg-blue-50/50', 'transition-colors', 'duration-1000');
                setTimeout(() => {
                    element.classList.remove('bg-blue-50/50');
                }, 2000);

                setTargetMessageId(null); // 清除目标状态
                ignoreScrollRef.current = true; // 标记下一次渲染忽略滚动到底部
                return;
            }
        }

        // 2. 如果标记了忽略滚动（通常是刚完成跳转），则重置标记并跳过
        if (ignoreScrollRef.current) {
            ignoreScrollRef.current = false;
            return;
        }

        // 3. 否则滚动到底部（默认行为：当消息列表长度变化时）
        if (messagesEndRef.current && !targetMessageId) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messagesLength, targetMessageId]);

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return {
        messagesEndRef,
        setTargetMessageId,
        scrollToBottom
    };
}
