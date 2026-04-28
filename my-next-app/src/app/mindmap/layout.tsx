import React from 'react';
import { getMindmapsAction } from '@/server/actions/mindmap';
import { MindmapSidebar } from './MindmapSidebar';
import { redirect } from 'next/navigation';

export default async function MindmapLayout({ children }: { children: React.ReactNode }) {
    const { success, records } = await getMindmapsAction();

    // 如果未登录等情况，保护路由
    if (!success) {
        redirect('/login');
    }

    return (
        <div className="flex w-full overflow-hidden bg-background">
            <MindmapSidebar records={(records || []).map(r => ({ ...r, updated_at: r.updated_at ?? '' }))} />
            <div className="flex-1 overflow-hidden relative">
                {children}
            </div>
        </div>
    );
}
