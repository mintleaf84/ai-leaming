import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { getAiConfig } from '@/lib/ai/client';
import { getSession } from '@/lib/auth/auth';
import { checkAndConsumeQuota } from '@/lib/billing/subscription-service';

// 使用 Node.js runtime (默认)，因为 getAiConfig 依赖 better-sqlite3

export async function POST(req: Request) {
    console.log('[/api/generate] Request received');
    const session = await getSession();
    console.log('[/api/generate] Session:', session?.user?.id ? `User ${session.user.id}` : 'No session');
    if (!session?.user) return new Response('Unauthorized', { status: 401 });

    // Use ai_chat quota for now
    const quota = checkAndConsumeQuota(Number(session.user.id), 'ai_chat');
    console.log('[/api/generate] Quota check:', quota);
    if (!quota.allowed) {
        return new Response('配额不足，请升级套餐', { status: 403 });
    }

    const { prompt, option, command } = await req.json();
    console.log('[/api/generate] Received:', { prompt: prompt?.substring(0, 50), option, command });
    const config = getAiConfig('premium');

    const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
    });

    let systemPrompt = "你是一个专业的 AI 写作助手，致力于帮助用户优化、续写和完善 Markdown 格式的笔记。直接输出结果，不要包含任何解释性语言（如'好的'、'修改如下'）。";

    if (option === 'continue') {
        systemPrompt += " 请根据提供的上下文继续写作。只输出续写的内容，不要重复上文。";
    } else if (option === 'improve') {
        systemPrompt += " 请润色以下文本，提高可读性和专业度，保持原意不变。只输出修改后的文本。";
    } else if (option === 'fix') {
        systemPrompt += " 请检查并修复以下文本的语法、拼写和标点错误。只输出修改后的文本。";
    } else if (option === 'shorter') {
        systemPrompt += " 请精简以下文本，保留核心信息，使其更简洁。只输出修改后的文本。";
    } else if (option === 'longer') {
        systemPrompt += " 请扩充以下文本，在保持原意的基础上增加相关细节和描述。只输出修改后的文本。";
    } else if (option === 'zap' && command) {
        systemPrompt += ` 用户指令：${command}。请严格按照用户指令处理以下文本。`;
    }

    try {
        console.log('[/api/generate] Calling AI with model:', config.modelName);
        // 使用 .chat() 强制使用 Chat Completions API，因为第三方服务（如 SiliconFlow）不支持新的 Responses API
        const response = streamText({
            model: openai.chat(config.modelName),
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
        });

        console.log('[/api/generate] Stream created, returning response');
        return response.toTextStreamResponse();
    } catch (error) {
        console.error('[/api/generate] Error:', error);
        return new Response(`AI Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
    }
}
