import { test as base, Page } from '@playwright/test';

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

/**
 * 登录辅助函数
 */
async function loginAs(page: Page, user: { username: string; password: string }) {
    await page.goto('/login');
    await page.waitForTimeout(500);

    // 填写登录表单
    const usernameInput = page.getByPlaceholder(/用户名/);
    const passwordInput = page.getByPlaceholder(/密码/);

    if (await usernameInput.isVisible()) {
        await usernameInput.fill(user.username);
        await passwordInput.fill(user.password);
        await page.getByRole('button', { name: /登录/i }).click();
        await page.waitForTimeout(1000);
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
