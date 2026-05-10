'use client'

import React, { useState } from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const FEEDBACK_OPTIONS = [
    { value: 'wrong_answer', label: '答案有误' },
    { value: 'wrong_content', label: '题干有误' },
    { value: 'wrong_explanation', label: '解析有误' },
    { value: 'other', label: '其他问题' },
] as const

interface FeedbackDialogProps {
    questionId: number
}

export function FeedbackDialog({ questionId }: FeedbackDialogProps) {
    const [open, setOpen] = useState(false)
    const [feedbackType, setFeedbackType] = useState<string>('')
    const [description, setDescription] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!feedbackType) {
            toast.error('请选择反馈类型')
            return
        }
        setSubmitting(true)
        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question_id: questionId,
                    feedback_type: feedbackType,
                    description: description || undefined,
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => null)
                throw new Error(data?.message || '提交失败')
            }
            toast.success('反馈已提交，感谢您的反馈！')
            setOpen(false)
            setFeedbackType('')
            setDescription('')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '提交失败，请稍后重试')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-orange-500"
                    title="纠错反馈"
                >
                    <Flag className="h-3.5 w-3.5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>纠错反馈</DialogTitle>
                    <DialogDescription>
                        发现这道题有问题？请告诉我们具体错误类型。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>错误类型</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {FEEDBACK_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                                        feedbackType === opt.value
                                            ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium'
                                            : 'border-border hover:border-muted-foreground/30 text-foreground'
                                    }`}
                                    onClick={() => setFeedbackType(opt.value)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="feedback-desc">补充说明（可选）</Label>
                        <Textarea
                            id="feedback-desc"
                            placeholder="请描述具体错误内容，帮助我们更好地修正..."
                            maxLength={500}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                        />
                        <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                        取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting || !feedbackType}>
                        {submitting ? '提交中...' : '提交反馈'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
