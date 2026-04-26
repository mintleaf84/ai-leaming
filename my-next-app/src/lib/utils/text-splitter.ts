import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

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
 * Using industry standard LangChain's RecursiveCharacterTextSplitter
 */
export async function splitText(text: string, options: Partial<SplitterOptions> = {}): Promise<string[]> {
    const finalOptions = { ...DEFAULT_OPTIONS, ...options };
    
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: finalOptions.chunkSize,
        chunkOverlap: finalOptions.chunkOverlap,
        separators: finalOptions.separators,
    });

    return await splitter.splitText(text);
}
