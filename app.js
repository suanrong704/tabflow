// DeepClaude App v2 - Full Features
const $ = id => document.getElementById(id);
const API_URL = "https://api.deepseek.com/v1/chat/completions";

const state = {
  currentConvId: null,
  mode: "flash",       // flash | pro
  searchEnabled: false,
  isGenerating: false,
  sidebarVisible: true,
  abortController: null,
  attachedFile: null,  // { name, content }
};

const USER_AVATAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>';
const AI_AVATAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4d6bfe" stroke-width="2"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';

// ===== Theme =====
function applyTheme() {
  const saved = localStorage.getItem("deepclaude_theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
applyTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

// ===== Toast =====
function showToast(msg, ms = 2000) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), ms);
}

// ===== API Key =====
function getApiKey() { return localStorage.getItem("deepclaude_api_key") || ""; }
function setApiKey(k) { localStorage.setItem("deepclaude_api_key", k); }

// ===== Helpers =====
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ===== Web Search =====
async function webSearch(query) {
  try {
    const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    const data = await resp.json();
    let results = "";
    if (data.AbstractText) results += data.AbstractText + "\n\n";
    if (data.RelatedTopics?.length) {
      results += "相关结果:\n";
      data.RelatedTopics.slice(0, 5).forEach(t => { if (t.Text) results += `- ${t.Text}\n`; });
    }
    return results.trim() || null;
  } catch (e) { return null; }
}

// ===== Sidebar =====
let allConvs = [];
let convSearchTerm = "";

function renderSidebar() {
  storage.getConversations().then(convs => {
    allConvs = convs;
    const filtered = convSearchTerm
      ? convs.filter(c => c.title.toLowerCase().includes(convSearchTerm.toLowerCase()))
      : convs;
    const list = $("convList");
    list.innerHTML = filtered.map(c => `
      <div class="conv-item ${c.id === state.currentConvId ? 'active' : ''}" data-id="${c.id}">
        <span class="conv-title">${escHtml(c.title)}</span>
        <span class="conv-actions">
          <button data-action="rename" data-id="${c.id}" title="重命名">✎</button>
          <button data-action="delete" data-id="${c.id}" title="删除">✕</button>
        </span>
      </div>
    `).join("");
    list.querySelectorAll(".conv-item").forEach(item => {
      item.addEventListener("click", e => {
        if (e.target.closest("[data-action]")) return;
        switchConversation(item.dataset.id);
      });
    });
    list.querySelectorAll("[data-action=rename]").forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); renameConversation(btn.dataset.id); });
    });
    list.querySelectorAll("[data-action=delete]").forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); deleteConversation(btn.dataset.id); });
    });
    $("convCount").textContent = filtered.length;
  });
}

async function switchConversation(id) {
  state.currentConvId = id;
  await renderMessages();
  renderSidebar();
  $("welcome").style.display = "none";
  scrollToBottom();
}

async function newConversation() {
  const conv = await storage.createConversation();
  state.currentConvId = conv.id;
  await renderMessages();
  renderSidebar();
  $("welcome").style.display = "flex";
}

async function renameConversation(id) {
  const newTitle = prompt("输入新名称：");
  if (!newTitle?.trim()) return;
  await storage.updateConversation(id, { title: newTitle.trim() });
  renderSidebar();
}

async function deleteConversation(id) {
  if (!confirm("确定删除该对话？")) return;
  await storage.deleteConversation(id);
  if (state.currentConvId === id) {
    const convs = await storage.getConversations();
    state.currentConvId = convs.length > 0 ? convs[0].id : null;
    if (state.currentConvId) await renderMessages();
    else { $("chatMessages").innerHTML = ""; $("welcome").style.display = "flex"; }
  }
  renderSidebar();
}

// ===== Messages Render =====
function renderMarkdown(text) {
  if (!text) return "";
  return marked.parse(text) || "";
}

function highlightCode() {
  document.querySelectorAll(".msg-content pre code").forEach(block => {
    try { hljs.highlightElement(block); } catch (e) {}
  });
}

