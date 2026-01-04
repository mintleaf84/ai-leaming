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
        <div className="border-t border-border pt-8">
            <h2 className="text-xl font-bold mb-4 text-foreground">数据管理</h2>
            <div className="flex gap-4">
                <Button onClick={handleExport}>
                    导出进度备份
                </Button>
                <Button variant="outline" onClick={handleImportClick}>
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
            <p className="mt-2 text-sm text-muted-foreground">
                您可以将当前的掌握度数据导出为 JSON 文件，或从之前的备份中恢复。<br />
                <span className="text-destructive font-medium">警告：导入操作将覆盖当前的进度数据，请谨慎操作。</span>
            </p>
        </div>
    );
}
