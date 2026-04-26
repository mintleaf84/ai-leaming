
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Root, Content, Heading } from 'mdast';

export interface ParsedChapter {
    title: string;
    content: string;
    level: number;
}

/**
 * Split text into chapters based on Markdown headers (#, ##, ###)
 * Using AST-based parsing for robustness
 */
export function parseMarkdownToChapters(text: string): ParsedChapter[] {
    if (!text) return [];

    const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkStringify);
    
    const ast = processor.parse(text) as Root;
    const chapters: ParsedChapter[] = [];

    let currentChapter: ParsedChapter = {
        title: '前言',
        content: '',
        level: 1
    };
    
    let currentContentNodes: Content[] = [];

    const flushChapter = () => {
        const content = processor.stringify({
            type: 'root',
            children: currentContentNodes
        } as Root).trim();

        if (currentChapter.title !== '前言' || content) {
            chapters.push({
                ...currentChapter,
                content
            });
        }
    };

    for (const node of ast.children) {
        if (node.type === 'heading') {
            // Found a new heading - flush previous chapter
            flushChapter();

            // Start new chapter
            const headingNode = node as Heading;
            // Convert heading children back to text for the title
            const title = processor.stringify({
                type: 'root',
                children: headingNode.children as Content[]
            } as Root).trim();

            currentChapter = {
                title,
                level: headingNode.depth,
                content: ''
            };
            currentContentNodes = [];
        } else {
            // Accumulate content nodes
            currentContentNodes.push(node);
        }
    }

    // Flush last chapter
    flushChapter();

    // Remove empty '前言' if it has no content
    if (chapters.length > 0 && chapters[0].title === '前言' && !chapters[0].content) {
        chapters.shift();
    }

    return chapters;
}
