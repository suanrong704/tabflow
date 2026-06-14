// DeepClaude App - DeepSeek-style AI Chat
const $ = id => document.getElementById(id);
const API_URL = "https://api.deepseek.com/v1/chat/completions";

const state = {
  currentConvId: null,
  deepThink: false,
  webSearch: false,
  isGenerating: false,
  sidebarVisible: true,
  abortController: null,
  attachedFile: null,
};

// ===== Theme =====
function getTheme() { return localStorage.getItem("deepclaude_theme") || "auto"; }
function setTheme(t) { localStorage.setItem("deepclaude_theme", t); applyTheme(); }

function applyTheme() {
  const t = getTheme();
  if (t === "light" || t === "dark") {
    document.documentElement.setAttribute("data-theme", t);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  // toggle icons
  const sun = document.querySelector(".icon-sun");
  const moon = document.querySelector(".icon-moon");
  if (sun && moon) {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    sun.style.display = isDark ? "" : "none";
    moon.style.display = isDark ? "none" : "";
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
function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function scrollToBottom() {
  const area = $("chatArea");
  requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
}

function getDateGroup(ts) {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86400000);
  if (d >= today) return "\u4eca\u5929";
  if (d >= yesterday) return "\u6628\u5929";
  const weekAgo = new Date(today - 7 * 86400000);
  if (d >= weekAgo) return "\u8fd1 7 \u5929";
  const monthAgo = new Date(today - 30 * 86400000);
  if (d >= monthAgo) return "\u8fd1 30 \u5929";
  return "\u66f4\u65e9";
}

// ===== Web Search =====
async function webSearch(query) {
  try {
    const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    const data = await resp.json();
    let results = "";
    if (data.AbstractText) results += data.AbstractText + "\n\n";
    if (data.RelatedTopics?.length) {
      results += "\u76f8\u5173\u7ed3\u679c:\n";
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
    
    // Group by date
    const groups = {};
    filtered.forEach(c => {
      const g = getDateGroup(c.updatedAt);
      if (!groups[g]) groups[g] = [];
      groups[g].push(c);
    });
    const groupOrder = ["\u4eca\u5929", "\u6628\u5929", "\u8fd1 7 \u5929", "\u8fd1 30 \u5929", "\u66f4\u65e9"];
    
    const list = $("convList");
    let html = "";
    groupOrder.forEach(g => {
      if (!groups[g]?.length) return;
      html += `<div class="conv-date-group">${g}</div>`;
      groups[g].forEach(c => {
        html += `<div class="conv-item ${c.id === state.currentConvId ? 'active' : ''}" data-id="${c.id}">
          <span class="conv-title">${escHtml(c.title)}</span>
          <span class="conv-actions">
            <button data-action="rename" data-id="${c.id}" title="\u91cd\u547d\u540d">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button data-action="delete" data-id="${c.id}" title="\u5220\u9664">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </span>
        </div>`;
      });
    });
    list.innerHTML = html;
    
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
  const newTitle = prompt("\u8f93\u5165\u65b0\u540d\u79f0\uff1a");
  if (!newTitle?.trim()) return;
  await storage.updateConversation(id, { title: newTitle.trim() });
  renderSidebar();
}

async function deleteConversation(id) {
  if (!confirm("\u786e\u5b9a\u5220\u9664\u8be5\u5bf9\u8bdd\uff1f")) return;
  await storage.deleteConversation(id);
  if (state.currentConvId === id) {
    const convs = await storage.getConversations();
    state.currentConvId = convs.length > 0 ? convs[0].id : null;
    if (state.currentConvId) await renderMessages();
    else { $("chatMessages").innerHTML = ""; $("welcome").style.display = "flex"; }
  }
  renderSidebar();
}

// ===== Messages =====
function renderMarkdown(text) {
  if (!text) return "";
  return marked.parse(text) || "";
}

function highlightCode() {
  document.querySelectorAll(".message-body pre code").forEach(block => {
    hljs.highlightElement(block);
  });
}

function createMessageEl(msg) {
  const isUser = msg.role === "user";
  let bodyHtml = "";
  
  // Check for reasoning content (stored as special prefix)
  let reasoning = null;
  let answer = msg.content;
  if (!isUser && msg.content.startsWith("__REASONING__")) {
    const parts = msg.content.split("__ANSWER__");
    if (parts.length === 2) {
      reasoning = parts[0].replace("__REASONING__", "");
      answer = parts[1];
    }
  }
  
  if (reasoning) {
    bodyHtml += `<details class="reasoning-block" open>
      <summary>\ud83e\udde0 \u6df1\u5ea6\u601d\u8003\u8fc7\u7a0b</summary>
      <div class="reasoning-content">${renderMarkdown(reasoning)}</div>
    </details>`;
  }
  bodyHtml += renderMarkdown(answer);
  
  return `<div class="message ${isUser ? 'user' : 'assistant'}" data-id="${msg.id}">
    <div class="message-avatar">${isUser
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="16" r="6"/><circle cx="20" cy="10" r="4"/><circle cx="20" cy="22" r="3"/><line x1="15" y1="14" x2="18" y2="12"/><line x1="15" y1="18" x2="18" y2="20"/></svg>'
    }</div>
    <div class="message-body">${bodyHtml}</div>
  </div>`;
}

async function renderMessages() {
  if (!state.currentConvId) {
    $("chatMessages").innerHTML = "";
    $("welcome").style.display = "flex";
    return;
  }
  const msgs = await storage.getMessages(state.currentConvId);
  $("chatMessages").innerHTML = msgs.map(createMessageEl).join("");
  highlightCode();
}

function clearAttachment() {
  state.attachedFile = null;
  $("filePreview").style.display = "none";
  $("fileInput").value = "";
}

// ===== Chat / API =====
async function sendMessage(userText) {
  if (!userText.trim() || state.isGenerating) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast("\u8bf7\u5148\u5728\u4fa7\u8fb9\u680f\u8bbe\u7f6e API Key");
    return;
  }

  // Create conversation if needed
  if (!state.currentConvId) {
    const conv = await storage.createConversation();
    state.currentConvId = conv.id;
    renderSidebar();
  }

  $("welcome").style.display = "none";

  // Build user message content
  let userContent = userText.trim();
  if (state.attachedFile) {
    userContent = `[\u9644\u4ef6: ${state.attachedFile.name}]\n${state.attachedFile.content}\n\n---\n${userContent}`;
  }
  clearAttachment();

  // Save user message
  await storage.addMessage(state.currentConvId, "user", userContent);
  await renderMessages();
  scrollToBottom();

  // Auto-title
  const conv = await storage.getConversation(state.currentConvId);
  if (conv && conv.title === "\u65b0\u5bf9\u8bdd") {
    const t = userText.trim().slice(0, 30);
    await storage.updateConversation(state.currentConvId, { title: t || "\u65b0\u5bf9\u8bdd" });
    renderSidebar();
  }

  // Build messages for API
  const allMsgs = await storage.getMessages(state.currentConvId);
  const apiMessages = [];

  // System prompt
  let systemPrompt = "You are DeepClaude, a helpful AI assistant.";
  if (state.deepThink) {
    systemPrompt += " Provide detailed reasoning before your final answer.";
  }

  // Add web search results
  if (state.webSearch) {
    const searchResults = await webSearch(userText.trim());
    if (searchResults) {
      systemPrompt += `\n\nCurrent web search results:\n${searchResults}`;
    }
  }

  apiMessages.push({ role: "system", content: systemPrompt });
  
  // Add conversation history (last 20 messages)
  const recentMsgs = allMsgs.slice(-20);
  recentMsgs.forEach(m => {
    let content = m.content;
    // Strip reasoning markers for API
    if (m.role === "assistant" && content.startsWith("__REASONING__")) {
      const parts = content.split("__ANSWER__");
      content = parts.length === 2 ? parts[1] : content;
    }
    apiMessages.push({ role: m.role, content });
  });

  // Remove the last user message (we add it below in the API call)
  // Actually the user message is already the last one, so this is fine

  // Set generating state
  state.isGenerating = true;
  $("btnSend").disabled = true;
  $("btnStop").classList.add("visible");
  state.abortController = new AbortController();

  // Create AI message placeholder
  const aiMsgId = crypto.randomUUID();
  const messagesEl = $("chatMessages");
  const placeholder = document.createElement("div");
  placeholder.className = "message assistant";
  placeholder.innerHTML = `<div class="message-avatar">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="16" r="6"/><circle cx="20" cy="10" r="4"/><circle cx="20" cy="22" r="3"/><line x1="15" y1="14" x2="18" y2="12"/><line x1="15" y1="18" x2="18" y2="20"/></svg>
  </div>
  <div class="message-body"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(placeholder);
  scrollToBottom();

  try {
    const model = state.deepThink ? "deepseek-v4-pro" : "deepseek-v4-flash";
    
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        temperature: state.deepThink ? 0.1 : 0.7,
        max_tokens: state.deepThink ? 8192 : 4096,
      }),
      signal: state.abortController.signal,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API \u9519\u8bef (${resp.status}): ${err}`);
    }

    // Parse SSE stream
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let reasoningContent = "";
    let buffer = "";
    const bodyEl = placeholder.querySelector(".message-body");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // Handle reasoning_content (for reasoner model)
          if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content;
          }
          if (delta.content) {
            fullContent += delta.content;
          }

          // Render
          let displayHtml = "";
          if (reasoningContent) {
            displayHtml += `<details class="reasoning-block" open>
              <summary>\ud83e\udde0 \u6df1\u5ea6\u601d\u8003\u8fc7\u7a0b</summary>
              <div class="reasoning-content">${renderMarkdown(reasoningContent)}</div>
            </details>`;
          }
          displayHtml += renderMarkdown(fullContent);
          bodyEl.innerHTML = displayHtml;
          highlightCode();
          scrollToBottom();
        } catch (e) { /* skip malformed JSON */ }
      }
    }

    // Save AI message
    const finalContent = reasoningContent
      ? `__REASONING__${reasoningContent}__ANSWER__${fullContent}`
      : fullContent;
    await storage.addMessage(state.currentConvId, "assistant", finalContent, model);

  } catch (err) {
    if (err.name === "AbortError") {
      if (fullContent || reasoningContent) {
        const finalContent = reasoningContent
          ? `__REASONING__${reasoningContent}__ANSWER__${fullContent}`
          : fullContent;
        await storage.addMessage(state.currentConvId, "assistant", finalContent, model);
      }
      placeholder.remove();
    } else {
      bodyEl.innerHTML = `<span style="color:var(--danger)">\u9519\u8bef: ${escHtml(err.message)}</span>`;
    }
  } finally {
    state.isGenerating = false;
    state.abortController = null;
    $("btnSend").disabled = false;
    $("btnStop").classList.remove("visible");
    await renderMessages();
    scrollToBottom();
  }
}

