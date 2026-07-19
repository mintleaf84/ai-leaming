
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    test: {
        environment: 'jsdom',
        globals: true,
        testTimeout: 15000,
        setupFiles: ['./tests/setup.ts'],
        // 排除 e2e 测试
        exclude: ['**/node_modules/**', '**/e2e/**', '**/playwright/**'],
    },
    resolve: {
        alias: {
            // 在测试环境中，将 server-only 映射到空模块存根
            'server-only': new URL('./__mocks__/server-only.js', import.meta.url).pathname,
        },
    },
})
