'use server';

import { cache } from 'react';
import { getSession } from '@/lib/auth/auth';
import { statsService, type UserStats } from '@/lib/services/stats';
import { wrongQuestionService } from '@/lib/services/wrong-question';

export const getCachedUserStats = cache(async (): Promise<UserStats | null> => {
    const session = await getSession();
    if (!session?.user) return null;
    return statsService.getUserStats(session.user.id);
});

export const getCachedWrongQuestions = cache(async (limit: number, offset: number) => {
    const session = await getSession();
    if (!session?.user) return { questions: [], total: 0 };
    return wrongQuestionService.getList(session.user.id, { limit, offset });
});