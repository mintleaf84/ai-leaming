import { useCallback, useEffect, useRef } from 'react';

interface UseSmoothStreamOptions {
    onUpdate: (text: string) => void;
    streamDone: boolean;
    minDelay?: number;
    initialText?: string;
}

// 支持的语言，用于 Intl.Segmenter 实现更精准的字符分割（处理表情符号、中文等）
const languages = ['en-US', 'de-DE', 'es-ES', 'zh-CN', 'zh-TW', 'ja-JP', 'ru-RU', 'el-GR', 'fr-FR', 'pt-PT'];
const segmenter = new Intl.Segmenter(languages);

/**
 * 移植自 Cherry Studio 的平滑流式显示 Hook
 * 用于消除 AI 输出时的抖动感，提供顺滑的打字机体验
 */
export const useSmoothStream = ({ onUpdate, streamDone, minDelay = 10, initialText = '' }: UseSmoothStreamOptions) => {
    const chunkQueueRef = useRef<string[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const displayedTextRef = useRef<string>(initialText);
    const lastUpdateTimeRef = useRef<number>(0);

    const addChunk = useCallback((chunk: string) => {
        // 使用 Intl.Segmenter 将字符串分割为原子字符（处理 CJK 字符和 Emoji）
        const chars = Array.from(segmenter.segment(chunk)).map((s) => s.segment);
        chunkQueueRef.current = [...chunkQueueRef.current, ...(chars || [])];
    }, []);

    const reset = useCallback(
        (newText = '') => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            chunkQueueRef.current = [];
            displayedTextRef.current = newText;
            onUpdate(newText);
        },
        [onUpdate]
    );

    const renderLoopRef = useRef<(t: number) => void>(() => { });

    const renderLoop = useCallback(
        (currentTime: number) => {
            const nextFrame = () => {
                animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);
            };

            // 1. 如果队列为空
            if (chunkQueueRef.current.length === 0) {
                // 如果流已结束，确保显示最终状态并停止循环
                if (streamDone) {
                    onUpdate(displayedTextRef.current);
                    animationFrameRef.current = null;
                    return;
                }
                // 如果流还没结束但队列空了，持续循环等待下一帧
                nextFrame();
                return;
            }

            // 2. 时间控制，确保最小延迟（打字的速度）
            if (currentTime - lastUpdateTimeRef.current < minDelay) {
                nextFrame();
                return;
            }
            lastUpdateTimeRef.current = currentTime;

            // 3. 动态计算本次渲染的字符数（队列越长渲染越快，防止堆积导致严重延迟）
            let charsToRenderCount = Math.max(1, Math.floor(chunkQueueRef.current.length / 5));

            // 如果流已结束，稍微大幅度追赶渲染
            if (streamDone) {
                charsToRenderCount = chunkQueueRef.current.length;
            }

            const charsToRender = chunkQueueRef.current.slice(0, charsToRenderCount);
            displayedTextRef.current += charsToRender.join('');

            // 4. 更新 UI
            onUpdate(displayedTextRef.current);

            // 5. 更新队列
            chunkQueueRef.current = chunkQueueRef.current.slice(charsToRenderCount);

            // 6. 持续循环
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            nextFrame();
        },
        [streamDone, onUpdate, minDelay]
    );

    useEffect(() => {
        renderLoopRef.current = renderLoop;
    }, [renderLoop]);

    useEffect(() => {
        // 启动渲染循环
        animationFrameRef.current = requestAnimationFrame(renderLoop);

        // 组件卸载时清理
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [renderLoop]);

    return { addChunk, reset };
};
