'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { SystemStatus } from './types';

interface ModelRankingProps {
    byModel: SystemStatus['ai']['byModel'];
}

export function ModelRanking({ byModel }: ModelRankingProps) {
    return (
        <Card className="md:col-span-4">
            <CardHeader>
                <CardTitle>模型消耗排行</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>模型</TableHead>
                            <TableHead className="text-right">调用</TableHead>
                            <TableHead className="text-right">Tokens</TableHead>
                            <TableHead className="text-right">总成本</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {byModel?.map((m) => (
                            <TableRow key={m.model}>
                                <TableCell className="font-medium text-xs">{m.model}</TableCell>
                                <TableCell className="text-right text-xs">{m.calls}</TableCell>
                                <TableCell className="text-right text-xs">{m.tokens.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold text-xs">¥{m.cost.toFixed(3)}</TableCell>
                            </TableRow>
                        ))}
                        {(!byModel || byModel.length === 0) && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                    暂无调用记录
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
