import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface ExitConfirmModalProps {
    isOpen: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function ExitConfirmModal({ isOpen, onCancel, onConfirm }: ExitConfirmModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl"
                    >
                        <h3 className="text-xl font-bold text-foreground mb-2">确定要退出吗？</h3>
                        <p className="text-muted-foreground mb-6">
                            当前的练习进度已自动保存，但未完成的题目将不会计入本次统计。
                        </p>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={onCancel}
                            >
                                取消
                            </Button>
                            <Button
                                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                onClick={onConfirm}
                            >
                                退出练习
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
