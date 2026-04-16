import { Transformer } from 'markmap-lib';

/**
 * 将 Markdown 字符串转换成 simple-mind-map 所需的 nodeData JSON 结构
 */
export function markdownToSmm(markdown: string) {
    if (!markdown || !markdown.trim()) {
        markdown = '# 核心主题';
    }

    const transformer = new Transformer();
    const { root } = transformer.transform(markdown);

    const convertNode = (node: any): any => {
        // markmap 的节点内容会有包裹，简单清洗掉首尾空白
        let content = typeof node.content === 'string' ? node.content.trim() : '';

        // markmap 返回的可能是 html，去掉简单的纯包裹标签，或者保持原样交由 rich text 解析
        content = content.replace(/<br>/gi, '\n');

        return {
            data: { text: content || '未命名' },
            children: (node.children || []).map(convertNode)
        };
    };

    let rootNode = convertNode(root);

    // Markmap 默认会给一个空的 root 节点，它的 children 是实际的一级节点
    // 如果 root 是空的，我们直接将第一个子节点提升为根节点
    if ((!rootNode.data.text || rootNode.data.text === '未命名') && rootNode.children.length === 1) {
        rootNode = rootNode.children[0];
    } else if (!rootNode.data.text || rootNode.data.text === '未命名') {
        rootNode.data.text = '核心主题';
    }

    return rootNode;
}
