// ==UserScript==
// @name         粉笔 JSON 全能嗅探提取器 (直推 ai-leaming 版)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  同时劫持 XHR 和 Fetch，捕获后一键推送到本地/远端系统
// @author       Antigravity
// @match        *://*.fenbi.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @connect      127.0.0.1
// @connect      zhuoyu.887780.xyz
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log("🚀 [ai-leaming 抓取器] 核心嗅探引擎 4.0 已启动...");

    // 存储最新的原始 JSON 字符串
    const store = {
        exerciseJson: '',
        solutionsJson: '',
        statsJson: ''
    };

    // --- 统一的数据分类与存储逻辑 ---
    function processInterceptedData(url, responseText) {
        let isUpdated = false;

        if (url.includes('/combine/exercise/getSolution')) {
            store.exerciseJson = responseText;
            console.log("✅ [嗅探成功] 抓取到【答题数据】", url);
            isUpdated = true;
        }
        
        if (url.includes('/combine/static/solution')) {
            store.solutionsJson = responseText;
            console.log("✅ [嗅探成功] 抓取到【题目数据】", url);
            isUpdated = true;
        }
        
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
                let responseText = '';
                if (xhr.responseType === '' || xhr.responseType === 'text' || xhr.responseType === 'json') {
                    responseText = xhr.responseType === 'json' ? JSON.stringify(xhr.response) : xhr.responseText;
                    processInterceptedData(xhr.responseURL, responseText);
                }
            }
        });
        return xhr;
    };
    Object.assign(window.XMLHttpRequest, OriginXHR);

    // --- 核心武器 2：劫持 Fetch ---
    const originFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originFetch(...args);
        const url = args[0] instanceof Request ? args[0].url : args[0];

        if (url && typeof url === 'string' && url.includes('tiku.fenbi.com')) {
            const cloneRes = response.clone();
            cloneRes.text().then(text => {
                processInterceptedData(url, text);
            }).catch(e => console.error("Fetch 获取文本失败", e));
        }
        return response;
    };


    // --- 推送到服务器 ---
    function pushToServer(btnId) {
        if (!store.exerciseJson || !store.solutionsJson) {
            alert('❌ 数据不完整！\\n必须包含【答题数据】和【题目数据】才能推送。\\n请确保打开了“查看解析”页面。');
            return;
        }

        const serverUrl = document.getElementById('fb-server-url').value.trim();
        const apiToken = document.getElementById('fb-api-token').value.trim();

        if (!serverUrl || !apiToken) {
            alert('❌ 请先填写服务器地址和通信凭证！');
            return;
        }

        // 保存配置到油猴本地
        GM_setValue('fb_server_url', serverUrl);
        GM_setValue('fb_api_token', apiToken);

        const btn = document.getElementById(btnId);
        btn.innerText = '🚀 推送中...';
        btn.style.background = '#faad14';
        btn.disabled = true;

        GM_xmlhttpRequest({
            method: "POST",
            url: `${serverUrl.replace(/\/$/, '')}/api/import/fenbi-webhook`,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiToken}`
            },
            data: JSON.stringify({
                exerciseJson: store.exerciseJson,
                solutionsJson: store.solutionsJson,
                statsJson: store.statsJson || ''
            }),
            onload: function(response) {
                btn.disabled = false;
                if (response.status === 200) {
                    try {
                        const res = JSON.parse(response.responseText);
                        if (res.success) {
                            btn.innerText = '✅ ' + (res.message || '导入成功！');
                            btn.style.background = '#52c41a';
                        } else {
                            btn.innerText = '❌ 导入失败';
                            btn.style.background = '#ff4d4f';
                            alert(res.message || '返回了失败标识');
                        }
                    } catch(e) {
                        btn.innerText = '✅ 请求成功(解析异常)';
                        btn.style.background = '#52c41a';
                    }
                } else {
                    btn.innerText = `❌ 请求错误 (${response.status})`;
                    btn.style.background = '#ff4d4f';
                    console.error("服务端响应:", response.responseText);
                }
                setTimeout(() => {
                    btn.innerText = '⚡ 一键推送到 ai-leaming';
                    btn.style.background = '#1890ff';
                }, 4000);
            },
            onerror: function(err) {
                btn.disabled = false;
                btn.innerText = "❌ 网络连接失败";
                btn.style.background = '#ff4d4f';
                console.error("跨域推送失败:", err);
                setTimeout(() => {
                    btn.innerText = '⚡ 一键推送到 ai-leaming';
                    btn.style.background = '#1890ff';
                }, 3000);
            }
        });
    }

    // --- 注入专属悬浮控制面板 ---
    function initUI() {
        if (document.getElementById('zhuoyu-fb-extractor')) return;
        
        // 读取保留的配置
        const savedUrl = GM_getValue('fb_server_url', 'https://zhuoyu.887780.xyz');
        const savedToken = GM_getValue('fb_api_token', '');

        const panel = document.createElement('div');
        panel.id = 'zhuoyu-fb-extractor';
        panel.innerHTML = `
            <div style="font-weight:bold;margin-bottom:8px;color:#333;font-size:14px;border-bottom:1px solid #eee;padding-bottom:5px;">
                🚀 一键推流系统 4.0
            </div>
            
            <div style="margin-bottom:8px;font-size:12px;">
                <label style="display:block;color:#666;margin-bottom:2px">服务器地址</label>
                <input id="fb-server-url" value="${savedUrl}" placeholder="https://zhuoyu.887780.xyz" style="width:100%;box-sizing:border-box;padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px">
            </div>

            <div style="margin-bottom:12px;font-size:12px;">
                <label style="display:block;color:#666;margin-bottom:2px">系统通信凭证</label>
                <input id="fb-api-token" value="${savedToken}" type="password" placeholder="粘贴从导入页面获取的 Token" style="width:100%;box-sizing:border-box;padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px">
            </div>

            <div style="margin-bottom:8px;background:#f9f9f9;padding:6px;border-radius:4px;border:1px solid #eee;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span>1. 答题数据(userAnswers)</span>
                    <span id="st-exe" style="color:red;font-weight:bold">等待刷新...</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span>2. 题目数据(solutions)</span>
                    <span id="st-sol" style="color:red;font-weight:bold">等待刷新...</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;">
                    <span>3. 统计数据(getMeta)</span>
                    <span id="st-meta" style="color:red;font-weight:bold">等待刷新...</span>
                </div>
            </div>
            
            <button id="btn-push-server" style="width:100%;padding:8px;background:#1890ff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;transition:all 0.3s;">⚡ 一键推送到 ai-leaming</button>
            <div style="font-size:10px;color:#999;text-align:center;margin-top:6px;line-height:1.4">在某一套试卷的【查看解析】页面点击推送</div>
        `;
        
        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', left: '20px', zIndex: '999999',
            background: '#fff', padding: '12px', borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.15)', width: '230px', 
            fontFamily: 'sans-serif', border: '1px solid #e8e8e8'
        });
        document.body.appendChild(panel);

        document.getElementById('btn-push-server').onclick = () => pushToServer('btn-push-server');
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
    if (document.readyState === "complete" || document.readyState === "interactive") {
        initUI();
    }
})();
