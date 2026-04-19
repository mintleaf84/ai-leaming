"use client";

import React, { useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Target, BookOpen } from 'lucide-react';
import { KnowledgeGraphData, KnowledgeNode, KnowledgeLink } from '@/server/actions/viz';
import type { ForceGraphMethods, NodeObject } from 'react-force-graph-2d';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';

// 动态导入 ForceGraph2D，禁用 SSR（因为它依赖 canvas）
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-muted-foreground">加载知识图谱...</div>
    </div>
  ),
});

// react-force-graph 运行时会注入 x、y、val 等属性
type ForceKnowledgeNode = KnowledgeNode & {
  x: number;
  y: number;
  val: number;
};

interface KnowledgeTreeProps {
  data: KnowledgeGraphData;
}

export function KnowledgeTree({ data }: KnowledgeTreeProps) {
  const graphRef = useRef<ForceGraphMethods<NodeObject<KnowledgeNode>> | undefined>(undefined);
  const router = useRouter();
  const [selectedNode, setSelectedNode] = React.useState<KnowledgeNode | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // 转换数据格式以适配 react-force-graph
  const graphData = useMemo(() => ({
    nodes: data.nodes.map(node => ({
      ...node,
      // react-force-graph 需要 id 字段
      val: node.group === 0 ? 20 : node.group === 1 ? 12 : 6 + (node.score / 20),
    })),
    links: data.links.map(link => ({
      source: link.source,
      target: link.target,
      value: link.value,
    })),
  }), [data]);

  // 节点颜色逻辑
  const getNodeColor = useCallback((node: KnowledgeNode) => {
    if (node.group === 0) return '#0f172a'; // 根节点
    if (node.group === 1) return '#2563eb'; // 分类节点
    // 叶子节点基于分数着色
    if (node.score < 60) return '#ef4444'; // 红色
    if (node.score < 85) return '#eab308'; // 黄色
    return '#22c55e'; // 绿色
  }, []);

  // 节点点击处理
  const handleNodeClick = useCallback((node: KnowledgeNode) => {
    if (node.group === 2) {
      setSelectedNode(node as KnowledgeNode);
      setDrawerOpen(true);
    }
  }, []);

  // 节点绘制（自定义 Canvas 渲染）
  const paintNode = useCallback((node: ForceKnowledgeNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.id.split('/').pop() || node.id;
    const fontSize = node.group === 0 ? 14 / globalScale : 10 / globalScale;
    const nodeRadius = node.val;

    // 绘制节点圆
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI, false);
    ctx.fillStyle = getNodeColor(node);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();

    // 绘制标签
    const shouldShowLabel = globalScale > 1.2 || node.group < 2;
    if (shouldShowLabel) {
      ctx.font = `${node.group < 2 ? 'bold' : 'normal'} ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // 绘制文字阴影/背景以提升对比度
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = node.group === 0 ? '#1e293b' : '#475569';
      ctx.fillText(label, node.x, node.y - nodeRadius - 2);

      // 重置阴影
      ctx.shadowBlur = 0;
    }
  }, [getNodeColor]);

  // 配置 D3 物理引擎
  React.useEffect(() => {
    if (graphRef.current) {
      const fg = graphRef.current;
      
      // 增强电荷斥力 (Repulsion)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fg.d3Force('charge') as any)?.strength(-400);

      // 增加链路距离 (Link Distance)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fg.d3Force('link') as any)?.distance(80);

      // 引入节点碰撞检测 (Collision)，防止重叠
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fg.d3Force('collide', ((_node: NodeObject<KnowledgeNode>) => {
         // 碰撞半径：节点半径 + 较大的保护边距（为文字留白）
         const n = _node as ForceKnowledgeNode;
         return n.val + 25;
      }) as any);

      // 重新预热引擎以应用新参数
      fg.d3ReheatSimulation();
    }
  }, [graphData]); // 当数据变化时重新应用力场

  return (
    <div className="w-full h-full relative">
      <ForceGraph2D
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={graphRef as any}
        graphData={graphData}
        nodeRelSize={1}
        nodeVal="val"
        nodeCanvasObject={paintNode as (node: NodeObject<KnowledgeNode>, ctx: CanvasRenderingContext2D, globalScale: number) => void}
        nodePointerAreaPaint={(node: NodeObject<KnowledgeNode>, color, ctx) => {
          const n = node as ForceKnowledgeNode;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.val, 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={() => '#e2e8f0'}
        linkWidth={(link: KnowledgeLink) => Math.sqrt(link.value) * 1.5}
        onNodeClick={(node) => handleNodeClick(node as unknown as KnowledgeNode)}
        cooldownTicks={100}
        onEngineStop={() => graphRef.current?.zoomToFit(400, 50)}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        // 微调仿真参数
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.4}
      />

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 rounded-lg ${(selectedNode?.score || 0) < 60 ? "bg-red-500/10 text-red-500" :
                  (selectedNode?.score || 0) < 85 ? "bg-yellow-500/10 text-yellow-500" :
                    "bg-green-500/10 text-green-500"
                  }`}>
                  <Target className="h-5 w-5" />
                </div>
                <DrawerTitle className="text-xl">
                  {selectedNode?.id.split('/').pop()}
                </DrawerTitle>
              </div>
              <DrawerDescription>
                详细掌握度分析与针对性提升建议。
              </DrawerDescription>
            </DrawerHeader>

            <div className="p-4 space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">当前掌握度</span>
                  <span className="font-bold">{selectedNode?.score || 0}%</span>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${(selectedNode?.score || 0) < 60 ? "bg-red-500" :
                      (selectedNode?.score || 0) < 85 ? "bg-yellow-500" :
                        "bg-green-500"
                      }`}
                    style={{ width: `${selectedNode?.score || 0}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    if (selectedNode) {
                      router.push(`/practice?tag=${encodeURIComponent(selectedNode.id)}`);
                    }
                  }}
                >
                  <BookOpen className="h-4 w-4" />
                  针对性练习
                </Button>
                <DrawerClose asChild>
                  <Button variant="outline" className="w-full">
                    关闭
                  </Button>
                </DrawerClose>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
