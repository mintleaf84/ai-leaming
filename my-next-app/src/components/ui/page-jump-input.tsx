"use client"

import * as React from "react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CornerDownRight } from "lucide-react"

interface PageJumpInputProps {
    totalPages: number
    currentPage: number
    onJump: (page: number) => void
    disabled?: boolean
}

export function PageJumpInput({ totalPages, currentPage, onJump, disabled }: PageJumpInputProps) {
    const [inputValue, setInputValue] = useState("")
    const [isFocused, setIsFocused] = useState(false)

    const handleJump = () => {
        const pageNum = parseInt(inputValue, 10)
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages && pageNum !== currentPage + 1) {
            onJump(pageNum - 1)
            setInputValue("")
            setIsFocused(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleJump()
        } else if (e.key === "Escape") {
            setInputValue("")
            setIsFocused(false)
        }
    }

    if (totalPages <= 1) return null

    return (
        <div className="flex items-center gap-1">
            <div className={`flex items-center border rounded-md transition-colors ${isFocused ? 'border-primary' : ''}`}>
                <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="跳转"
                    value={inputValue}
                    onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "")
                        setInputValue(val)
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                        setTimeout(() => setIsFocused(false), 150)
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    className="w-16 h-9 text-center px-1 border-0 focus:ring-0"
                />
                <span className="px-1 text-xs text-muted-foreground">/ {totalPages}</span>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="h-9 px-2"
                onClick={handleJump}
                disabled={disabled || !inputValue}
            >
                <CornerDownRight className="h-4 w-4" />
            </Button>
        </div>
    )
}