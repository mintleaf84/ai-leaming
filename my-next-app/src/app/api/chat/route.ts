import { streamChatWrapper } from '@/lib/ai/client';
import { saveMessage } from '@/lib/services/chat';
import { searchKnowledgeBase, buildEnhancedSystemPrompt, parseCommand, handleQuizCommand, handleExplainCommand } from '@/lib/services/chat-rag';
import { getSession } from '@/lib/auth/auth';
import { checkQuotaForApi } from '@/lib/billing/usage-middleware';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }
        const userId = session.user.id;
        const { messages, sessionId } = await req.json();

        // 用量检查：AI 对话配额
        const quotaCheck = checkQuotaForApi(userId, 'ai_chat');
        if (quotaCheck) {
            return new Response(JSON.stringify(quotaCheck.error), {
                status: 429,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 保存用户消息到数据库（如果提供了 sessionId）
        if (sessionId && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role === 'user') {
                try {
                    saveMessage(userId, sessionId, 'user', lastMessage.content);
                } catch (saveError) {
                    console.error('[ChatAPI] 保存用户消息失败:', saveError);
                }
            }
        }

        // 检查是否是快捷指令
        const userMessage = messages[messages.length - 1]?.content || '';
        const { type, keyword } = parseCommand(userMessage);

        // 如果是指令，直接返回处理结果
        if (type !== 'none') {
            let commandResponse = '';
            if (type === 'quiz') {
                commandResponse = await handleQuizCommand(keyword);
            } else if (type === 'explain') {
                commandResponse = await handleExplainCommand(keyword);
            }

            // 保存 AI 回复
            if (sessionId) {
                try {
                    saveMessage(userId, sessionId, 'assistant', commandResponse);
                } catch (saveError) {
                    console.error('[ChatAPI] 保存 AI 消息失败:', saveError);
                }
            }

            // 返回非流式响应
            return new Response(commandResponse, {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        // 5. 准备流式聊天参数
        const { enableRag, context } = await req.json().catch(() => ({}));

        let tools = undefined;
        let systemPrompt = undefined;

        // 如果启用了 RAG，注入知识库检索工具
        if (enableRag) {
            const { knowledgeSearchTool } = await import('@/lib/services/chat-rag');
            tools = {
                knowledgeSearch: knowledgeSearchTool
            };
            // RAG 模式下，context 可能是用户手动提供的（如阅读器上下文），也可能是后续工具调用产生的
            // 这里优先使用用户提供的 context 作为初始系统提示词的一部分
            systemPrompt = buildEnhancedSystemPrompt(context);
        } else {
            // 未启用 RAG，如果有 context 也注入
            systemPrompt = buildEnhancedSystemPrompt(context);
        }

        // 流式生成回复
        const result = await streamChatWrapper(
            messages,
            (fullResponse) => {
                // 在生成完成后保存完整的 AI 回复
                if (sessionId) {
                    try {
                        saveMessage(userId, sessionId, 'assistant', fullResponse);
                        console.log(`[ChatAPI] 已自动全量保存消息 (Session: ${sessionId})`);
                    } catch (saveError) {
                        console.error('[ChatAPI] 异步保存助手机器人回复失败:', saveError);
                    }
                }
            },
            tools,
            systemPrompt
        );

        return result.toTextStreamResponse();
    } catch (error: any) {
        console.error('Chat API Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

