import React from 'react';
import { getNotesAction } from '@/server/actions/note';
import { NoteSidebar } from './NoteSidebar';
import { getGlobalFeatureFlag } from '@/server/actions/feature-flags';
import { redirect } from 'next/navigation';

export default async function NotesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const isEnabled = await getGlobalFeatureFlag('ENABLE_NOTES', true);
    if (!isEnabled) {
        redirect('/dashboard');
    }

    // Get notes
    const { notes } = await getNotesAction();

    return (
        <div className="flex h-full">
            <NoteSidebar notes={notes || []} />
            <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
                {children}
            </div>
        </div>
    );
}
