"use client";

import * as React from "react";
import { Moon, Sun, Eye } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme("light")}
        className={`h-7 w-7 rounded-md hover:bg-muted ${mounted && theme === "light" ? "text-blue-600 bg-blue-50/50 dark:bg-slate-800 dark:text-blue-400" : "text-muted-foreground"}`}
        title="亮色模式"
      >
        <Sun className="h-4 w-4" />
        <span className="sr-only">Light</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme("dark")}
        className={`h-7 w-7 rounded-md hover:bg-muted ${mounted && theme === "dark" ? "text-blue-600 bg-blue-50/50 dark:bg-slate-800 dark:text-blue-400" : "text-muted-foreground"}`}
        title="暗黑模式"
      >
        <Moon className="h-4 w-4" />
        <span className="sr-only">Dark</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme("eye-care")}
        className={`h-7 w-7 rounded-md hover:bg-muted ${mounted && theme === "eye-care" ? "text-amber-600 bg-amber-50/50" : "text-muted-foreground"}`}
        title="护眼模式"
      >
        <Eye className="h-4 w-4" />
        <span className="sr-only">Eye Care</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme("zhuoyu")}
        className={`h-7 w-7 rounded-md hover:bg-muted ${mounted && theme === "zhuoyu" ? "text-emerald-600 bg-emerald-50/50" : "text-muted-foreground"}`}
        title="琢玉模式"
      >
        <div className="relative w-4 h-4 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M6 3h12l4 6-10 13L2 9Z" />
            <path d="M11 3 8 9l4 13 4-13-3-6" />
            <path d="M2 9h20" />
          </svg>
        </div>
        <span className="sr-only">ZhuoYu</span>
      </Button>
    </div>
  );
}
