/**
 * 自实现的 useCompletion Hook
 * 替代 @ai-sdk/react 的 useCompletion，使用原生 fetch + ReadableStream
 *
 * 兼容 ai-selector.tsx 原有的接口约定
 */
import { useState, useCallback, useRef } from 'react';

interface UseCompletionOptions {
    /** API 端点路径 */
    api: string;
    /** 流式协议类型（目前只支持 'text'） */
    streamProtocol?: 'text';
    /** 错误回调 */
    onError?: (error: Error) => void;
    /** 完成回调 */
    onFinish?: (prompt: string, completion: string) => void;
}

interface CompleteOptions {
    body?: Record<string, unknown>;
}

interface UseCompletionReturn {
    /** 当前已接收到的完整补全文本 */
    completion: string;
    /** 发送补全请求 */
    complete: (prompt: string, options?: CompleteOptions) => Promise<void>;
    /** 是否正在加载中 */
    isLoading: boolean;
    /** 中止当前请求 */
    stop: () => void;
    /** 手动设置补全文本（用于清空等操作） */
    setCompletion: (text: string) => void;
}

export function useCompletion({
    api,
    onError,
    onFinish,
}: UseCompletionOptions): UseCompletionReturn {
    const [completion, setCompletionState] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
    }, []);

    const complete = useCallback(async (prompt: string, options?: CompleteOptions) => {
        setIsLoading(true);
        setCompletionState('');

        abortControllerRef.current = new AbortController();

        let accumulatedText = '';

        try {
            const response = await fetch(api, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, ...options?.body }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;
                setCompletionState(accumulatedText);
            }

            onFinish?.(prompt, accumulatedText);
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                // 用户主动中止，不触发 onError
                return;
            }
            const err = error instanceof Error ? error : new Error(String(error));
            onError?.(err);
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [api, onError, onFinish]);

    return {
        completion,
        complete,
        isLoading,
        stop,
        setCompletion: setCompletionState,
    };
}