// ===== Voice Input =====
let recognition = null;

function startVoice() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("\u4f60\u7684\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u8bed\u97f3\u8f93\u5165\uff08\u8bf7\u4f7f\u7528 Chrome\uff09");
    return;
  }
  if (recognition) {
    recognition.abort();
    recognition = null;
    removeVoiceRing();
    $("btnVoice").title = "\u8bed\u97f3\u8f93\u5165";
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = "zh-CN";
  recognition.interimResults = true;
  recognition.continuous = false;

  const btn = $("btnVoice");
  btn.title = "\u5f55\u97f3\u4e2d\uff0c\u70b9\u51fb\u505c\u6b62";
  addVoiceRing(btn);
  btn.style.color = "var(--danger)";

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
    const input = $("chatInput");
    input.value = transcript;
    input.dispatchEvent(new Event("input"));
  };

  recognition.onerror = (e) => {
    showToast("\u8bed\u97f3\u8bc6\u522b\u5931\u8d25: " + e.error);
    cleanupVoice();
  };

  recognition.onend = () => cleanupVoice();

  recognition.onaudiostart = () => { btn.style.boxShadow = "0 0 0 3px rgba(231,76,60,0.3)"; };
  recognition.onaudioend = () => { btn.style.boxShadow = ""; };
  recognition.onspeechstart = () => { btn.style.boxShadow = "0 0 0 3px rgba(231,76,60,0.5)"; };
  recognition.onspeechend = () => { btn.style.boxShadow = "0 0 0 3px rgba(231,76,60,0.3)"; };

  recognition.start();
}

