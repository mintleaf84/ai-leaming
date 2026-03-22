// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../auth';

// Mock dependencies
const { mockAuthService, mockCookies } = vi.hoisted(() => {
    return {
        mockAuthService: {
            validateCredentials: vi.fn(),
            register: vi.fn(),
            encrypt: vi.fn().mockResolvedValue('fake-token'),
        },
        mockCookies: {
            setCookie: vi.fn(),
            deleteCookie: vi.fn(),
        }
    };
});

vi.mock('@/lib/services/auth', () => ({
    authService: mockAuthService
}));

vi.mock('hono/cookie', () => ({
    setCookie: mockCookies.setCookie,
    deleteCookie: mockCookies.deleteCookie,
}));

describe('Auth Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /login', () => {
        it('should return 200 and set cookie on successful login', async () => {
            mockAuthService.validateCredentials.mockResolvedValue({ id: 1, username: 'test' });
            
            const res = await app.request('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'test', password: 'password' })
            });

            expect(res.status).toBe(200);
            expect(mockCookies.setCookie).toHaveBeenCalled();
            const data = await res.json();
            expect(data.user.id).toBe(1);
        });

        it('should return 401 on invalid credentials', async () => {
            mockAuthService.validateCredentials.mockResolvedValue(null);

            const res = await app.request('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'wrong', password: 'wrong' })
            });

            expect(res.status).toBe(401);
        });
    });

    describe('POST /logout', () => {
        it('should call deleteCookie and return 200', async () => {
            const res = await app.request('/logout', {
                method: 'POST'
            });

            expect(res.status).toBe(200);
            expect(mockCookies.deleteCookie).toHaveBeenCalled();
        });
    });
});