function addCopyButtons() {
  document.querySelectorAll(".msg-content pre").forEach(pre => {
    if (pre.querySelector(".copy-btn")) return;
    const code = pre.querySelector("code");
    const lang = code?.className?.replace("language-", "") || "";
    if (lang) {
      const label = document.createElement("span");
      label.className = "code-lang"; label.textContent = lang;
      pre.appendChild(label);
    }
    const btn = document.createElement("button");
    btn.className = "copy-btn"; btn.textContent = "复制";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(code?.textContent || "").then(() => {
        btn.textContent = "已复制!"; setTimeout(() => btn.textContent = "复制", 2000);
      });
    });
    pre.style.position = "relative";
    pre.appendChild(btn);
  });
}

async function renderMessages() {
  if (!state.currentConvId) { $("chatMessages").innerHTML = ""; return; }
  const msgs = await storage.getMessages(state.currentConvId);
  const container = $("chatMessages");
  container.innerHTML = msgs.map(m => {
    const isUser = m.role === "user";
    const editedMark = m.editHistory?.length ? `<span class="msg-edited">(已编辑 ${m.editHistory.length} 次)</span>` : "";
    let content;
    if (isUser) {
      content = escHtml(m.content);
    } else {
      content = renderMessageParts(m);
    }
    return `<div class="message ${isUser ? 'user' : 'assistant'}" data-id="${m.id}">
      <div class="avatar">${isUser ? ${USER_AVATAR} : ${AI_AVATAR}}</div>
      <div class="msg-content">${content}${editedMark}</div>
      <div class="msg-actions">
        <button data-action="edit" data-id="${m.id}">✎ 编辑</button>
        ${!isUser ? `<button data-action="retry" data-id="${m.id}">⟳ 重试</button>` : ''}
        <button data-action="deleteAfter" data-id="${m.id}">✕ 删除后续</button>
      </div>
    </div>`;
  }).join("");
  highlightCode();
  addCopyButtons();
  container.querySelectorAll("[data-action=edit]").forEach(btn => btn.addEventListener("click", () => startEdit(btn.dataset.id)));
  container.querySelectorAll("[data-action=retry]").forEach(btn => btn.addEventListener("click", () => retryMessage(btn.dataset.id)));
  container.querySelectorAll("[data-action=deleteAfter]").forEach(btn => btn.addEventListener("click", () => deleteAfter(btn.dataset.id)));
}

function renderMessageParts(msg) {
  if (msg.reasoning) {
    return `<details class="reasoning-block">
      <summary>🧠 推理过程</summary>
      <div class="reasoning-content">${renderMarkdown(msg.reasoning)}</div>
    </details>
    <div class="answer-content">${renderMarkdown(msg.content)}</div>`;
  }
  return renderMarkdown(msg.content);
}

function scrollToBottom() {
  requestAnimationFrame(() => $("chatArea").scrollTo({ top: $("chatArea").scrollHeight, behavior: "smooth" }));
}

// ===== Message Edit =====
async function startEdit(msgId) {
  const msgEl = document.querySelector(`.message[data-id="${msgId}"]`);
  if (!msgEl || state.isGenerating) return;
  const contentEl = msgEl.querySelector(".msg-content");
  const currentText = contentEl.firstChild?.textContent || "";
  const textarea = document.createElement("textarea");
  textarea.className = "msg-edit-area"; textarea.value = currentText;
  contentEl.innerHTML = ""; contentEl.appendChild(textarea); textarea.focus();
  const btns = document.createElement("div"); btns.className = "msg-edit-buttons";
  btns.innerHTML = `<button class="btn-save">保存</button><button class="btn-cancel">取消</button>`;
  contentEl.appendChild(btns);
  btns.querySelector(".btn-save").addEventListener("click", async () => {
    const nc = textarea.value.trim();
    if (!nc) { showToast("内容不能为空"); return; }
    await storage.editMessage(msgId, nc);
    await renderMessages();
    if (msgEl.classList.contains("user")) { await deleteAfter(msgId); sendMessage(nc); }
    scrollToBottom();
  });
  btns.querySelector(".btn-cancel").addEventListener("click", renderMessages);
}

