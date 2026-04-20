/* eslint-disable @typescript-eslint/no-this-alias */
// ==UserScript==
// @name         粉笔 JSON 全能嗅探提取器 (直推 ai-leaming 版)
// @namespace    http://tampermonkey.net/
// @version      5.0
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

    console.log("🚀 [ai-leaming 抓取器] 核心嗅探引擎 5.0 已启动...");

    // 存储最新的原始 JSON 字符串
    const store = {
        exerciseJson: '',
        solutionsJson: '',
        statsJson: ''
    };

    // --- 推送去重：从 GM 存储加载已推送记录 ---
    const pushedSet = new Set(JSON.parse(GM_getValue('fb_pushed_keys', '[]')));

    // 从 exerciseJson 中提取唯一标识（用 URL 中的 key 参数作为练习唯一 ID）
    function getCurrentExerciseKey() {
        try {
            // 尝试从抓取的 URL 中提取 key 参数
            if (store._lastExerciseUrl) {
                const match = store._lastExerciseUrl.match(/key=([^&]+)/);
                if (match) return match[1];
            }
            // 降级：用 exerciseJson 的哈希前16位
            if (store.exerciseJson) {
                let hash = 0;
                const str = store.exerciseJson.substring(0, 500); // 只取前500字符算哈希，够用
                for (let i = 0; i < str.length; i++) {
                    hash = ((hash << 5) - hash) + str.charCodeAt(i);
                    hash |= 0;
                }
                return 'hash_' + Math.abs(hash).toString(36);
            }
        } catch(_e) {}
        return null;
    }

    function markAsPushed(key) {
        if (!key) return;
        pushedSet.add(key);
        // 只保留最近 200 条记录，防止无限膨胀
        const arr = [...pushedSet];
        if (arr.length > 200) arr.splice(0, arr.length - 200);
        GM_setValue('fb_pushed_keys', JSON.stringify(arr));
    }

    function isAlreadyPushed() {
        const key = getCurrentExerciseKey();
        return key ? pushedSet.has(key) : false;
    }

    // --- 统一的数据分类与存储逻辑 ---
    function processInterceptedData(url, responseText) {
        let isUpdated = false;

        if (url.includes('/combine/exercise/getSolution')) {
            store.exerciseJson = responseText;
            store._lastExerciseUrl = url; // 记住原始 URL 用于提取 key
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

    // --- 核心武器 1：劫持 XMLHttpRequest（原型链劫持，最稳健模式） ---
    const _origOpen = XMLHttpRequest.prototype.open;
    const _origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._interceptedUrl = url; // 记住请求 URL
        return _origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        const xhr = this;
        const url = xhr._interceptedUrl || '';

        if (typeof url === 'string' && url.includes('tiku.fenbi.com')) {
            xhr.addEventListener('load', function() {
                try {
                    let responseText = '';
                    if (xhr.responseType === '' || xhr.responseType === 'text') {
                        responseText = xhr.responseText;
                    } else if (xhr.responseType === 'json') {
                        responseText = JSON.stringify(xhr.response);
                    }
                    if (responseText) {
                        processInterceptedData(url, responseText);
                    }
                } catch(e) {
                    console.error('[嗅探] XHR load 处理异常:', e);
                }
            });
        }

        return _origSend.apply(this, arguments);
    };

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
            alert('❌ 数据不完整！\n必须包含【答题数据】和【题目数据】才能推送。\n请确保打开了"查看解析"页面。');
            return;
        }

        // 推送去重检查
        if (isAlreadyPushed()) {
            if (!confirm('⚠️ 这套练习似乎已经推送过了。\n确定要重复推送吗？')) return;
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
                            // 推送成功，记录去重标识
                            markAsPushed(getCurrentExerciseKey());
                            updateUI(); // 刷新去重提示
                        } else {
                            btn.innerText = '❌ 导入失败';
                            btn.style.background = '#ff4d4f';
                            alert(res.message || '返回了失败标识');
                        }
                    } catch(_e) {
                        btn.innerText = '✅ 请求成功(解析异常)';
                        btn.style.background = '#52c41a';
                        markAsPushed(getCurrentExerciseKey());
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
        const isCollapsed = GM_getValue('fb_panel_collapsed', false);

        // --- 折叠按钮（始终可见的小图标） ---
        const toggleBtn = document.createElement('div');
        toggleBtn.id = 'zhuoyu-fb-toggle';
        toggleBtn.innerText = '🚀';
        Object.assign(toggleBtn.style, {
            position: 'fixed', bottom: '20px', left: '20px', zIndex: '1000000',
            width: '36px', height: '36px', borderRadius: '50%',
            background: '#1890ff', color: '#fff', fontSize: '18px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s',
            userSelect: 'none'
        });
        toggleBtn.title = '展开/收起推流面板';
        document.body.appendChild(toggleBtn);

        // --- 主面板 ---
        const panel = document.createElement('div');
        panel.id = 'zhuoyu-fb-extractor';
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:5px;">
                <span style="font-weight:bold;color:#333;font-size:14px;">🚀 推流系统 5.0</span>
                <span id="fb-collapse-btn" style="cursor:pointer;font-size:16px;color:#999;line-height:1" title="收起面板">✕</span>
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

            <div id="fb-dedup-hint" style="display:none;text-align:center;font-size:11px;color:#faad14;margin-bottom:6px;">⚠️ 该练习已推送过</div>
            
            <button id="btn-push-server" style="width:100%;padding:8px;background:#1890ff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;transition:all 0.3s;">⚡ 一键推送到 ai-leaming</button>
            <div style="font-size:10px;color:#999;text-align:center;margin-top:6px;line-height:1.4">在某一套试卷的【查看解析】页面点击推送</div>
        `;
        
        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', left: '64px', zIndex: '999999',
            background: '#fff', padding: '12px', borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.15)', width: '230px', 
            fontFamily: 'sans-serif', border: '1px solid #e8e8e8',
            transition: 'opacity 0.2s, transform 0.2s',
            transformOrigin: 'bottom left'
        });
        document.body.appendChild(panel);

        // --- 折叠/展开逻辑 ---
        function setCollapsed(collapsed) {
            if (collapsed) {
                panel.style.opacity = '0';
                panel.style.transform = 'scale(0.8)';
                panel.style.pointerEvents = 'none';
                toggleBtn.style.transform = 'scale(1)';
            } else {
                panel.style.opacity = '1';
                panel.style.transform = 'scale(1)';
                panel.style.pointerEvents = 'auto';
                toggleBtn.style.transform = 'scale(0.85)';
            }
            GM_setValue('fb_panel_collapsed', collapsed);
        }

        toggleBtn.onclick = () => {
            const nowCollapsed = panel.style.pointerEvents === 'none';
            setCollapsed(!nowCollapsed);
        };

        document.getElementById('fb-collapse-btn').onclick = () => setCollapsed(true);

        // 初始状态
        setCollapsed(isCollapsed);

        // --- 事件绑定 ---
        document.getElementById('btn-push-server').onclick = () => pushToServer('btn-push-server');

        // 输入框失焦时自动保存配置
        document.getElementById('fb-server-url').addEventListener('change', function() {
            GM_setValue('fb_server_url', this.value.trim());
            console.log('💾 服务器地址已保存');
        });
        document.getElementById('fb-api-token').addEventListener('change', function() {
            GM_setValue('fb_api_token', this.value.trim());
            console.log('💾 通信凭证已保存');
        });
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

        // 更新去重提示
        const hint = document.getElementById('fb-dedup-hint');
        if (hint) {
            hint.style.display = isAlreadyPushed() ? 'block' : 'none';
        }

        // 同步折叠按钮的颜色（有数据时变绿）
        const toggle = document.getElementById('zhuoyu-fb-toggle');
        if (toggle && store.exerciseJson && store.solutionsJson) {
            toggle.style.background = isAlreadyPushed() ? '#52c41a' : '#faad14';
        }
    }

    window.addEventListener('load', initUI);
    if (document.readyState === "complete" || document.readyState === "interactive") {
        initUI();
    }
})();
