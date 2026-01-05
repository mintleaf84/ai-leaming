
export interface ParsedChapter {
    title: string;
    content: string;
    level: number;
}

/**
 * Split text into chapters based on Markdown headers (#, ##, ###)
 */
export function parseMarkdownToChapters(text: string): ParsedChapter[] {
    const lines = text.split('\n');
    const chapters: ParsedChapter[] = [];

    let currentTitle = '前言';
    let currentLevel = 1;
    let currentContent: string[] = [];

    // Regex to match headers: # Title, ## Title
    const headerRegex = /^(#{1,6})\s+(.+)$/;

    for (const line of lines) {
        const match = line.match(headerRegex);
        if (match) {
            // If we have accumulated content for the previous section, save it
            if (currentContent.length > 0 || currentTitle !== '前言') {
                chapters.push({
                    title: currentTitle,
                    content: currentContent.join('\n').trim(),
                    level: currentLevel
                });
            }

            // Start new section
            currentLevel = match[1].length;
            currentTitle = match[2].trim();
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    }

    // Push the last chapter
    if (currentContent.length > 0 || currentTitle) {
        chapters.push({
            title: currentTitle,
            content: currentContent.join('\n').trim(),
            level: currentLevel
        });
    }

    // Remove empty '前言' if it has no content (often happens if file starts with # Title)
    if (chapters.length > 0 && chapters[0].title === '前言' && !chapters[0].content) {
        chapters.shift();
    }

    return chapters;
}
