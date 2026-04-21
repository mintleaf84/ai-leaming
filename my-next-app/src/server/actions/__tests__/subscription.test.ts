// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock Auth
vi.mock('@/lib/auth/auth', () => ({
    requireRole: vi.fn(),
    requireUser: vi.fn(),
}));

import { requireRole, requireUser } from '@/lib/auth/auth';

// Mock next/cache
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// 2. Mock Billing Service
const { mockBillingService } = vi.hoisted(() => {
    return {
        mockBillingService: {
            getAllPlans: vi.fn(),
            deletePlan: vi.fn(),
            getUserSubscriptionDetail: vi.fn(),
            checkUsageQuota: vi.fn()
        }
    }
});

vi.mock('@/lib/billing/subscription-service', () => mockBillingService);

import {
    getPlansAction,
    deletePlanAction,
    getMySubscriptionAction,
    checkQuotaAction
} from '../subscription';

describe('Subscription Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getPlansAction', () => {
        it('should return plans for admin', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);
            mockBillingService.getAllPlans.mockReturnValue([{ id: 'pro', name: 'Pro' }]);

            const result = await getPlansAction();

            expect(result.success).toBe(true);
            expect(result.plans).toHaveLength(1);
            expect(requireRole).toHaveBeenCalledWith(['admin']);
        });

        it('should handle errors', async () => {
            vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden'));

            const result = await getPlansAction();

            expect(result.success).toBe(false);
            expect(result.error).toBe('Forbidden');
        });
    });

    describe('deletePlanAction', () => {
        it('should delete plan successfully', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);
            mockBillingService.deletePlan.mockReturnValue({ success: true });

            const result = await deletePlanAction('plan_123');

            expect(result.success).toBe(true);
            expect(mockBillingService.deletePlan).toHaveBeenCalledWith('plan_123');
        });

        it('should return error if service fails', async () => {
            vi.mocked(requireRole).mockResolvedValue({ id: 1, role: 'admin' } as any);
            mockBillingService.deletePlan.mockReturnValue({ success: false, error: 'In use' });

            const result = await deletePlanAction('plan_123');

            expect(result.success).toBe(false);
            expect(result.error).toBe('In use');
        });
    });

    describe('getMySubscriptionAction', () => {
        it('should return user subscription', async () => {
            vi.mocked(requireUser).mockResolvedValue({ id: 10 } as any);
            mockBillingService.getUserSubscriptionDetail.mockReturnValue({ plan: { name: 'Free' } });

            const result = await getMySubscriptionAction();

            expect(result.success).toBe(true);
            expect(result.subscription).toBeDefined();
            expect(mockBillingService.getUserSubscriptionDetail).toHaveBeenCalledWith(10);
        });
    });

    describe('checkQuotaAction', () => {
        it('should return true if quota allows', async () => {
            vi.mocked(requireUser).mockResolvedValue({ id: 10 } as any);
            mockBillingService.checkUsageQuota.mockReturnValue({ allowed: true, remaining: 5 });

            // @ts-ignore - enum usage in test
            const result = await checkQuotaAction('ai_chat');

            expect(result.success).toBe(true);
            expect(result.allowed).toBe(true);
            expect(mockBillingService.checkUsageQuota).toHaveBeenCalledWith(10, 'ai_chat');
        });

        it('should return false if quota exceeded', async () => {
            vi.mocked(requireUser).mockResolvedValue({ id: 10 } as any);
            mockBillingService.checkUsageQuota.mockReturnValue({ allowed: false, remaining: 0 });

            // @ts-ignore - intentional test input
            const result = await checkQuotaAction('ai_chat');

            expect(result.success).toBe(true); // Action succeeded, but result is not allowed
            expect(result.allowed).toBe(false);
        });

        it('should handle unauthenticated user', async () => {
            vi.mocked(requireUser).mockRejectedValue(new Error('Unauthorized'));

            // @ts-ignore - intentional test input
            const result = await checkQuotaAction('ai_chat');

            expect(result.success).toBe(false);
            expect(result.allowed).toBe(false);
        });
    });
});
