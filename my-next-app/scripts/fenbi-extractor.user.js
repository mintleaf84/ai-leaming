/* eslint-disable @typescript-eslint/no-this-alias */
// ==UserScript==
// @name         粉笔 JSON 全能嗅探提取器 (直推 ai-leaming 版)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  劫持 XHR/Fetch 捕获答题数据；凑齐即自动推送；新增练习记录批量静默导入
// @author       Antigravity
// @match        *://*.fenbi.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @connect      127.0.0.1
// @connect      zhuoyu.887780.xyz
// @connect      api.fenbi.com
// @connect      tiku.fenbi.com
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  console.log("🚀 [ai-leaming 抓取器] 核心嗅探引擎 6.0 已启动...");

  // 存储最新的原始 JSON 字符串
  const store = {
    exerciseJson: "",
    solutionsJson: "",
    statsJson: "",
  };

  // --- 推送去重：从 GM 存储加载已推送记录 ---
  const pushedSet = new Set(JSON.parse(GM_getValue("fb_pushed_keys", "[]")));

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
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
        }
        return "hash_" + Math.abs(hash).toString(36);
      }
    } catch (_e) {}
    return null;
  }

  function markAsPushed(key) {
    if (!key) return;
    pushedSet.add(key);
    // 只保留最近 2000 条记录，防止无限膨胀（批量导入历史时 200 条不够用）
    const arr = [...pushedSet];
    if (arr.length > 2000) arr.splice(0, arr.length - 2000);
    GM_setValue("fb_pushed_keys", JSON.stringify(arr));
  }

  function isAlreadyPushed() {
    const key = getCurrentExerciseKey();
    return key ? pushedSet.has(key) : false;
  }

  // --- 统一的数据分类与存储逻辑 ---
  function processInterceptedData(url, responseText) {
    let isUpdated = false;

    rememberSniffedUrl(url);

    if (url.includes("/combine/exercise/getSolution")) {
      store.exerciseJson = responseText;
      store._lastExerciseUrl = url; // 记住原始 URL 用于提取 key
      console.log("✅ [嗅探成功] 抓取到【答题数据】", url);
      isUpdated = true;
    }

    if (url.includes("/combine/static/solution")) {
      store.solutionsJson = responseText;
      console.log("✅ [嗅探成功] 抓取到【题目数据】", url);
      isUpdated = true;
    }

    if (url.includes("/combine/question/getMeta")) {
      store.statsJson = responseText;
      console.log("✅ [嗅探成功] 抓取到【统计数据】", url);
      isUpdated = true;
    }

    if (isUpdated) {
      updateUI();
      maybeAutoPush();
    }
  }

  // --- 自动推送：凑齐【答题+题目】且未推送过时，防抖后自动推 ---
  let autoPushTimer = null;
  let inflightPush = false;

  function maybeAutoPush() {
    if (!GM_getValue("fb_auto_push", true)) return;
    if (!store.exerciseJson || !store.solutionsJson) return;
    if (isAlreadyPushed() || inflightPush) return;
    const serverUrl = getServerUrl();
    const apiToken = getApiToken();
    if (!serverUrl || !apiToken) return; // 未配置则保持手动模式
    clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(() => pushCurrent(true), 1500);
  }

  // --- 核心武器 1：劫持 XMLHttpRequest（原型链劫持，最稳健模式） ---
  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._interceptedUrl = url; // 记住请求 URL
    return _origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const xhr = this;
    const url = xhr._interceptedUrl || "";

    if (typeof url === "string" && url.includes("tiku.fenbi.com")) {
      xhr.addEventListener("load", function () {
        try {
          let responseText = "";
          if (xhr.responseType === "" || xhr.responseType === "text") {
            responseText = xhr.responseText;
          } else if (xhr.responseType === "json") {
            responseText = JSON.stringify(xhr.response);
          }
          if (responseText) {
            processInterceptedData(url, responseText);
          }
        } catch (e) {
          console.error("[嗅探] XHR load 处理异常:", e);
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

    if (url && typeof url === "string" && url.includes("tiku.fenbi.com")) {
      const cloneRes = response.clone();
      cloneRes
        .text()
        .then((text) => {
          processInterceptedData(url, text);
        })
        .catch((e) => console.error("Fetch 获取文本失败", e));
    }
    return response;
  };

  // --- 已嗅探 URL 记录（帮用户发现"练习记录列表"接口） ---
  const sniffedUrls = [];
  function rememberSniffedUrl(url) {
    if (!url.includes("/combine/")) return;
    if (sniffedUrls.some((u) => u.split("?")[0] === url.split("?")[0])) return;
    sniffedUrls.push(url);
    if (sniffedUrls.length > 12) sniffedUrls.shift();
    const el = document.getElementById("fb-url-list");
    if (el) {
      // 用安全 DOM 构建，避免把 URL 拼进 innerHTML
      el.textContent = "";
      for (const u of sniffedUrls) {
        const item = document.createElement("div");
        item.textContent =
          u.split("?")[0].replace(/^https:\/\//, "") +
          (u.includes("?") ? "?…" : "");
        item.title = u;
        Object.assign(item.style, {
          padding: "2px 4px",
          fontSize: "10px",
          color: "#1890ff",
          cursor: "pointer",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
        });
        item.onclick = () => {
          const input = document.getElementById("fb-list-url");
          if (input) input.value = u;
        };
        el.appendChild(item);
      }
    }
  }

  function getServerUrl() {
    const el = document.getElementById("fb-server-url");
    return el ? el.value.trim() : GM_getValue("fb_server_url", "");
  }

  function getApiToken() {
    const el = document.getElementById("fb-api-token");
    return el ? el.value.trim() : GM_getValue("fb_api_token", "");
  }

  // --- 推送到服务器（auto=true 时静默，不弹窗不打断）；返回 Promise 便于批量串行 ---
  function pushToServer(btnId, auto, payload) {
    const data = payload || {
      exerciseJson: store.exerciseJson,
      solutionsJson: store.solutionsJson,
      statsJson: store.statsJson || "",
    };
    const pushKey = payload ? payload._key : getCurrentExerciseKey();

    if (!data.exerciseJson || !data.solutionsJson) {
      if (!auto)
        alert(
          '❌ 数据不完整！\n必须包含【答题数据】和【题目数据】才能推送。\n请确保打开了"查看解析"页面。',
        );
      return Promise.resolve(false);
    }

    if (!payload && isAlreadyPushed()) {
      if (!confirm("⚠️ 这套练习似乎已经推送过了。\n确定要重复推送吗？"))
        return Promise.resolve(false);
    }

    const serverUrl = getServerUrl();
    const apiToken = getApiToken();

    if (!serverUrl || !apiToken) {
      if (!auto) alert("❌ 请先填写服务器地址和通信凭证！");
      return Promise.resolve(false);
    }

    // 保存配置到油猴本地
    GM_setValue("fb_server_url", serverUrl);
    GM_setValue("fb_api_token", apiToken);

    const btn = document.getElementById(btnId);
    if (btn) {
      btn.innerText = "🚀 推送中...";
      btn.style.background = "#faad14";
      btn.disabled = true;
    }
    inflightPush = true;

    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${serverUrl.replace(/\/$/, "")}/api/import/fenbi-webhook`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        data: JSON.stringify({
          exerciseJson: data.exerciseJson,
          solutionsJson: data.solutionsJson,
          statsJson: data.statsJson,
        }),
        onload: function (response) {
          inflightPush = false;
          const ok =
            response.status === 200 &&
            (() => {
              try {
                return JSON.parse(response.responseText).success === true;
              } catch (_e) {
                return true;
              }
            })();
          if (ok) {
            markAsPushed(pushKey);
            if (btn) {
              btn.innerText = "✅ 导入成功！";
              btn.style.background = "#52c41a";
            }
            if (auto)
              console.log(
                "📤 [自动推送] 成功 key=" + (pushKey || "").substring(0, 12),
              );
          } else {
            if (btn) {
              btn.innerText = "❌ 导入失败";
              btn.style.background = "#ff4d4f";
            }
            if (!auto) {
              try {
                alert(
                  JSON.parse(response.responseText).message || "返回了失败标识",
                );
              } catch (_e) {
                alert("导入失败，HTTP " + response.status);
              }
            } else {
              console.error("📤 [自动推送] 失败:", response.responseText);
            }
          }
          updateUI();
          setTimeout(() => {
            if (btn) {
              btn.innerText = "⚡ 一键推送到 ai-leaming";
              btn.style.background = "#1890ff";
            }
          }, 4000);
          resolve(ok);
        },
        onerror: function (err) {
          inflightPush = false;
          if (btn) {
            btn.innerText = "❌ 网络连接失败";
            btn.style.background = "#ff4d4f";
          }
          console.error("跨域推送失败:", err);
          setTimeout(() => {
            if (btn) {
              btn.innerText = "⚡ 一键推送到 ai-leaming";
              btn.style.background = "#1890ff";
            }
          }, 3000);
          resolve(false);
        },
        ontimeout: function () {
          inflightPush = false;
          console.error("推送超时");
          resolve(false);
        },
      });
    });
  }

  function pushCurrent(auto) {
    pushToServer("btn-push-server", auto);
  }

  // ================= 批量历史导入 =================
  // 思路：用户在粉笔练习记录页嗅探到列表接口 URL 粘入；
  // 脚本用其登录态静默逐套拉 getSolution + static/solution，推 webhook。
  // 注意：服务端对同一套会产生新 session 与重复日志，故仅推送 pushedSet 中不存在的 key。

  const batch = { running: false, aborted: false };

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 20000,
        onload: (r) =>
          r.status >= 200 && r.status < 400
            ? resolve(r.responseText)
            : reject(new Error("HTTP " + r.status)),
        onerror: () => reject(new Error("网络错误")),
        ontimeout: () => reject(new Error("超时")),
      });
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // 深度搜索 JSON 中所有含 key 字段的对象（练习标识），容忍未知响应结构
  function collectExerciseItems(obj, out, depth) {
    depth = depth || 0;
    if (depth > 8 || !obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const v of obj) collectExerciseItems(v, out, depth + 1);
      return;
    }
    if (
      typeof obj.key === "string" &&
      obj.key.length > 0 &&
      (obj.id !== undefined || obj.questionTotalCount !== undefined || obj.name !== undefined)
    ) {
      if (!out.some((e) => e.key === obj.key)) {
        out.push({
          key: obj.key,
          name: obj.name || obj.exerciseName || obj.title || obj.key.substring(0, 12),
        });
      }
    }
    for (const k in obj) collectExerciseItems(obj[k], out, depth + 1);
  }

  function setBatchStatus(text) {
    const el = document.getElementById("fb-batch-status");
    if (el) el.innerText = text;
  }

  async function runBatchImport() {
    if (batch.running) return;
    const listUrl = (document.getElementById("fb-list-url").value || "").trim();
    if (!listUrl) {
      alert(
        "❌ 请先粘贴【练习记录列表】接口 URL。\n方法：打开粉笔的练习记录/答题记录页面，展开面板底部“已嗅探接口”，点击含 record/list 字样的条目自动填入。",
      );
      return;
    }
    const serverUrl = getServerUrl();
    const apiToken = getApiToken();
    if (!serverUrl || !apiToken) {
      alert("❌ 请先填写服务器地址和通信凭证！");
      return;
    }

    batch.running = true;
    batch.aborted = false;
    setBatchStatus("读取练习记录…");

    let items = [];
    try {
      const text = await gmGet(listUrl);
      collectExerciseItems(JSON.parse(text), items, 0);
    } catch (e) {
      setBatchStatus("❌ 列表读取失败: " + e.message);
      batch.running = false;
      return;
    }
    if (items.length === 0) {
      setBatchStatus("❌ 未在列表响应中找到带 key 的练习项");
      batch.running = false;
      return;
    }

    const apiBase =
      (store._lastExerciseUrl || "https://tiku.fenbi.com").split("/api/")[0] +
      "/api";
    const todo = items.filter((it) => !pushedSet.has(it.key));
    let okCount = 0,
      failCount = 0,
      skipCount = items.length - todo.length;

    for (let i = 0; i < todo.length; i++) {
      if (batch.aborted) break;
      const it = todo[i];
      setBatchStatus(`[${i + 1}/${todo.length}] ${it.name}…`);
      try {
        const exeUrl = `${apiBase}/combine/exercise/getSolution?key=${encodeURIComponent(it.key)}`;
        const exeJson = await gmGet(exeUrl);
        // static/solution 需要 exerciseId：优先取 getSolution 响应中的 id
        let exerciseId = null;
        try {
          const parsed = JSON.parse(exeJson);
          exerciseId = parsed && parsed.id;
        } catch (_e) {}
        let solJson = "";
        if (exerciseId !== null && exerciseId !== undefined) {
          solJson = await gmGet(
            `${apiBase}/combine/static/solution?exerciseId=${encodeURIComponent(exerciseId)}`,
          );
        } else {
          solJson = await gmGet(
            `${apiBase}/combine/static/solution?key=${encodeURIComponent(it.key)}`,
          );
        }
        const pushedOk = await pushToServer(null, true, {
          exerciseJson: exeJson,
          solutionsJson: solJson,
          statsJson: "",
          _key: it.key,
        });
        if (pushedOk) okCount++;
        else failCount++;
      } catch (e) {
        failCount++;
        console.error("[批量] 失败:", it.name, e.message);
      }
      setBatchStatus(
        `[${i + 1}/${todo.length}] 成功 ${okCount} / 失败 ${failCount}`,
      );
      await sleep(2500); // 限频，保护账号
    }

    batch.running = false;
    setBatchStatus(
      `✅ 完成：导入 ${okCount}，失败 ${failCount}，已存在跳过 ${skipCount}`,
    );
  }

  // --- 注入专属悬浮控制面板 ---
  function initUI() {
    if (document.getElementById("zhuoyu-fb-extractor")) return;

    // 读取保留的配置
    const savedUrl = GM_getValue("fb_server_url", "https://zhuoyu.887780.xyz");
    const savedToken = GM_getValue("fb_api_token", "");
    const isCollapsed = GM_getValue("fb_panel_collapsed", false);
    const autoPushOn = GM_getValue("fb_auto_push", true);

    // --- 折叠按钮（始终可见的小图标） ---
    const toggleBtn = document.createElement("div");
    toggleBtn.id = "zhuoyu-fb-toggle";
    toggleBtn.innerText = "🚀";
    Object.assign(toggleBtn.style, {
      position: "fixed",
      bottom: "20px",
      left: "20px",
      zIndex: "1000000",
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      background: "#1890ff",
      color: "#fff",
      fontSize: "18px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      transition: "transform 0.2s",
      userSelect: "none",
    });
    toggleBtn.title = "展开/收起推流面板";
    document.body.appendChild(toggleBtn);

    // --- 主面板 ---
    const panel = document.createElement("div");
    panel.id = "zhuoyu-fb-extractor";
    panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:5px;">
                <span style="font-weight:bold;color:#333;font-size:14px;">🚀 推流系统 6.0</span>
                <span id="fb-collapse-btn" style="cursor:pointer;font-size:16px;color:#999;line-height:1" title="收起面板">✕</span>
            </div>
            
            <div style="margin-bottom:8px;font-size:12px;">
                <label style="display:block;color:#666;margin-bottom:2px">服务器地址</label>
                <input id="fb-server-url" value="${savedUrl}" placeholder="https://zhuoyu.887780.xyz" style="width:100%;box-sizing:border-box;padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px">
            </div>

            <div style="margin-bottom:8px;font-size:12px;">
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

            <div style="display:flex;align-items:center;margin-bottom:8px;font-size:12px;color:#666;">
                <input type="checkbox" id="fb-auto-push" ${autoPushOn ? "checked" : ""} style="margin-right:6px">
                <label for="fb-auto-push">凑齐数据后自动推送（免点击）</label>
            </div>

            <div id="fb-dedup-hint" style="display:none;text-align:center;font-size:11px;color:#faad14;margin-bottom:6px;">⚠️ 该练习已推送过</div>
            
            <button id="btn-push-server" style="width:100%;padding:8px;background:#1890ff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;transition:all 0.3s;">⚡ 一键推送到 ai-leaming</button>
            <div style="font-size:10px;color:#999;text-align:center;margin-top:6px;line-height:1.4">在某一套试卷的【查看解析】页面点击推送（或开启自动推送）</div>

            <div style="margin-top:10px;border-top:1px dashed #ddd;padding-top:8px;">
                <div style="font-weight:bold;font-size:12px;color:#333;margin-bottom:4px">📦 批量导入练习记录</div>
                <input id="fb-list-url" placeholder="粘贴练习记录列表接口 URL" style="width:100%;box-sizing:border-box;padding:4px;border:1px solid #ddd;border-radius:4px;font-size:11px;margin-bottom:4px">
                <div style="font-size:10px;color:#999;margin-bottom:4px">已嗅探接口（点击填入上方，找含 record/list 的）：</div>
                <div id="fb-url-list" style="max-height:72px;overflow-y:auto;border:1px solid #eee;border-radius:4px;margin-bottom:6px;background:#fafafa"></div>
                <div style="display:flex;gap:6px">
                    <button id="btn-batch-run" style="flex:1;padding:6px;background:#722ed1;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold">▶ 开始批量导入</button>
                    <button id="btn-batch-stop" style="padding:6px 10px;background:#ff4d4f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">■</button>
                </div>
                <div id="fb-batch-status" style="font-size:11px;color:#666;margin-top:6px;word-break:break-all"></div>
            </div>
        `;

    Object.assign(panel.style, {
      position: "fixed",
      bottom: "20px",
      left: "64px",
      zIndex: "999999",
      background: "#fff",
      padding: "12px",
      borderRadius: "8px",
      boxShadow: "0 4px 15px rgba(0,0,0,0.15)",
      width: "250px",
      maxHeight: "80vh",
      overflowY: "auto",
      fontFamily: "sans-serif",
      border: "1px solid #e8e8e8",
      transition: "opacity 0.2s, transform 0.2s",
      transformOrigin: "bottom left",
    });
    document.body.appendChild(panel);

    // --- 折叠/展开逻辑 ---
    function setCollapsed(collapsed) {
      if (collapsed) {
        panel.style.opacity = "0";
        panel.style.transform = "scale(0.8)";
        panel.style.pointerEvents = "none";
        toggleBtn.style.transform = "scale(1)";
      } else {
        panel.style.opacity = "1";
        panel.style.transform = "scale(1)";
        panel.style.pointerEvents = "auto";
        toggleBtn.style.transform = "scale(0.85)";
      }
      GM_setValue("fb_panel_collapsed", collapsed);
    }

    toggleBtn.onclick = () => {
      const nowCollapsed = panel.style.pointerEvents === "none";
      setCollapsed(!nowCollapsed);
    };

    document.getElementById("fb-collapse-btn").onclick = () =>
      setCollapsed(true);

    // 初始状态
    setCollapsed(isCollapsed);

    // --- 事件绑定 ---
    document.getElementById("btn-push-server").onclick = () =>
      pushCurrent(false);

    document.getElementById("fb-auto-push").onchange = function () {
      GM_setValue("fb_auto_push", this.checked);
      if (this.checked) maybeAutoPush();
    };

    document.getElementById("btn-batch-run").onclick = runBatchImport;
    document.getElementById("btn-batch-stop").onclick = () => {
      batch.aborted = true;
    };

    // 输入框失焦时自动保存配置
    document
      .getElementById("fb-server-url")
      .addEventListener("change", function () {
        GM_setValue("fb_server_url", this.value.trim());
        console.log("💾 服务器地址已保存");
      });
    document
      .getElementById("fb-api-token")
      .addEventListener("change", function () {
        GM_setValue("fb_api_token", this.value.trim());
        console.log("💾 通信凭证已保存");
      });
  }

  // 更新面板状态灯
  function updateUI() {
    if (!document.getElementById("zhuoyu-fb-extractor")) return;

    const updateStatus = (id, checkStr) => {
      const el = document.getElementById(id);
      if (checkStr) {
        el.innerText = "✅ 已抓取";
        el.style.color = "#52c41a";
      }
    };

    updateStatus("st-exe", store.exerciseJson);
    updateStatus("st-sol", store.solutionsJson);
    updateStatus("st-meta", store.statsJson);

    // 更新去重提示
    const hint = document.getElementById("fb-dedup-hint");
    if (hint) {
      hint.style.display = isAlreadyPushed() ? "block" : "none";
    }

    // 同步折叠按钮的颜色（有数据时变绿）
    const toggle = document.getElementById("zhuoyu-fb-toggle");
    if (toggle && store.exerciseJson && store.solutionsJson) {
      toggle.style.background = isAlreadyPushed() ? "#52c41a" : "#faad14";
    }
  }

  window.addEventListener("load", initUI);
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    initUI();
  }
})();
