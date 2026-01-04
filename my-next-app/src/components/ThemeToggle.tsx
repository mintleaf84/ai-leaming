"use client"

import * as React from "react"
import { Moon, Sun, Eye } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
    const { setTheme, theme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    return (
        <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-background/50 backdrop-blur-sm">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme("light")}
                className={`h-7 w-7 rounded-md hover:bg-muted ${mounted && theme === 'light' ? 'text-blue-600 bg-blue-50/50 dark:bg-slate-800 dark:text-blue-400' : 'text-muted-foreground'}`}
                title="亮色模式"
            >
                <Sun className="h-4 w-4" />
                <span className="sr-only">Light</span>
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme("dark")}
                className={`h-7 w-7 rounded-md hover:bg-muted ${mounted && theme === 'dark' ? 'text-blue-600 bg-blue-50/50 dark:bg-slate-800 dark:text-blue-400' : 'text-muted-foreground'}`}
                title="暗黑模式"
            >
                <Moon className="h-4 w-4" />
                <span className="sr-only">Dark</span>
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme("eye-care")}
                className={`h-7 w-7 rounded-md hover:bg-muted ${mounted && theme === 'eye-care' ? 'text-amber-600 bg-amber-50/50' : 'text-muted-foreground'}`}
                title="护眼模式"
            >
                <Eye className="h-4 w-4" />
                <span className="sr-only">Eye Care</span>
            </Button>
        </div>
    )
}
