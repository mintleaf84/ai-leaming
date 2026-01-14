import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { exportUserDataAction, importUserDataAction } from '@/server/actions/data';

interface DataManagementSectionProps {
    onDataChange: () => void;
}

export function DataManagementSection({ onDataChange }: DataManagementSectionProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        try {
            const backup = await exportUserDataAction();
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-learning-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("进度备份导出成功");
        } catch (error) {
            toast.error("导出失败");
            console.error(error);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const content = event.target?.result as string;
                const backupData = JSON.parse(content);
                const result = await importUserDataAction(backupData);

                if (result.success) {
                    toast.success(result.message);
                    onDataChange();
                    // Reset file input
                    if (fileInputRef.current) fileInputRef.current.value = '';
                } else {
                    toast.error(result.message);
                }
            } catch (error) {
                toast.error("无效的 JSON 备份文件");
                console.error(error);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-4 text-neutral-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-emerald-500 rounded-full" />
                数据管理
            </h2>
            <div className="flex flex-wrap gap-3">
                <Button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 shadow-md transition-all">
                    导出进度备份
                </Button>
                <Button variant="outline" onClick={handleImportClick} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                    导入进度备份
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".json"
                    className="hidden"
                />
            </div>
            <p className="mt-4 text-xs text-neutral-400 leading-relaxed bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                您可以将当前的掌握度数据导出为 JSON 文件，或从之前的备份中恢复。<br />
                <span className="text-rose-500 font-medium">⚠️ 警告：导入操作将覆盖当前的进度数据，请谨慎操作。</span>
            </p>
        </div>
    );
}
