// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authService, AuthError } from '../auth';

// Mock dependencies
const { mockUserService, mockPassword } = vi.hoisted(() => {
    return {
        mockUserService: {
            getUserByUsername: vi.fn(),
            createUser: vi.fn(),
        },
        mockPassword: {
            comparePassword: vi.fn(),
            hashPassword: vi.fn(),
        }
    };
});

vi.mock('@/lib/auth/user-service', () => ({
    getUserByUsername: mockUserService.getUserByUsername,
    createUser: mockUserService.createUser,
}));

vi.mock('@/lib/auth/password', () => ({
    comparePassword: mockPassword.comparePassword,
    hashPassword: mockPassword.hashPassword,
}));

describe('Auth Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('validateCredentials', () => {
        it('should return user without password when credentials are valid', async () => {
            const mockUser = {
                id: 1,
                username: 'test',
                password_hash: 'hashed',
                role: 'student',
                token_version: 1
            };
            mockUserService.getUserByUsername.mockReturnValue(mockUser);
            mockPassword.comparePassword.mockResolvedValue(true);

            const result = await authService.validateCredentials('test', 'pass');

            expect(result).toEqual({
                id: 1,
                username: 'test',
                role: 'student',
                token_version: 1
            });
            expect(result).not.toHaveProperty('password_hash');
        });

        it('should return null when user does not exist', async () => {
            mockUserService.getUserByUsername.mockReturnValue(null);

            const result = await authService.validateCredentials('test', 'pass');

            expect(result).toBeNull();
        });

        it('should return null when password is invalid', async () => {
            const mockUser = {
                id: 1,
                username: 'test',
                password_hash: 'hashed',
                role: 'student',
                token_version: 1
            };
            mockUserService.getUserByUsername.mockReturnValue(mockUser);
            mockPassword.comparePassword.mockResolvedValue(false);

            const result = await authService.validateCredentials('test', 'wrong');

            expect(result).toBeNull();
        });
    });

    describe('register', () => {
        it('should create new user when username is available', async () => {
            mockUserService.getUserByUsername.mockReturnValue(null);
            mockUserService.createUser.mockResolvedValue({
                id: 2,
                username: 'newuser',
                role: 'student',
                token_version: 0
            });

            const result = await authService.register('newuser', 'pass');

            expect(result).toEqual({
                id: 2,
                username: 'newuser',
                role: 'student',
                token_version: 0
            });
            // Note: Service doesn't hash explicitly, it delegates to createUser
            // But if implementation changed to hash here, we'd expect call to hashPassword
            // In current impl, service just calls createUser which handles hashing (or so the mock assumes)
            // Actually, waiting, I should check the implementation of authService.register again.
            // "user-service.createUser 内部已经处理了 hash" - correct. 
            expect(mockUserService.createUser).toHaveBeenCalledWith('newuser', 'pass', 'student');
        });

        it('should throw AuthError when username exists', async () => {
            mockUserService.getUserByUsername.mockReturnValue({ id: 1 });

            await expect(authService.register('existing', 'pass'))
                .rejects.toThrow(AuthError);
        });
    });
});
