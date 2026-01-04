import { KnowledgeTree } from '@/components/viz/KnowledgeTree';
import { KnowledgeGraphData } from '@/server/actions/viz';
import { LayoutDashboard } from 'lucide-react';

interface KnowledgeTreeSectionProps {
    data: KnowledgeGraphData | null;
}

export function KnowledgeTreeSection({ data }: KnowledgeTreeSectionProps) {
    return (
        <>
            <div className="border border-border rounded-xl shadow-sm bg-card p-4 w-full overflow-hidden mb-8">
                {data ? (
                    <div className="w-full aspect-[4/3] md:aspect-[3/2]">
                        <KnowledgeTree data={data} />
                    </div>
                ) : (
                    <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">
                        正在加载知识图谱数据...
                    </div>
                )}
            </div>

            <div className="mb-8 p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    操作指南 & 图例说明:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center">
                                <span className="inline-block w-3 h-3 bg-red-500 rounded-full mr-1.5"></span>
                                <span>薄弱 (&lt;60)</span>
                            </div>
                            <div className="flex items-center">
                                <span className="inline-block w-3 h-3 bg-yellow-500 rounded-full mr-1.5"></span>
                                <span>一般 (60-85)</span>
                            </div>
                            <div className="flex items-center">
                                <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-1.5"></span>
                                <span>牢固 (&gt;85)</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center">
                                <span className="inline-block w-3 h-3 bg-slate-900 dark:bg-slate-100 rounded-full mr-1.5"></span>
                                <span>核心体系</span>
                            </div>
                            <div className="flex items-center">
                                <span className="inline-block w-3 h-3 bg-blue-600 rounded-full mr-1.5"></span>
                                <span>知识分类</span>
                            </div>
                        </div>
                    </div>
                    <div className="border-l border-border/50 pl-4 space-y-1 self-center">
                        <p>• <b>缩放/平移</b>: 使用滚轮或手势缩放，拖拽背景移动图谱。</p>
                        <p>• <b>节点详情</b>: 点击具体知识点节点查看详情并开启针对性练习。</p>
                    </div>
                </div>
            </div>
        </>
    );
}
