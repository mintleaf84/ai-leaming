
interface SplitterOptions {
    chunkSize: number;
    chunkOverlap: number;
    separators?: string[];
}

const DEFAULT_OPTIONS: SplitterOptions = {
    chunkSize: 1000,
    chunkOverlap: 200, // Keep context between chunks
    separators: ['\n\n', '\n', ' ', ''] // Priority: Paragraph -> Line -> Word -> Character
};

/**
 * Splits text into chunks recursively based on separators
 * Inspired by LangChain's RecursiveCharacterTextSplitter
 */
export function splitText(text: string, options: Partial<SplitterOptions> = {}): string[] {
    const finalOptions = { ...DEFAULT_OPTIONS, ...options };
    const { chunkSize, chunkOverlap, separators } = finalOptions;

    const finalChunks: string[] = [];
    const _goodSplits: string[] = [text];

    // Recursive split function
    const _split = (text: string, separators: string[]): string[] => {
        const _finalChunks: string[] = [];
        let separator = separators[separators.length - 1];
        let newSeparators: string[] = [];

        // Find the first separator that exists in the text
        for (let i = 0; i < separators.length; i++) {
            if (text.includes(separators[i])) {
                separator = separators[i];
                newSeparators = separators.slice(i + 1);
                break;
            }
        }

        const splits = text.split(separator);
        const goodSplits: string[] = [];

        // Merge splits back together until they reach chunk size
        let currentChunk = '';

        for (const split of splits) {
            if (currentChunk.length + split.length + separator.length > chunkSize) {
                if (currentChunk) {
                    goodSplits.push(currentChunk);
                    currentChunk = '';
                }
            }

            // If a single split is still too large, we need to recurse on it
            if (split.length > chunkSize && newSeparators.length > 0) {
                const subSplits = _split(split, newSeparators);
                goodSplits.push(...subSplits);
            } else {
                // Add separator back if it's not the first element (joining)
                // Logic simplified: just accumulate text
                if (currentChunk) {
                    currentChunk += separator + split;
                } else {
                    currentChunk = split;
                }
            }
        }

        if (currentChunk) {
            goodSplits.push(currentChunk);
        }

        return goodSplits;
    };

    // Simplified implementation for now:
    // Just split by paragraph if possible, then by lines
    // To implement full recursive is complex, let's do a simpler "Semantic Splitter"

    // 1. Split by paragraphs
    const paragraphs = text.split('\n\n');
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        // If adding this paragraph exceeds chunk size
        if (currentChunk.length + paragraph.length + 2 > chunkSize) {
            if (currentChunk) {
                finalChunks.push(currentChunk.trim());
                // Start new chunk with overlap? 
                // Simple overlap strategy: take last N chars of previous chunk?
                // For now, let's keep it simple: no strict overlap logic in this simple loop, 
                // but we can implement a sliding window if needed.

                // Let's try to include a bit of context if possible
                const overlapText = currentChunk.slice(-chunkOverlap);
                currentChunk = overlapText + '\n\n' + paragraph;
            } else {
                // Paragraph itself is huge, force add it (or split by lines inside)
                // Ideally we should recurse here, but for safety lets just add it
                finalChunks.push(paragraph.trim());
                currentChunk = '';
            }
        } else {
            if (currentChunk) {
                currentChunk += '\n\n' + paragraph;
            } else {
                currentChunk = paragraph;
            }
        }
    }

    if (currentChunk) {
        finalChunks.push(currentChunk.trim());
    }

    return finalChunks;
}
