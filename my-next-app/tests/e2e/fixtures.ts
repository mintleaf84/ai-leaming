import { test as base, Page } from '@playwright/test';
import { COOKIE_NAME } from '@/lib/auth/auth-edge';

/**
 * E2E 测试共享 Fixture
 * 自动拦截 AI API 调用，返回 Mock 数据
 */

// 测试用户凭证（与 global-setup.ts 保持一致）
export const TEST_USER = {
    username: 'testuser',
    password: 'test123456',
};

export const TEST_ADMIN = {
    username: 'testadmin',
    password: 'admin123456',
};

// Mock 响应数据
export const MOCK_CHAT_RESPONSE = '这是一条来自 Mock AI 的测试回复。我可以帮助你解答问题。';

/** 纠偏题 Mock 数据 */
export const MOCK_CORRECTION_QUIZ = {
    analysis: 'Mock 分析：这道题考察的是基础概念理解。',
    distinctionPoint: '概念辨析',
    quiz: {
        content: 'Mock 纠偏题：下列关于测试的说法，正确的是？',
        options: ['A. 单元测试只测试单个函数', 'B. 集成测试不需要真实环境', 'C. E2E测试模拟用户行为', 'D. 以上都不对'],
        answer: 'C',
        explanation: 'E2E（端到端）测试通过模拟真实用户操作来验证整个应用流程。'
    }
};

/** 回归挑战 Mock 数据 */
export const MOCK_REGRESSION_CHALLENGE = {
    logicType: 'reverse',
    challenges: [
        {
            content: 'Mock 回归挑战题1：以下关于单元测试的说法，错误的是？',
            options: ['A. 单元测试隔离外部依赖', 'B. 单元测试速度快', 'C. 单元测试覆盖整个系统', 'D. 单元测试便于定位问题'],
            answer: 'C',
            explanation: '单元测试只测试单个函数或模块，不覆盖整个系统。'
        },
        {
            content: 'Mock 回归挑战题2：集成测试的主要目的是？',
            options: ['A. 测试UI渲染', 'B. 验证模块间协作', 'C. 压力测试', 'D. 安全扫描'],
            answer: 'B',
            explanation: '集成测试验证不同模块之间的协作是否正常。'
        },
        {
            content: 'Mock 回归挑战题3：E2E测试的最大价值在于？',
            options: ['A. 运行速度快', 'B. 模拟真实用户流程', 'C. 减少代码量', 'D. 自动修复Bug'],
            answer: 'B',
            explanation: 'E2E测试通过模拟真实用户操作，验证从前端到后端的完整流程。'
        }
    ]
};

/**
 * 登录辅助函数
 */
async function loginAs(page: Page, user: { username: string; password: string }) {
    await page.goto('/login');
    await page.waitForTimeout(500);

    // 确保用户名输入框可见并就绪
    await page.waitForSelector('input[placeholder*="用户名"]', { timeout: 10000 });
    const usernameInput = page.getByPlaceholder(/用户名/);
    const passwordInput = page.getByPlaceholder(/密码/);

    if (await usernameInput.isVisible()) {
        await usernameInput.fill(user.username);
        await passwordInput.fill(user.password);
        await page.getByRole('button', { name: /登录/i }).click();
        
        // 显式等待 URL 跳转，增加到 25s 以应对初次编译
        try {
            // 首先等待登录请求完成 (API 响应)
            await page.waitForResponse(resp => resp.url().includes('/api/auth/login') && resp.status() === 200, { timeout: 15000 });
            
            // 然后等待 URL 变化
            await page.waitForURL(/\/(dashboard|home|practice|admin)/, { timeout: 20000 });
            
            // 额外检查 cookie 是否已设置（双重保险）
            const cookies = await page.context().cookies();
            const hasAuthCookie = cookies.some(c => c.name === COOKIE_NAME);
            if (!hasAuthCookie) {
                console.warn('[E2E Fixture] Auth cookie missing after login redirect');
            }
        } catch (_e) {
            console.error('[E2E Fixture] Login failed or timed out. Current URL:', page.url());
        }
    }
}


/**
 * 设置 API Mock
 */
async function setupApiMocks(page: Page) {
    // Mock /api/chat 流式响应
    await page.route('**/api/chat', async (route) => {
        const chunks = MOCK_CHAT_RESPONSE.split('').map((char, i) => {
            const data = JSON.stringify({
                id: `mock-${i}`,
                object: 'chat.completion.chunk',
                choices: [{ delta: { content: char }, index: 0 }]
            });
            return `data: ${data}\n\n`;
        });
        chunks.push('data: [DONE]\n\n');

        await route.fulfill({
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
            body: chunks.join(''),
        });
    });

    // Mock 外部 AI API
    await page.route('**/api.openai.com/**', async (route) => {
        await route.fulfill({
            status: 200,
            json: {
                choices: [{ message: { content: MOCK_CHAT_RESPONSE } }]
            }
        });
    });

    await page.route('**/api.deepseek.com/**', async (route) => {
        await route.fulfill({
            status: 200,
            json: {
                choices: [{ message: { content: MOCK_CHAT_RESPONSE } }]
            }
        });
    });

    await page.route('**/mock-api.test.com/**', async (route) => {
        await route.fulfill({
            status: 200,
            json: {
                choices: [{ message: { content: MOCK_CHAT_RESPONSE } }]
            }
        });
    });
}

/**
 * 扩展 Playwright Test
 */
export const test = base.extend<{
    mockPage: Page;
    loggedInPage: Page;
    adminPage: Page;
}>({
    // 带 Mock 的普通页面
    mockPage: async ({ page }, use) => {
        await setupApiMocks(page);
        await use(page);
    },

    // 已登录的普通用户页面
    loggedInPage: async ({ page }, use) => {
        await setupApiMocks(page);
        await loginAs(page, TEST_USER);
        await use(page);
    },

    // 已登录的管理员页面
    adminPage: async ({ page }, use) => {
        await setupApiMocks(page);
        await loginAs(page, TEST_ADMIN);
        await use(page);
    },
});

export { expect } from '@playwright/test';
