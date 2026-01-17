"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { updateQuestionAction } from "@/server/actions/admin";

interface EditQuestionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    question: any;
    onSuccess: () => void;
}

export function EditQuestionDialog({
    open,
    onOpenChange,
    question,
    onSuccess,
}: EditQuestionDialogProps) {
    const [formData, setFormData] = useState({
        content: "",
        optionsStr: "",
        answer: "",
        explanation: "",
        tagsStr: "",
        dimension: "knowledge",
        type: "single"
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (question && open) {
            // 尝试自动识别类型（如果后端还没存type字段）
            const isJsonAns = question.answer?.trim().startsWith('[') && question.answer?.includes('"');
            const type = question.type || (isJsonAns ? 'multi' : 'single');

            setFormData({
                content: question.content || "",
                optionsStr: Array.isArray(question.options) ? question.options.join("\n") : "",
                answer: question.answer || "",
                explanation: question.explanation || "",
                tagsStr: Array.isArray(question.tags) ? question.tags.join(", ") : "",
                dimension: question.dimension || "knowledge",
                type: type
            });
        }
    }, [question, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const options = formData.optionsStr.split("\n").map(s => s.trim()).filter(Boolean);
            const tags = formData.tagsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);

            if (!formData.content) throw new Error("题干不能为空");
            if (options.length < 2) throw new Error("至少需要2个选项");
            if (!formData.answer) throw new Error("答案不能为空");

            // 校验答案
            if (formData.type === 'single') {
                if (!options.includes(formData.answer)) throw new Error("单选题答案必须是选项之一");
            } else {
                try {
                    const ansArr = JSON.parse(formData.answer);
                    if (!Array.isArray(ansArr) || ansArr.length === 0) throw new Error("多选题至少选择一个答案");
                    if (!ansArr.every(a => options.includes(a))) throw new Error("多选题答案项必须存在于选项中");
                } catch (e) {
                    throw new Error("多选题答案格式错误");
                }
            }

            const updateData = {
                content: formData.content,
                options,
                answer: formData.answer,
                explanation: formData.explanation,
                tags,
                dimension: formData.dimension,
                type: formData.type // 传递 type
            };

            const res = await updateQuestionAction(question.id, updateData);
            if (res.success) {
                toast.success("题目更新成功");
                onSuccess();
                onOpenChange(false);
            } else {
                toast.error(res.error || "更新失败");
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    // 实时解析选项以供选择
    const parsedOptions = formData.optionsStr.split("\n").map(s => s.trim()).filter(Boolean);

    // 处理多选变动
    const handleMultiAnswerChange = (option: string, checked: boolean) => {
        try {
            const current = formData.answer ? JSON.parse(formData.answer) : [];
            let next;
            if (checked) {
                next = [...current, option];
            } else {
                next = current.filter((o: string) => o !== option);
            }
            setFormData(prev => ({ ...prev, answer: JSON.stringify(next) }));
        } catch {
            // 如果解析失败，重置
            setFormData(prev => ({ ...prev, answer: JSON.stringify([option]) }));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>编辑题目 #{question?.id}</DialogTitle>
                    <DialogDescription>
                        修改题目内容。请确保数据的准确性。
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="content">题干内容</Label>
                        <Textarea
                            id="content"
                            value={formData.content}
                            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                            rows={3}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>题目类型</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(val) => setFormData(prev => ({
                                    ...prev,
                                    type: val,
                                    answer: "" // 切换类型时清空答案
                                }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="single">单项选择</SelectItem>
                                    <SelectItem value="multi">不定项选择 (多选)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="dimension">维度</Label>
                            <Select
                                value={formData.dimension}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, dimension: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="knowledge">识记</SelectItem>
                                    <SelectItem value="understanding">理解</SelectItem>
                                    <SelectItem value="application">应用</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="options">选项列表 (每行一个)</Label>
                        <Textarea
                            id="options"
                            value={formData.optionsStr}
                            onChange={(e) => setFormData(prev => ({ ...prev, optionsStr: e.target.value }))}
                            rows={4}
                            placeholder="选项A&#10;选项B&#10;选项C&#10;选项D"
                            required
                            className="font-mono text-sm"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-primary font-bold">正确答案 ({formData.type === 'single' ? '单选' : '多选'})</Label>

                        {formData.type === 'single' ? (
                            <Select
                                value={formData.answer}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, answer: val }))}
                            >
                                <SelectTrigger className="border-primary/50">
                                    <SelectValue placeholder="选择正确选项" />
                                </SelectTrigger>
                                <SelectContent>
                                    {parsedOptions.length > 0 ? (
                                        parsedOptions.map((opt, idx) => (
                                            <SelectItem key={idx} value={opt}>{opt}</SelectItem>
                                        ))
                                    ) : (
                                        <div className="p-2 text-xs text-muted-foreground">请先填写选项</div>
                                    )}
                                </SelectContent>
                            </Select>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-primary/20 p-3 rounded-md bg-muted/10">
                                {parsedOptions.length > 0 ? (
                                    parsedOptions.map((opt, idx) => {
                                        let isChecked = false;
                                        try {
                                            isChecked = JSON.parse(formData.answer || '[]').includes(opt);
                                        } catch { }

                                        return (
                                            <div key={idx} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`ans-${idx}`}
                                                    checked={isChecked}
                                                    onCheckedChange={(c) => handleMultiAnswerChange(opt, c === true)}
                                                />
                                                <Label htmlFor={`ans-${idx}`} className="font-normal cursor-pointer flex-1 truncate" title={opt}>
                                                    {opt}
                                                </Label>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-2 text-xs text-muted-foreground">请先填写选项</div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="explanation">解析</Label>
                        <Textarea
                            id="explanation"
                            value={formData.explanation}
                            onChange={(e) => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tags">标签 (逗号分隔)</Label>
                        <Input
                            id="tags"
                            value={formData.tagsStr}
                            onChange={(e) => setFormData(prev => ({ ...prev, tagsStr: e.target.value }))}
                            placeholder="心理学, 认知过程, 注意"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "保存中..." : "保存更改"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
