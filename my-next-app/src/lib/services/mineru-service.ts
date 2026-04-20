
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs/promises';
import { textbookService } from './textbook';
import { parseMarkdownToChapters } from '@/lib/utils/markdown-parser';

export const mineruService = {
    /**
     * Process a Mineru export ZIP file buffer
     */
    processMineruZip: async (buffer: Buffer, originalFilename: string) => {
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();

        // 1. Find full.md to identify the root folder or main content
        const fullMdEntry = zipEntries.find(entry => entry.entryName.endsWith('full.md') && !entry.entryName.includes('__MACOSX'));

        if (!fullMdEntry) {
            throw new Error('Invalid Mineru Export: full.md not found in zip');
        }

        // Identify root path inside zip (e.g., "NoteBook_Folder/")
        const fullMdPath = fullMdEntry.entryName;
        const rootDir = path.dirname(fullMdPath); // "NoteBook_Folder" or "."

        // 2. Create Textbook Record
        // Use directory name or filename as title if headers aren't parsed yet
        let title = originalFilename.replace('.zip', '');
        const markdownContent = fullMdEntry.getData().toString('utf8');

        // Try to extract first H1 as title
        const titleMatch = markdownContent.match(/^#\s+(.+)$/m);
        if (titleMatch) {
            title = titleMatch[1].trim();
        }

        const bookId = await textbookService.createTextbook({
            title: title,
            description: 'Imported from Mineru (Magic-PDF) Export',
            cover_url: '', // Will update later if map found
        });

        console.log(`[Mineru] Created Book: ${title} (ID: ${bookId})`);

        // 3. Extract Images (Whitelist: only entries in images/ folder relative to root)
        const imagesDirEntryPrefix = rootDir === '.' ? 'images/' : `${rootDir}/images/`;
        // Target public path: public/books/[id]/images
        const targetPublicDir = path.join(process.cwd(), 'public', 'books', String(bookId), 'images');

        await fs.mkdir(targetPublicDir, { recursive: true });

        let imageCount = 0;
        let coverImage = '';

        for (const entry of zipEntries) {
            if (entry.isDirectory || entry.entryName.includes('__MACOSX')) continue;

            // Check if it is inside the images folder
            if (entry.entryName.startsWith(imagesDirEntryPrefix)) {
                const fileName = path.basename(entry.entryName);
                const targetPath = path.join(targetPublicDir, fileName);

                await fs.writeFile(targetPath, entry.getData());
                imageCount++;

                // Use first image as cover if not set
                if (!coverImage && (fileName.endsWith('.jpg') || fileName.endsWith('.png'))) {
                    coverImage = `/books/${bookId}/images/${fileName}`;
                }
            }
        }

        console.log(`[Mineru] Extracted ${imageCount} images.`);

        // Update cover if found
        if (coverImage) {
            await textbookService.updateTextbookCover(bookId, coverImage);
        }

        // 4. Process Content & Replace Links
        // Replace "images/xxx.jpg" with "/books/[id]/images/xxx.jpg"
        // Regex matches "images/" followed by filename, handling possible variations
        // Mineru usually outputs: ![](images/xxx.jpg)
        // We need to be careful with paths if rootDir is involved in Markdown? 
        // Usually full.md references images relatively like "images/xxx.jpg"

        const processedMarkdown = markdownContent.replace(
            /!\[(.*?)\]\((?:.*?\/)?images\/(.*?)\)/g,
            (match, alt, filename) => {
                return `![${alt}](/books/${bookId}/images/${filename})`;
            }
        );

        // 5. Parse Chapters & Insert
        const chapters = parseMarkdownToChapters(processedMarkdown);
        console.log(`[Mineru] Parsed ${chapters.length} chapters.`);

        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            await textbookService.addChapter({
                textbook_id: bookId,
                title: ch.title,
                content: ch.content,
                order_index: i + 1,
                level: ch.level
            });
        }

        return { bookId, chapterCount: chapters.length, imageCount };
    }
};
