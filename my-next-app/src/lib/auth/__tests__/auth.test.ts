// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';


// 1. Mock dependencies
const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(),
    has: vi.fn(),
    delete: vi.fn(),
};

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

// Mock NextRequest/NextResponse
vi.mock('next/server', () => {
    const NextResponse = {
        next: vi.fn(() => ({
            cookies: {
                set: vi.fn(),
            },
        })),
    };
    return { NextResponse };
});

import { encrypt, decrypt, login, logout, getSession, requireUser, requireRole, updateSession, COOKIE_NAME } from '../auth';

describe('Auth Service', () => {
    const TEST_USER = { id: 1, email: 'test@example.com', role: 'user' };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Encryption/Decryption', () => {
        it('should encrypt and decrypt payload correctly', async () => {
            const payload = { foo: 'bar' };
            const token = await encrypt(payload);

            expect(typeof token).toBe('string');

            const decrypted = await decrypt(token);
            expect(decrypted.foo).toBe('bar');
        });
    });

    describe('login', () => {
        it('should set httpOnly cookie with session', async () => {
            await login(TEST_USER as any);

            expect(mockCookieStore.set).toHaveBeenCalledWith(
                COOKIE_NAME,
                expect.any(String),
                expect.objectContaining({
                    httpOnly: true,
                    expires: expect.any(Date),
                })
            );
        });
    });

    describe('logout', () => {
        it('should clear authentication cookie', async () => {
            await logout();

            expect(mockCookieStore.set).toHaveBeenCalledWith(
                COOKIE_NAME,
                '',
                expect.objectContaining({
                    expires: new Date(0),
                })
            );
        });
    });

    describe('getSession', () => {
        it('should return null if no cookie', async () => {
            mockCookieStore.get.mockReturnValue(undefined);

            const session = await getSession();
            expect(session).toBeNull();
        });

        it('should return session if cookie is valid', async () => {
            const token = await encrypt({ user: TEST_USER, expires: new Date() });
            mockCookieStore.get.mockReturnValue({ value: token });

            const session = await getSession();
            expect(session).toEqual(expect.objectContaining({
                user: expect.objectContaining({ id: 1 }),
            }));
        });

        it('should return null if token invalid', async () => {
            mockCookieStore.get.mockReturnValue({ value: 'invalid-token' });

            const session = await getSession();
            expect(session).toBeNull();
        });
    });

    describe('requireUser', () => {
        it('should return user if session exists', async () => {
            const token = await encrypt({ user: TEST_USER, expires: new Date() });
            mockCookieStore.get.mockReturnValue({ value: token });

            const user = await requireUser();
            expect(user.id).toBe(1);
        });

        it('should throw Unauthorized if no session', async () => {
            mockCookieStore.get.mockReturnValue(undefined);

            await expect(requireUser()).rejects.toThrow('Unauthorized');
        });
    });

    describe('requireRole', () => {
        it('should return user if role matches', async () => {
            const token = await encrypt({ user: { ...TEST_USER, role: 'admin' }, expires: new Date() });
            mockCookieStore.get.mockReturnValue({ value: token });

            const user = await requireRole(['admin']);
            expect(user.role).toBe('admin');
        });

        it('should throw Forbidden if role does not match', async () => {
            const token = await encrypt({ user: { ...TEST_USER, role: 'user' }, expires: new Date() });
            mockCookieStore.get.mockReturnValue({ value: token });

            await expect(requireRole(['admin'])).rejects.toThrow('Forbidden');
        });

        it('should throw Unauthorized if no session (via requireUser)', async () => {
            mockCookieStore.get.mockReturnValue(undefined);

            await expect(requireRole(['admin'])).rejects.toThrow('Unauthorized');
        });
    });

    describe('updateSession', () => {
        it('should refresh session expiration', async () => {
            const token = await encrypt({ user: TEST_USER, expires: new Date() });

            const mockRequest = {
                cookies: {
                    get: vi.fn().mockReturnValue({ value: token }),
                }
            } as any;

            const res = await updateSession(mockRequest);

            // Verify response cookie was set
            expect(res!.cookies.set).toHaveBeenCalledWith(expect.objectContaining({
                name: COOKIE_NAME,
                httpOnly: true,
                expires: expect.any(Date), // Should be extended
            }));
        });

        it('should do nothing if no session', async () => {
            const mockRequest = {
                cookies: {
                    get: vi.fn().mockReturnValue(undefined),
                }
            } as any;

            const res = await updateSession(mockRequest);

            expect(res).toBeUndefined();
        });
    });
});
