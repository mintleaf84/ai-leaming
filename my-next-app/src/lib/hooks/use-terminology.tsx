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
    'nav.ai_tutor': { standard: 'AI 助教', neo: '灵犀' },
    'nav.knowledge': { standard: '知识卡片', neo: '锦囊' },
    'nav.textbooks': { standard: '教材库', neo: '藏经阁' },
    'nav.graph': { standard: '知识图谱', neo: '脉络' },
    'nav.docs': { standard: '使用文档', neo: '指南' },
    'nav.pricing': { standard: '订阅与升级', neo: '祈福' },
    'nav.settings': { standard: '设置', neo: '设置' },
    'nav.ocr': { standard: '文字识别', neo: '观文' },
    'nav.mindmap': { standard: '思维导图工作台', neo: '道图' },

    // Sections
    'section.start': { standard: '开始', neo: '启程' },
    'section.knowledge': { standard: '知识库', neo: '智库' },
    'section.more': { standard: '更多功能', neo: '百宝' },
    'section.system': { standard: '系统', neo: '系统' },

    // App Sidebar Dropdown
    'app.account_type': { standard: '个人账号', neo: '个人修习' },
    'app.settings': { standard: '系统设置', neo: '设置' },
    'app.pricing': { standard: '升级订阅', neo: '祈福升级' },
    'app.theme': { standard: '外观主题', neo: '界面风格' },
    'app.logout': { standard: '退出登录', neo: '归隐' },
    'app.login': { standard: '登录 / 注册', neo: '拜山 / 投帖' },
    'app.preparing': { standard: '备考中', neo: '修习中' },

    // Chat
    'chat.new': { standard: '新建对话', neo: '问道' },
    'chat.search': { standard: '搜索聊天记录...', neo: '寻觅往昔...' },
    'chat.favorites': { standard: '我的收藏', neo: '珍藏' },
    'chat.empty': { standard: '暂无历史对话', neo: '空山新雨' },
    'chat.start_tip': { standard: '输入消息开始新对话', neo: '起笔论道' },

    // Knowledge
    'knowledge.title': { standard: '知识卡片库', neo: '锦囊智库' },
    'knowledge.total': { standard: '共收录', neo: '汇集' },
    'knowledge.add': { standard: '手动添加', neo: '手书' },
    'knowledge.study': { standard: '复习模式', neo: '温故知新' },
    'knowledge.export': { standard: '导出为 Anki', neo: '结集' },
    'knowledge.search': { standard: '搜索卡片...', neo: '检视锦囊...' },
    'knowledge.all_cats': { standard: '全部分类', neo: '万象' },
};

export function TerminologyProvider({ children }: { children: React.ReactNode }) {
    // Default to standard for SSR consistency
    const [mode, setModeState] = useState<TerminologyMode>("standard");

    useEffect(() => {
        // Sync with localStorage on client mount
        const saved = localStorage.getItem("terminology-mode") as TerminologyMode;
        if (saved) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
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
