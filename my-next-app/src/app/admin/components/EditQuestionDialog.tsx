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
        optionsStr: "", // 用换行符分隔的选项
        answer: "",
        explanation: "",
        tagsStr: "",    // 用逗号分隔的标签
        dimension: "knowledge"
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (question && open) {
            setFormData({
                content: question.content || "",
                optionsStr: Array.isArray(question.options) ? question.options.join("\n") : "",
                answer: question.answer || "",
                explanation: question.explanation || "",
                tagsStr: Array.isArray(question.tags) ? question.tags.join(", ") : "",
                dimension: question.dimension || "knowledge",
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
            if (!options.includes(formData.answer)) throw new Error("答案必须是选项之一");

            const updateData = {
                content: formData.content,
                options,
                answer: formData.answer,
                explanation: formData.explanation,
                tags,
                dimension: formData.dimension
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

                        <div className="space-y-2">
                            <Label htmlFor="answer">正确答案</Label>
                            <Input
                                id="answer"
                                value={formData.answer}
                                onChange={(e) => setFormData(prev => ({ ...prev, answer: e.target.value }))}
                                placeholder="必须与选项完全一致"
                                required
                            />
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