async function retryMessage(msgId) {
  const msgs = await storage.getMessages(state.currentConvId);
  const idx = msgs.findIndex(m => m.id === msgId);
  if (idx < 1 || msgs[idx - 1].role !== "user") return;
  await deleteAfter(msgId);
  sendMessage(msgs[idx - 1].content);
}

async function deleteAfter(msgId) {
  await storage.deleteAfterMessage(msgId);
  await renderMessages();
}

// ===== Streaming Send =====
async function sendMessage(text) {
  if (state.isGenerating || !text.trim()) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast("请先在左侧 API 设置中填入 DeepSeek API Key");
    $("apiModal").classList.add("show"); $("apiKeyInput").focus();
    return;
  }

  $("welcome").style.display = "none";
  state.isGenerating = true; $("btnStop").classList.add("visible");
  $("btnSend").disabled = true;
  state.abortController = new AbortController();

  let finalText = text;
  if (state.attachedFile) {
    finalText = `[文件: ${state.attachedFile.name}]\n\n${state.attachedFile.content}\n\n[用户问题]\n${finalText}`;
    clearAttachment();
  }
  if (state.searchEnabled) {
    $("btnSend").textContent = "🔍"; showToast("搜索中...", 1000);
    const sr = await webSearch(text);
    if (sr) finalText = `[联网搜索结果]\n${sr}\n\n[用户问题]\n${text}`;
  }

  const userMsg = await storage.addMessage(state.currentConvId, "user", text);
  await renderMessages();
  scrollToBottom();

  const assistantMsg = await storage.addMessage(state.currentConvId, "assistant", "思考中...");
  await renderMessages();
  scrollToBottom();

  const allMsgs = await storage.getMessages(state.currentConvId);
  const apiMsgs = allMsgs.filter(m => m.id !== assistantMsg.id).map(m => ({ role: m.role, content: m.content }));
  const model = state.mode === "pro" ? "deepseek-reasoner" : "deepseek-chat";

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: apiMsgs, stream: true }),
      signal: state.abortController.signal
    });
    if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "", fullReasoning = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.reasoning_content) fullReasoning += delta.reasoning_content;
          if (delta.content) fullContent += delta.content;
          // Update UI in real-time
          await storage.editMessage(assistantMsg.id, fullContent);
          if (fullReasoning) {
            const msg = await storage.getMessages(state.currentConvId);
            const am = msg.find(m => m.id === assistantMsg.id);
            if (am) { am.reasoning = fullReasoning; }
          }
          updateAssistantMessage(assistantMsg.id, fullContent, fullReasoning);
        } catch (e) {}
      }
    }
    await storage.editMessage(assistantMsg.id, fullContent);
    renderMessages().then(() => { addCopyButtons(); scrollToBottom(); });
    const count = await storage.getMessageCount(state.currentConvId);
    if (count <= 3) {
      const title = text.slice(0, 30) + (text.length > 30 ? "..." : "");
      await storage.updateConversation(state.currentConvId, { title });
      renderSidebar();
    }
  } catch (err) {
    if (err.name === "AbortError") {
      await storage.editMessage(assistantMsg.id, "(已停止生成)");
    } else {
      await storage.editMessage(assistantMsg.id, `❌ ${err.message}`);
    }
    await renderMessages();
  }
  state.isGenerating = false; state.abortController = null; $("btnStop").classList.remove("visible");
  $("btnSend").disabled = false;
  $("btnSend").textContent = "➤";
}

function updateAssistantMessage(msgId, content, reasoning) {
  const el = document.querySelector(`.message[data-id="${msgId}"] .msg-content`);
  if (!el) return;
  let html = "";
  if (reasoning) {
    html += `<details class="reasoning-block" open>
      <summary>🧠 推理过程</summary>
      <div class="reasoning-content">${renderMarkdown(reasoning)}</div>
    </details>`;
  }
  html += renderMarkdown(content);
  el.innerHTML = html;
  highlightCode();
  addCopyButtons();
  scrollToBottom();
}

// ===== File Attachment =====
function clearAttachment() {
  state.attachedFile = null;
  $("filePreview").style.display = "none";
}

