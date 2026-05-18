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
import { Question } from "@/types";

interface EditQuestionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    question: Question | null;
    onSuccess: () => void;
}

/**
 * 将答案转换为目标类型对应的格式
 */
function convertAnswerFormat(
    currentAnswer: string,
    targetType: 'single' | 'multi' | 'truefalse' | 'fill_blank',
    options: string[]
): string {
    if (!currentAnswer) return '';

    const trimmed = currentAnswer.trim();
    let currentArr: string[];

    if (trimmed.startsWith('[')) {
        try {
            currentArr = JSON.parse(trimmed);
        } catch {
            currentArr = [trimmed];
        }
    } else if (trimmed.includes(',')) {
        currentArr = trimmed.split(',').map(s => s.trim());
    } else {
        currentArr = [trimmed];
    }

    switch (targetType) {
        case 'multi':
            return JSON.stringify(currentArr);
        case 'single':
        case 'truefalse':
            if (currentArr.length === 0) return '';
            const firstAnswer = currentArr[0];
            if (options.length > 0 && !options.includes(firstAnswer)) {
                return options[0];
            }
            return firstAnswer;
        case 'fill_blank':
            return currentArr.join(';');
        default:
            return currentAnswer;
    }
}

/**
 * 获取选项对应的索引标识 (A, B, C, ...)
 */
function getOptionIndex(index: number): string {
    return String.fromCharCode(65 + index);
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
        type: "single" as 'single' | 'multi' | 'truefalse' | 'fill_blank'
    });
    const [loading, setLoading] = useState(false);

    /**
 * 将答案从索引格式 (A) 转换回选项文字供前端显示
 * @param answer 数据库中存储的答案（可能是索引如 "A" 或 JSON 如 ["A","B"]）
 * @param options 选项文字列表
 * @param type 题目类型
 */
function convertAnswerToDisplay(answer: string | null | undefined, options: string[], type: string): string {
    if (!answer) return '';

    const trimmed = answer.trim();
    let indices: string[];

    if (trimmed.startsWith('[')) {
        try {
            indices = JSON.parse(trimmed);
        } catch {
            indices = [trimmed];
        }
    } else if (trimmed.includes(',')) {
        indices = trimmed.split(',').map(s => s.trim());
    } else {
        indices = [trimmed];
    }

    if (type === 'multi') {
        const textArr = indices.map(idx => {
            const optIdx = idx.charCodeAt(0) - 65;
            return options[optIdx] || idx;
        });
        return JSON.stringify(textArr);
    } else {
        const optIdx = indices[0]?.charCodeAt(0) - 65;
        return options[optIdx] || indices[0] || '';
    }
}

