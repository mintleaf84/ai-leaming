import { KnowledgeTree } from '@/components/viz/KnowledgeTree';
import type { KnowledgeGraphData } from '@/types/viz';
import { LayoutDashboard } from 'lucide-react';

interface KnowledgeTreeSectionProps {
    data: KnowledgeGraphData | null;
}

export function KnowledgeTreeSection({ data }: KnowledgeTreeSectionProps) {
    return (
        <>
            <div className="w-full mb-8">
                {data ? (
                    <div className="w-full aspect-[4/3] md:aspect-[21/9]">
                        <KnowledgeTree data={data} />
                    </div>
                ) : (
                    <div className="h-96 flex items-center justify-center text-neutral-300 animate-pulse bg-neutral-50 rounded-2xl">
                        正在加载知识图谱数据...
                    </div>
                )}
            </div>

            <div className="mb-4 p-4 bg-emerald-50/50 rounded-lg border border-emerald-100/50">
                <div className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    操作指南 & 图例说明:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-neutral-500">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center">
                                <span className="inline-block w-2.5 h-2.5 bg-rose-500 rounded-full mr-1.5 shadow-sm shadow-rose-200"></span>
                                <span>薄弱 (&lt;60)</span>
                            </div>
                            <div className="flex items-center">
                                <span className="inline-block w-2.5 h-2.5 bg-amber-500 rounded-full mr-1.5 shadow-sm shadow-amber-200"></span>
                                <span>一般 (60-85)</span>
                            </div>
                            <div className="flex items-center">
                                <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full mr-1.5 shadow-sm shadow-emerald-200"></span>
                                <span>牢固 (&gt;85)</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center">
                                <span className="inline-block w-2.5 h-2.5 bg-neutral-800 rounded-full mr-1.5"></span>
                                <span>核心体系</span>
                            </div>
                            <div className="flex items-center">
                                <span className="inline-block w-2.5 h-2.5 bg-cyan-600 rounded-full mr-1.5"></span>
                                <span>知识分类</span>
                            </div>
                        </div>
                    </div>
                    <div className="border-l border-emerald-100 pl-4 space-y-1 self-center">
                        <p>• <b>缩放/平移</b>: 使用滚轮或手势缩放，拖拽背景移动图谱。</p>
                        <p>• <b>节点详情</b>: 点击具体知识点节点查看详情并开启针对性练习。</p>
                    </div>
                </div>
            </div>
        </>
    );
}