function addVoiceRing(btn) {
  removeVoiceRing();
  const ring = document.createElement("div");
  ring.className = "voice-ring";
  ring.id = "voiceRing";
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) + 8;
  ring.style.cssText = `
    width: ${size}px; height: ${size}px;
    left: ${rect.left + rect.width / 2 - size / 2}px;
    top: ${rect.top + rect.height / 2 - size / 2}px;
    position: fixed; z-index: 10;
  `;
  document.body.appendChild(ring);
}

function removeVoiceRing() {
  const ring = document.getElementById("voiceRing");
  if (ring) ring.remove();
}

function cleanupVoice() {
  removeVoiceRing();
  const btn = $("btnVoice");
  btn.title = "\u8bed\u97f3\u8f93\u5165";
  btn.style.color = "";
  btn.style.boxShadow = "";
  recognition = null;
}

// ===== Init =====
function init() {
  // Sidebar toggle
  $("btnToggleSidebar").addEventListener("click", () => {
    state.sidebarVisible = !state.sidebarVisible;
    $("sidebar").classList.toggle("collapsed", !state.sidebarVisible);
  });
  $("btnCloseSidebar").addEventListener("click", () => {
    state.sidebarVisible = false;
    $("sidebar").classList.add("collapsed");
  });

  // New chat
  $("btnNewChat").addEventListener("click", newConversation);

  // Deep Think toggle
  $("btnDeepThink").addEventListener("click", () => {
    state.deepThink = !state.deepThink;
    $("btnDeepThink").classList.toggle("active", state.deepThink);
  });

  // Web search toggle
  $("btnWebSearch").addEventListener("click", () => {
    state.webSearch = !state.webSearch;
    $("btnWebSearch").classList.toggle("active", state.webSearch);
  });

  // Theme toggle
  $("btnThemeToggle").addEventListener("click", () => {
    const current = getTheme();
    const isCurrentlyDark = current === "dark" ||
      (current === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(isCurrentlyDark ? "light" : "dark");
  });

  // Conversation search
  $("convSearchInput").addEventListener("input", e => {
    convSearchTerm = e.target.value.trim();
    renderSidebar();
  });

  // Voice
  $("btnVoice").addEventListener("click", startVoice);

  // Send
  $("btnSend").addEventListener("click", () => {
    const val = $("chatInput").value;
    $("chatInput").value = "";
    $("chatInput").style.height = "auto";
    sendMessage(val);
  });
  $("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const val = $("chatInput").value;
      $("chatInput").value = "";
      $("chatInput").style.height = "auto";
      sendMessage(val);
    }
  });
  $("chatInput").addEventListener("input", () => {
    const el = $("chatInput");
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
    $("btnSend").disabled = !el.value.trim() || state.isGenerating;
  });

  // Stop
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
      if (text.length > 100000) { showToast("\u6587\u4ef6\u592a\u5927\uff08\u6700\u5927 10 \u4e07\u5b57\u7b26\uff09"); return; }
      state.attachedFile = { name: file.name, content: text.slice(0, 50000) };
      $("fileName").textContent = file.name;
      $("filePreview").style.display = "flex";
    } catch (err) {
      showToast("\u65e0\u6cd5\u8bfb\u53d6\u6587\u4ef6\uff08\u4ec5\u652f\u6301\u6587\u672c\u6587\u4ef6\uff09");
    }
  });
  $("btnRemoveFile").addEventListener("click", clearAttachment);

  // API settings modal
  $("btnApiSettings").addEventListener("click", () => {
    $("apiKeyInput").value = getApiKey();
    $("apiModal").classList.add("show");
    $("apiKeyInput").focus();
  });
  $("btnApiCancel").addEventListener("click", () => $("apiModal").classList.remove("show"));
  $("apiModal").addEventListener("click", e => {
    if (e.target === $("apiModal")) $("apiModal").classList.remove("show");
  });
  $("btnApiSave").addEventListener("click", () => {
    const key = $("apiKeyInput").value.trim();
    if (!key) { showToast("\u8bf7\u8f93\u5165 API Key"); return; }
    setApiKey(key);
    $("apiModal").classList.remove("show");
    showToast("API Key \u5df2\u4fdd\u5b58");
  });
  $("apiKeyInput").addEventListener("keydown", e => {
    if (e.key === "Enter") $("btnApiSave").click();
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
