export interface KnowledgeNode {
  id: string;
  group: number;
  score: number;
}

export interface KnowledgeLink {
  source: string;
  target: string;
  value: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
}
