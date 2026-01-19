import React from 'react';
import { getNotesAction } from '@/server/actions/note';
import { NoteSidebar } from './NoteSidebar';

export default async function NotesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
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
