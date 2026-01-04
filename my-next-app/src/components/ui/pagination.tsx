"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface PaginationProps {
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
    className?: string
}

export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
    // 生成页码数组
    const getPageNumbers = () => {
        const pages: (number | 'ellipsis')[] = []
        const delta = 2 // 当前页前后显示的页数

        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 || // 第一页
                i === totalPages || // 最后一页
                (i >= currentPage - delta && i <= currentPage + delta) // 当前页前后
            ) {
                pages.push(i)
            } else if (pages[pages.length - 1] !== 'ellipsis') {
                pages.push('ellipsis')
            }
        }

        return pages
    }

    if (totalPages <= 1) return null

    return (
        <nav className={cn("flex items-center justify-center gap-1", className)}>
            {/* 上一页 */}
            <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
            >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">上一页</span>
            </Button>

            {/* 页码 */}
            {getPageNumbers().map((page, idx) => (
                page === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                    </span>
                ) : (
                    <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => onPageChange(page)}
                    >
                        {page}
                    </Button>
                )
            ))}

            {/* 下一页 */}
            <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
            >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">下一页</span>
            </Button>
        </nav>
    )
}
