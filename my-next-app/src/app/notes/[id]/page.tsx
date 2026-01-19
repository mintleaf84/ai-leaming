import { notFound } from 'next/navigation';
import { getNoteDetailAction } from '@/server/actions/note';
import NotePageClient from './NotePageClient';

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { success, note } = await getNoteDetailAction(Number(id));

    if (note) {
        console.log('[Debug Note] ID:', note.id);
        console.log('[Debug Note] Type of content:', typeof note.content);
        console.log('[Debug Note] Content value:', note.content ? note.content.substring(0, 100) : 'null');
    }

    if (!success || !note) {
        notFound();
    }

    return <NotePageClient note={note} />;
}
