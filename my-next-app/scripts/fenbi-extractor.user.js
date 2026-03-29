// ==UserScript==
// @name         粉笔 JSON 全能嗅探提取器 (直供 ai-leaming)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  同时劫持 XHR 和 Fetch，无论什么框架都能精准抓取粉笔网络请求
// @author       Antigravity
// @match        *://*.fenbi.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log("🚀 [ai-leaming 抓取器] 核心嗅探引擎已启动...");

    // 存储最新的原始 JSON 字符串
    const store = {
        exerciseJson: '',   // 对应 getSolution (记录+答案)
        solutionsJson: '',  // 对应 static/solution 或 question (题目详情)
        statsJson: ''       // 对应 getMeta (统计数据)
    };

    // --- 统一的数据分类与存储逻辑 ---
    function processInterceptedData(url, responseText) {
        let isUpdated = false;

        // 1. 甄别答题数据 (通常是 getSolution)
        if (url.includes('/combine/exercise/getSolution')) {
            store.exerciseJson = responseText;
            console.log("✅ [嗅探成功] 抓取到【答题数据】", url);
            isUpdated = true;
        }
        
        // 2. 甄别题目数据 (通常是 static/solution)
        if (url.includes('/combine/static/solution')) {
            store.solutionsJson = responseText;
            console.log("✅ [嗅探成功] 抓取到【题目数据】", url);
            isUpdated = true;
        }
        
        // 3. 甄别统计数据 (通常是 getMeta)
        if (url.includes('/combine/question/getMeta')) {
            store.statsJson = responseText;
            console.log("✅ [嗅探成功] 抓取到【统计数据】", url);
            isUpdated = true;
        }

        if (isUpdated) updateUI();
    }

    // --- 核心武器 1：劫持 XMLHttpRequest ---
    const OriginXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new OriginXHR();
        xhr.addEventListener('load', function() {
            if (xhr.responseURL && xhr.responseURL.includes('tiku.fenbi.com')) {
                // 读取响应文本
                let responseText = '';
                if (xhr.responseType === '' || xhr.responseType === 'text' || xhr.responseType === 'json') {
                    responseText = xhr.responseType === 'json' ? JSON.stringify(xhr.response) : xhr.responseText;
                    processInterceptedData(xhr.responseURL, responseText);
                }
            }
        });
        return xhr;
    };
    // 继承 XHR 静态属性
    Object.assign(window.XMLHttpRequest, OriginXHR);

    // --- 核心武器 2：劫持 Fetch ---
    const originFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originFetch(...args);
        const url = args[0] instanceof Request ? args[0].url : args[0];

        if (url && typeof url === 'string' && url.includes('tiku.fenbi.com')) {
            // 需要 clone() 避免影响页面的正常 json 读取
            const cloneRes = response.clone();
            cloneRes.text().then(text => {
                processInterceptedData(url, text);
            }).catch(e => console.error("Fetch 获取文本失败", e));
        }
        return response;
    };


    // --- 复制到剪贴板功能 ---
    function copyText(text, btnId) {
        if (!text) {
            alert('❌ 还未抓取到数据！\\n请确保你在粉笔网页版点击进入了一套试卷的“查看解析”页面。');
            return;
        }
        
        // 使用现代 clipboard API
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById(btnId);
            const originalText = btn.innerText;
            btn.innerText = '✅ 已复制！去粘贴！';
            btn.style.background = '#52c41a';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.background = '#1890ff';
            }, 2000);
        }).catch(err => {
            alert('复制失败，可能是浏览器权限限制');
            console.error('复制失败:', err);
        });
    }

    // --- 注入专属悬浮控制面板 ---
    function initUI() {
        if (document.getElementById('zhuoyu-fb-extractor')) return;
        
        const panel = document.createElement('div');
        panel.id = 'zhuoyu-fb-extractor';
        panel.innerHTML = `
            <div style="font-weight:bold;margin-bottom:8px;color:#333;font-size:14px;border-bottom:1px solid #eee;padding-bottom:5px;">
                🚀 ai-leaming 导入提取器 3.0
            </div>
            
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span>1. 答题数据(userAnswers)</span>
                    <span id="st-exe" style="color:red;font-weight:bold">等待刷新...</span>
                </div>
                <button id="btn-copy-exe" style="width:100%;padding:5px;background:#1890ff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">一键复制</button>
            </div>
            
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span>2. 题目数据(solutions)</span>
                    <span id="st-sol" style="color:red;font-weight:bold">等待刷新...</span>
                </div>
                <button id="btn-copy-sol" style="width:100%;padding:5px;background:#1890ff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">一键复制</button>
            </div>
            
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span>3. 统计数据(getMeta)</span>
                    <span id="st-meta" style="color:red;font-weight:bold">等待刷新...</span>
                </div>
                <button id="btn-copy-meta" style="width:100%;padding:5px;background:#1890ff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">一键复制</button>
            </div>
            <div style="font-size:10px;color:#999;text-align:center;margin-top:5px;line-height:1.4">请进入某一套试卷的<br><b>【查看解析】</b>页面进行抓取</div>
        `;
        
        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', left: '20px', zIndex: '999999',
            background: '#fff', padding: '12px', borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.15)', width: '220px', 
            fontFamily: 'sans-serif', border: '1px solid #e8e8e8'
        });
        document.body.appendChild(panel);

        document.getElementById('btn-copy-exe').onclick = () => copyText(store.exerciseJson, 'btn-copy-exe');
        document.getElementById('btn-copy-sol').onclick = () => copyText(store.solutionsJson, 'btn-copy-sol');
        document.getElementById('btn-copy-meta').onclick = () => copyText(store.statsJson, 'btn-copy-meta');
    }

    // 更新面板状态灯
    function updateUI() {
        if(!document.getElementById('zhuoyu-fb-extractor')) return;
        
        const updateStatus = (id, checkStr) => {
            const el = document.getElementById(id);
            if (checkStr) {
                el.innerText = '✅ 已抓取';
                el.style.color = '#52c41a';
            }
        };
        
        updateStatus('st-exe', store.exerciseJson);
        updateStatus('st-sol', store.solutionsJson);
        updateStatus('st-meta', store.statsJson);
    }

    window.addEventListener('load', initUI);
    // 兼容 SPA，不依赖 load 事件
    if (document.readyState === "complete" || document.readyState === "interactive") {
        initUI();
    }
})();
