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
    // 填空题直接返回原答案
    if (targetType === 'fill_blank') return currentAnswer;
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
        type: "single"
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

    // 填空题直接返回原答案
    if (type === 'fill_blank') return answer;

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
            const isJsonAns = question.answer?.trim().startsWith('[') && question.answer?.includes('"');
            const type = question.type || (isJsonAns ? 'multi' : 'single');

            const optionsStr = type === 'truefalse'
                ? '正确\n错误'
                : type === 'fill_blank'
                ? ''
                : (Array.isArray(question.options) ? question.options.join("\n") : "");

            const options = type === 'truefalse'
                ? ['正确', '错误']
                : (Array.isArray(question.options) ? question.options : []);

            const displayAnswer = convertAnswerToDisplay(question.answer, options, type);

            setFormData({
                content: question.content || "",
                optionsStr,
                answer: displayAnswer,
                explanation: question.explanation || "",
                tagsStr: Array.isArray(question.tags) ? question.tags.join(", ") : "",
                dimension: question.dimension || "knowledge",
                type: type
            });
        }
    }, [question, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question) return;
        setLoading(true);
        try {
            const isTrueFalse = formData.type === 'truefalse';
            // 判断题选项固定为 ["正确", "错误"]
            const options = isTrueFalse
                ? ['正确', '错误']
                : formData.optionsStr.split("\n").map(s => s.trim()).filter(Boolean);
            const tags = formData.tagsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);

            if (!formData.content) throw new Error("题干不能为空");
            if (!isTrueFalse && formData.type !== 'fill_blank' && options.length < 2) throw new Error("至少需要2个选项");
            if (!formData.answer) throw new Error("答案不能为空");

            // 校验答案并转换为索引格式 (A, B, C, ...)
            let answerForSave: string;
            if (formData.type === 'truefalse') {
                if (formData.answer !== 'A' && formData.answer !== 'B') throw new Error("判断题答案必须为 A（正确）或 B（错误）");
                answerForSave = formData.answer;
            } else if (formData.type === 'fill_blank') {
                // 填空题：直接保存文本答案，支持 | 分隔的多答案
                if (!formData.answer.trim()) throw new Error("填空题答案不能为空");
                answerForSave = formData.answer.trim();
            } else if (formData.type === 'single') {
                const optIndex = options.indexOf(formData.answer);
                if (optIndex === -1) throw new Error("单选题答案必须是选项之一");
                answerForSave = getOptionIndex(optIndex);
            } else {
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
            }

            const updateData = {
                content: formData.content,
                options,
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
                                        toast.info(`答案已自动转换为${newType === 'multi' ? '多选' : newType === 'single' ? '单选' : newType === 'fill_blank' ? '填空' : '判断'}格式`);
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

                    {/* 判断题时隐藏选项编辑区，显示固定提示 */}
                    {formData.type === 'truefalse' ? (
                        <div className="space-y-2">
                            <Label>选项 (判断题固定)</Label>
                            <div className="p-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
                                A. 正确 &nbsp;/&nbsp; B. 错误（系统自动填充，无需手动修改）
                            </div>
                        </div>
                    ) : formData.type === 'fill_blank' ? (
                        <div className="space-y-2">
                            <Label>选项 (填空题无需选项)</Label>
                            <div className="p-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
                                填空题无需设置选项，直接在题干中用 _____ 标记空位。
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
                                placeholder="选项A&#10;选项B&#10;选项C&#10;选项D"
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
                        ) : formData.type === 'fill_blank' ? (
                            /* 填空题：支持多个空，每个空支持多个答案用 | 分隔 */
                            <div className="space-y-3">
                                <div className="p-3 rounded-md border bg-teal-500/5 border-teal-500/20 text-sm">
                                    <p className="font-medium text-teal-700 dark:text-teal-400 mb-1">填空题答案格式说明</p>
                                    <ul className="text-muted-foreground space-y-1 text-xs">
                                        <li>- 多个空之间用中文分号 <code className="bg-muted px-1 rounded">；</code> 分隔</li>
                                        <li>- 单个空有多个可接受答案时，用 <code className="bg-muted px-1 rounded">|</code> 分隔</li>
                                        <li>- 示例：<code className="bg-muted px-1 rounded">教育学|教育学原理；赫尔巴特|赫尔巴特</code></li>
                                    </ul>
                                </div>
                                <Textarea
                                    value={formData.answer}
                                    onChange={(e) => setFormData(prev => ({ ...prev, answer: e.target.value }))}
                                    placeholder="答案1A|答案1B；答案2"
                                    rows={3}
                                    className="font-mono text-sm"
                                    required
                                />
                                <div className="text-xs text-muted-foreground">
                                    当前答案预览：{formData.answer.split('；').map((blank, i) => {
                                        const options = blank.split('|').map(s => s.trim());
                                        return (
                                            <span key={i} className="inline-flex items-center gap-1 mr-2">
                                                <span className="font-medium text-teal-600">空{i + 1}:</span>
                                                {options.map((opt, j) => (
                                                    <span key={j}>
                                                        <code className="bg-muted px-1 rounded text-xs">{opt}</code>
                                                        {j < options.length - 1 && <span className="text-muted-foreground mx-0.5">或</span>}
                                                    </span>
                                                ))}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
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
