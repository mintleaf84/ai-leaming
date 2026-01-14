"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type TerminologyMode = "standard" | "neo-chinese";

interface TerminologyContextType {
    mode: TerminologyMode;
    setMode: (mode: TerminologyMode) => void;
    t: (key: string) => string;
}

const TerminologyContext = createContext<TerminologyContextType | undefined>(undefined);

const TERMS: Record<string, { standard: string; neo: string }> = {
    // Navigation
    'nav.home': { standard: '首页', neo: '修习' },
    'nav.practice': { standard: '智能练习', neo: '精进' },
    'nav.wrong_book': { standard: '错题本', neo: '错题集' },
    'nav.history': { standard: '练习记录', neo: '日志' },
    'nav.ai_tutor': { standard: 'AI 助教', neo: 'AI 助教' },
    'nav.knowledge': { standard: '知识卡片', neo: '知识卡片' },
    'nav.textbooks': { standard: '教材库', neo: '藏经阁' },
    'nav.graph': { standard: '知识图谱', neo: '脉络' },
    'nav.docs': { standard: '使用文档', neo: '指南' },
    'nav.pricing': { standard: '订阅与升级', neo: '祈福' },
    'nav.settings': { standard: '设置', neo: '设置' },

    // Sections
    'section.start': { standard: '开始', neo: '启程' },
    'section.knowledge': { standard: '知识库', neo: '智库' },
    'section.system': { standard: '系统', neo: '系统' },
};

export function TerminologyProvider({ children }: { children: React.ReactNode }) {
    // Default to standard for SSR consistency
    const [mode, setModeState] = useState<TerminologyMode>("standard");

    useEffect(() => {
        // Sync with localStorage on client mount
        const saved = localStorage.getItem("terminology-mode") as TerminologyMode;
        if (saved) {
            setModeState(saved);
        }
    }, []);

    const setMode = (newMode: TerminologyMode) => {
        setModeState(newMode);
        localStorage.setItem("terminology-mode", newMode);
    };

    const t = (key: string) => {
        const term = TERMS[key];
        if (!term) return key;
        return mode === "neo-chinese" ? term.neo : term.standard;
    };

    return (
        <TerminologyContext.Provider value={{ mode, setMode, t }}>
            {children}
        </TerminologyContext.Provider>
    );
}

export function useTerminology() {
    const context = useContext(TerminologyContext);
    if (!context) {
        throw new Error("useTerminology must be used within a TerminologyProvider");
    }
    return context;
}
