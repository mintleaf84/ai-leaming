// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../auth';

// 1. Mock dependencies
const { mockAuthService, mockAuthEdge, mockCookies } = vi.hoisted(() => {
    return {
        mockAuthService: {
            validateCredentials: vi.fn(),
            register: vi.fn(),
        },
        mockAuthEdge: {
            encrypt: vi.fn().mockResolvedValue('fake-edge-token'),
            COOKIE_NAME: 'session'
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

vi.mock('@/lib/auth/auth-edge', () => mockAuthEdge);

vi.mock('hono/cookie', () => ({
    setCookie: mockCookies.setCookie,
    deleteCookie: mockCookies.deleteCookie,
}));

// 移除不再使用的 hono/jwt sign Mock

describe('Auth Hono Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /login', () => {
        it('should return 200 and set cookie with encrypted token', async () => {
            mockAuthService.validateCredentials.mockResolvedValue({ id: 1, username: 'test', role: 'user' });
            
            const res = await app.request('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'test', password: 'password' })
            });

            expect(res.status).toBe(200);
            // 验证 Cookie 是否正确设置了加密后的 Token
            expect(mockCookies.setCookie).toHaveBeenCalledWith(
                expect.anything(), 
                'session', 
                'fake-edge-token',
                expect.objectContaining({ httpOnly: true, path: '/' })
            );
            
            const data = await res.json();
            expect(data.token).toBe('fake-edge-token');
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

    describe('POST /register', () => {
        it('should successfuly register and set cookie', async () => {
            mockAuthService.register.mockResolvedValue({ id: 2, username: 'newuser', role: 'user' });
            
            const res = await app.request('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'newuser', password: 'password123' })
            });

            expect(res.status).toBe(200);
            expect(mockAuthService.register).toHaveBeenCalledWith('newuser', 'password123');
            expect(mockCookies.setCookie).toHaveBeenCalledWith(
                expect.anything(),
                'session',
                'fake-edge-token',
                expect.anything()
            );
        });

        it('should return 400 if user already exists', async () => {
            mockAuthService.register.mockRejectedValue(new Error('User exists'));
            const res = await app.request('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'existing', password: 'password' })
            });
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ error: 'User exists' });
        });
    });

    describe('POST /logout', () => {
        it('should call deleteCookie and return 200', async () => {
            const res = await app.request('/logout', { method: 'POST' });
            expect(res.status).toBe(200);
            expect(mockCookies.deleteCookie).toHaveBeenCalledWith(expect.anything(), 'session', expect.anything());
        });
    });
});