// ===== Voice Input =====
let recognition = null;
function startVoice() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("你的浏览器不支持语音输入");
    return;
  }
  if (recognition) recognition.abort();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = "zh-CN";
  recognition.interimResults = false;
  recognition.continuous = false;
  $("btnVoice").classList.add("listening");
  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const input = $("chatInput");
    input.value = input.value ? input.value + " " + transcript : transcript;
    input.dispatchEvent(new Event("input"));
  };
  recognition.onerror = () => showToast("语音识别失败");
  recognition.onend = () => $("btnVoice").classList.remove("listening");
  recognition.start();
}

// ===== Init =====
function init() {
  $("btnToggleSidebar").addEventListener("click", () => {
    state.sidebarVisible = !state.sidebarVisible;
    $("sidebar").classList.toggle("collapsed", !state.sidebarVisible);
  });
  $("btnNewChat").addEventListener("click", newConversation);

  // Mode toggle
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
    });
  });

  // Search toggle
  $("btnSearchToggle").addEventListener("click", () => {
    state.searchEnabled = !state.searchEnabled;
    $("btnSearchToggle").classList.toggle("active", state.searchEnabled);
  });

  // Voice input
  $("btnVoice").addEventListener("click", startVoice);

  // Conversation search
  $("convSearchInput").addEventListener("input", e => {
    convSearchTerm = e.target.value.trim();
    renderSidebar();
  });

  // Send
  $("btnSend").addEventListener("click", () => {
    sendMessage($("chatInput").value);
    $("chatInput").value = "";
    $("chatInput").style.height = "auto";
  });
  $("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage($("chatInput").value);
      $("chatInput").value = "";
      $("chatInput").style.height = "auto";
    }
  });
  $("chatInput").addEventListener("input", () => {
    const el = $("chatInput");
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
    $("btnSend").disabled = !el.value.trim() || state.isGenerating;
  });

  // Stop generation
  $("btnStop").addEventListener("click", () => {
    if (state.abortController) state.abortController.abort();
  });

  // File upload
  $("btnFileUpload").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (text.length > 100000) { showToast("文件太大（最大10万字符）"); return; }
      state.attachedFile = { name: file.name, content: text.slice(0, 50000) };
      $("fileName").textContent = file.name;
      $("filePreview").style.display = "flex";
    } catch (err) {
      showToast("无法读取文件（仅支持文本文件）");
    }
  });
  $("btnRemoveFile").addEventListener("click", clearAttachment);

  // API settings
  $("btnApiSettings").addEventListener("click", () => {
    $("apiKeyInput").value = getApiKey();
    $("apiModal").classList.add("show"); $("apiKeyInput").focus();
  });
  $("btnApiCancel").addEventListener("click", () => $("apiModal").classList.remove("show"));
  $("apiModal").addEventListener("click", e => { if (e.target === $("apiModal")) $("apiModal").classList.remove("show"); });
  $("btnApiSave").addEventListener("click", () => {
    const key = $("apiKeyInput").value.trim();
    if (!key) { showToast("请输入 API Key"); return; }
    setApiKey(key); $("apiModal").classList.remove("show");
    showToast("✅ API Key 已保存");
  });
  $("apiKeyInput").addEventListener("keydown", e => { if (e.key === "Enter") $("btnApiSave").click(); });

  // Clear all
  $("btnClearAll").addEventListener("click", async () => {
    if (!confirm("确定删除所有对话记录？")) return;
    const convs = await storage.getConversations();
    for (const c of convs) await storage.deleteConversation(c.id);
    state.currentConvId = null;
    $("chatMessages").innerHTML = ""; $("welcome").style.display = "flex";
    renderSidebar();
    showToast("已清除所有对话");
  });

  // Initial load
  (async () => {
    await storage.ready;
    const convs = await storage.getConversations();
    if (convs.length > 0) {
      state.currentConvId = convs[0].id;
      await renderMessages();
      $("welcome").style.display = "none";
      scrollToBottom();
    }
    renderSidebar();
  })();
}

marked.setOptions({ breaks: true, gfm: true });
document.addEventListener("DOMContentLoaded", init);