useEffect(() => {
        if (question && open) {
            const type = question.type || 'single';
            const isJsonAns = question.answer?.trim().startsWith('[') && question.answer?.includes('"');
            const resolvedType = type === 'fill_blank' ? 'fill_blank' : (isJsonAns ? 'multi' : type);

            const optionsStr = type === 'truefalse'
                ? '正确\n错误'
                : (Array.isArray(question.options) ? question.options.join("\n") : "");

            const options = type === 'truefalse'
                ? ['正确', '错误']
                : (Array.isArray(question.options) ? question.options : []);

            const displayAnswer = type === 'fill_blank' 
                ? question.answer || ''
                : convertAnswerToDisplay(question.answer, options, type);

            setFormData({
                content: question.content || "",
                optionsStr,
                answer: displayAnswer,
                explanation: question.explanation || "",
                tagsStr: Array.isArray(question.tags) ? question.tags.join(", ") : "",
                dimension: question.dimension || "knowledge",
                type: resolvedType
            });
        }
    }, [question, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question) return;
        setLoading(true);
        try {
            const isTrueFalse = formData.type === 'truefalse';
            const isFillBlank = formData.type === 'fill_blank';
            // 判断题选项固定为 ["正确", "错误"]，填空题无需选项
            const options = isTrueFalse
                ? ['正确', '错误']
                : isFillBlank
                ? []
                : formData.optionsStr.split("\n").map(s => s.trim()).filter(Boolean);
            const tags = formData.tagsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);

            if (!formData.content) throw new Error("题干不能为空");
            if (!isFillBlank && !isTrueFalse && options.length < 2) throw new Error("至少需要 2 个选项");
            if (!formData.answer) throw new Error("答案不能为空");

            // 校验答案并转换为对应格式
            let answerForSave: string;
            if (formData.type === 'truefalse') {
                if (formData.answer !== 'A' && formData.answer !== 'B') throw new Error("判断题答案必须为 A（正确）或 B（错误）");
                answerForSave = formData.answer;
            } else if (formData.type === 'single') {
                const optIndex = options.indexOf(formData.answer);
                if (optIndex === -1) throw new Error("单选题答案必须是选项之一");
                answerForSave = getOptionIndex(optIndex);
            } else if (formData.type === 'multi') {
                try {
                    const ansArr = JSON.parse(formData.answer);
                    if (!Array.isArray(ansArr) || ansArr.length === 0) throw new Error("多选题至少选择一个答案");
                    const invalid = ansArr.filter((a: string) => !options.includes(a));
                    if (invalid.length > 0) throw new Error("多选题答案项必须存在于选项中");
                    // 转换为索引格式
                    const indices = ansArr.map((a: string) => getOptionIndex(options.indexOf(a)));
                    answerForSave = JSON.stringify(indices);
                } catch (_e) {
                    throw new Error("多选题答案格式错误");
                }
            } else if (formData.type === 'fill_blank') {
                // 填空题：答案保持原样，分号分隔多空
                answerForSave = formData.answer.trim();
            } else {
                answerForSave = formData.answer;
            }

            const updateData = {
                content: formData.content,
                options: options.length > 0 ? options : undefined,
                answer: answerForSave,
                explanation: formData.explanation,
                tags,
                dimension: formData.dimension as 'knowledge' | 'understanding' | 'application',
                type: formData.type as 'single' | 'multi' | 'truefalse' | 'fill_blank',
            };

            const result = await updateQuestionAction({ id: question.id, data: updateData });
            
            if (result.serverError) {
                toast.error(result.serverError || "更新失败");
            } else if (result.data?.success) {
                toast.success("题目更新成功");
                onSuccess();
                onOpenChange(false);
            }
        } catch (_e) {
            throw _e;
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
                                onValueChange={(val) => {
                                    const newType = val as 'single' | 'multi' | 'truefalse' | 'fill_blank';
                                    const oldType = formData.type;

                                    let newOptionsStr = formData.optionsStr;
                                    if (newType === 'truefalse') {
                                        newOptionsStr = '正确\n错误';
                                    } else if (newType === 'fill_blank') {
                                        newOptionsStr = '';
                                    } else if (newType !== oldType && oldType === 'truefalse') {
                                        newOptionsStr = '';
                                    }

                                    let newAnswer = formData.answer;
                                    if (newType !== oldType && formData.answer) {
                                        const checkOptions = newType === 'truefalse'
                                            ? ['正确', '错误']
                                            : newOptionsStr.split("\n").map(s => s.trim()).filter(Boolean);
                                        newAnswer = convertAnswerFormat(formData.answer, newType, checkOptions);
                                        const typeLabel = newType === 'multi' ? '多选' : newType === 'single' ? '单选' : newType === 'truefalse' ? '判断' : '填空';
                                        toast.info(`答案已自动转换为${typeLabel}格式`);
                                    }

                                    setFormData(prev => ({
                                        ...prev,
                                        type: newType,
                                        optionsStr: newOptionsStr,
                                        answer: newAnswer
                                    }));
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="single">单项选择</SelectItem>
                                    <SelectItem value="multi">不定项选择 (多选)</SelectItem>
                                    <SelectItem value="truefalse">判断题</SelectItem>
                                    <SelectItem value="fill_blank">填空题</SelectItem>
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

                    {/* 判断题和填空题时隐藏选项编辑区 */}
                    {formData.type === 'truefalse' ? (
                        <div className="space-y-2">
                            <Label>选项 (判断题固定)</Label>
                            <div className="p-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
                                A. 正确 &nbsp;/&nbsp; B. 错误（系统自动填充，无需手动修改）
                            </div>
                        </div>
                    ) : formData.type === 'fill_blank' ? (
                        <div className="space-y-2">
                            <Label>题干格式说明</Label>
                            <div className="p-3 rounded-md border bg-muted/30 text-sm text-muted-foreground space-y-2">
                                <p>请在题干中使用 <code className="px-2 py-1 bg-muted rounded">_____</code>（5 个下划线）标记填空位置。</p>
                                <p className="text-xs">示例：中国古代教育思想的起源是在____时期。</p>
                                <p className="text-xs text-blue-600">注：系统会自动将已有的 input 标签或下划线转换为标准格式。</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="options">选项列表 (每行一个)</Label>
                            <Textarea
                                id="options"
                                value={formData.optionsStr}
                                onChange={(e) => setFormData(prev => ({ ...prev, optionsStr: e.target.value }))}
                                rows={4}
                                placeholder="选项 A&#10;选项 B&#10;选项 C&#10;选项 D"
                                required
                                className="font-mono text-sm"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-primary font-bold">
                            正确答案 ({formData.type === 'single' ? '单选' : formData.type === 'truefalse' ? '判断' : formData.type === 'fill_blank' ? '填空' : '多选'})
                        </Label>

                        {formData.type === 'truefalse' ? (
                            /* 判断题：只允许选 A（正确）或 B（错误） */
                            <Select
                                value={formData.answer}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, answer: val }))}
                            >
                                <SelectTrigger className="border-primary/50">
                                    <SelectValue placeholder="选择正确答案" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="A">A — 正确</SelectItem>
                                    <SelectItem value="B">B — 错误</SelectItem>
                                </SelectContent>
                            </Select>
                        ) : formData.type === 'single' ? (
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
                        ) : formData.type === 'fill_blank' ? (
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground mb-2">
                                    多个答案请用中文分号 <code className="px-1.5 py-0.5 bg-muted rounded">；</code> 分隔
                                </div>
                                <Textarea
                                    value={formData.answer}
                                    onChange={(e) => setFormData(prev => ({ ...prev, answer: e.target.value }))}
                                    rows={3}
                                    placeholder="例如：春秋；春秋时期"
                                    className="font-mono text-sm"
                                />
                                {formData.answer.includes('；') && (
                                    <div className="text-xs text-blue-600">
                                        检测到 {formData.answer.split(';').filter(Boolean).length} 个空
                                    </div>
                                )}
                            </div>
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
