// DeepClaude App - DeepSeek-style AI Chat
const $ = id => document.getElementById(id);
const API_URL = "https://api.deepseek.com/v1/chat/completions";

const state = {
  currentConvId: null,
  model: "flash",       // flash | pro
  webSearch: false,
  thinkingEffort: "disabled",  // disabled | high | max
  isGenerating: false,
  sidebarVisible: true,
  abortController: null,
  attachedFile: null,
};

const SVG_USER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>';
const SVG_AI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="16" r="6"/><circle cx="20" cy="10" r="4"/><circle cx="20" cy="22" r="3"/><line x1="15" y1="14" x2="18" y2="12"/><line x1="15" y1="18" x2="18" y2="20"/></svg>';
const SVG_COPY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const SVG_REFRESH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
const SVG_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
const SVG_SPEAK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';


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
  state.currentConvId = null;
  $("chatMessages").innerHTML = "";
  $("welcome").style.display = "flex";
  $("msgOutline").style.display = "none";
  renderSidebar();
}

async function renameConversation(id) {
  const item = document.querySelector('.conv-item[data-id="' + id + '"]');
  const titleSpan = item?.querySelector(".conv-title");
  if (!titleSpan || titleSpan.querySelector("input")) return;
  
  const oldTitle = titleSpan.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = oldTitle;
  input.className = "conv-rename-input";
  input.style.cssText = "width:100%;padding:2px 4px;border:1px solid var(--accent);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);font-size:13px;font-family:inherit;outline:none;";
  titleSpan.textContent = "";
  titleSpan.appendChild(input);
  input.focus();
  input.select();
  
  const finish = async () => {
    const val = input.value.trim();
    input.remove();
    titleSpan.textContent = val || oldTitle;
    if (val && val !== oldTitle) {
      await storage.updateConversation(id, { title: val });
      renderSidebar();
    }
  };
  
  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    if (e.key === "Escape") { input.value = oldTitle; input.blur(); }
  });
  input.addEventListener("click", (e) => e.stopPropagation());
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

function createMessageEl(msg, versionIndex) {
  const isUser = msg.role === "user";
  let content = msg.content;
  if (!isUser && msg.versions?.length && versionIndex !== undefined) {
    content = msg.versions[versionIndex].content;
  }
  let reasoning = null, answer = content;
  if (!isUser && content.startsWith("__REASONING__")) {
    const parts = content.split("__ANSWER__");
    if (parts.length === 2) { reasoning = parts[0].replace("__REASONING__",""); answer = parts[1]; }
  }
  let bodyHtml = "";
  if (!isUser && msg.versions?.length && msg.versions.length > 1) {
    const idx = versionIndex ?? msg.versions.length - 1;
    bodyHtml += '<div class="version-nav"><button data-action="prev-version" data-id="' + msg.id + '"' + (idx===0?' disabled':'') + '>&#9664;</button><span>' + (idx+1) + '/' + msg.versions.length + '</span><button data-action="next-version" data-id="' + msg.id + '"' + (idx>=msg.versions.length-1?' disabled':'') + '>&#9654;</button></div>';
  }
  if (reasoning) {
    bodyHtml += '<details class="reasoning-block"><summary>🧠 \u6df1\u5ea6\u601d\u8003\u8fc7\u7a0b</summary><div class="reasoning-content">' + renderMarkdown(reasoning) + '</div></details>';
  }
  bodyHtml += wrapCodeBlocks(renderMarkdown(answer));
  const actionsHtml = isUser
    ? '<button class="message-action-btn" data-action="copy-msg" data-id="' + msg.id + '">' + SVG_COPY + '</button><button class="message-action-btn" data-action="edit-msg" data-id="' + msg.id + '">' + SVG_EDIT + ' \u7f16\u8f91</button>'
    : '<button class="message-action-btn" data-action="copy-msg" data-id="' + msg.id + '">' + SVG_COPY + ' \u590d\u5236</button><button class="message-action-btn" data-action="regenerate" data-id="' + msg.id + '">' + SVG_REFRESH + ' \u91cd\u65b0\u751f\u6210</button><button class="message-action-btn" data-action="speak-msg" data-id="' + msg.id + '">' + SVG_SPEAK + ' \u6717\u8bfb</button>';
  return '<div class="message ' + (isUser?'user':'assistant') + '" data-id="' + msg.id + '"><div class="message-avatar">' + (isUser ? SVG_USER : SVG_AI) + '</div><div class="message-body">' + bodyHtml + '</div><div class="message-actions">' + actionsHtml + '</div></div></div>';
}

async function renderMessages() {
  if (!state.currentConvId) {
    $("chatMessages").innerHTML = "";
    $("welcome").style.display = "flex";
    return;
  }
  const msgs = await storage.getMessages(state.currentConvId);
  $("chatMessages").innerHTML = msgs.map(m => createMessageEl(m, m.versions?.length ? m.versions.length - 1 : undefined)).join("");
  highlightCode();
  attachMessageActions();
  updateNavProgress();
}


function wrapCodeBlocks(html) {
  return html.replace(/<pre>/g, '<div class="code-block-wrapper"><pre>').replace(/<\/pre>/g, '</pre><button class="code-copy-btn" title="复制代码">' + SVG_COPY + ' 复制</button></div>');
}

function attachMessageActions() {
  document.querySelectorAll("[data-action=prev-version], [data-action=next-version]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const msgId = btn.dataset.id;
      const msgs = await storage.getMessages(state.currentConvId);
      const msg = msgs.find(m => m.id === msgId);
      if (!msg?.versions) return;
      let curIdx = msg.versions.length - 1;
      const msgEl = document.querySelector('.message[data-id="' + msgId + '"]');
      const navText = msgEl?.querySelector(".version-nav span")?.textContent;
      if (navText) {
        const match = navText.match(/(\d+)\/(\d+)/);
        if (match) curIdx = parseInt(match[1]) - 1;
      }
      const newIdx = btn.dataset.action === "prev-version" ? curIdx - 1 : curIdx + 1;
      if (newIdx < 0 || newIdx >= msg.versions.length) return;
      msgEl.outerHTML = createMessageEl(msg, newIdx);
      highlightCode(); attachMessageActions();
    });
  });
  document.querySelectorAll("[data-action=copy-msg]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const msgEl = document.querySelector('.message[data-id="' + btn.dataset.id + '"]');
      const bodyEl = msgEl?.querySelector(".message-body");
      if (!bodyEl) return;
      const clone = bodyEl.cloneNode(true);
      const reasoning = clone.querySelector(".reasoning-block");
      if (reasoning) reasoning.remove();
      const actions = clone.querySelector(".message-actions");
      if (actions) actions.remove();
      const text = clone.textContent?.trim() || "";
      navigator.clipboard.writeText(text).then(() => showToast("已复制")).catch(() => showToast("复制失败"));
    });
  });
  document.querySelectorAll("[data-action=regenerate]").forEach(btn => {
    btn.addEventListener("click", async (e) => { e.stopPropagation(); await regenerateMessage(btn.dataset.id); });
  });
  document.querySelectorAll("[data-action=edit-msg]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const msgs = await storage.getMessages(state.currentConvId);
      const msg = msgs.find(m => m.id === btn.dataset.id);
      if (!msg) return;
      
      const msgEl = document.querySelector('.message[data-id="' + msg.id + '"]');
      const bodyEl = msgEl?.querySelector(".message-body");
      if (!bodyEl || bodyEl.querySelector("textarea")) return;
      
      const oldContent = msg.content;
      const textarea = document.createElement("textarea");
      textarea.value = oldContent;
      textarea.style.cssText = "width:100%;min-height:60px;padding:8px 12px;border:1px solid var(--accent);border-radius:8px;background:var(--bg-primary);color:var(--text-primary);font-size:14px;font-family:inherit;line-height:1.6;resize:vertical;outline:none;";
      
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:8px;margin-top:8px;";
      
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "保存并重新发送";
      saveBtn.style.cssText = "padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;";
      
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "取消";
      cancelBtn.style.cssText = "padding:6px 14px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;";
      
      btnRow.appendChild(saveBtn);
      btnRow.appendChild(cancelBtn);
      
      bodyEl.innerHTML = "";
      bodyEl.appendChild(textarea);
      bodyEl.appendChild(btnRow);
      textarea.focus();
      
      const cleanup = () => { bodyEl.innerHTML = ""; renderMessages(); };
      
      cancelBtn.addEventListener("click", (ev) => { ev.stopPropagation(); cleanup(); });
      
      saveBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const newContent = textarea.value.trim();
        if (!newContent || newContent === oldContent) { cleanup(); return; }
        await storage.deleteAfterMessage(msg.id);
        cleanup();
        sendMessage(newContent);
      });
      
      textarea.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") { ev.stopPropagation(); cleanup(); }
      });
    });
  })
  document.querySelectorAll("[data-action=speak-msg]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const msgEl = document.querySelector('.message[data-id="' + btn.dataset.id + '"]');
      const bodyEl = msgEl?.querySelector(".message-body");
      if (!bodyEl) return;
      // Clone and remove reasoning block to get only answer text
      const clone = bodyEl.cloneNode(true);
      const reasoning = clone.querySelector(".reasoning-block");
      if (reasoning) reasoning.remove();
      const actions = clone.querySelector(".message-actions");
      if (actions) actions.remove();
      let text = clone.textContent?.trim() || "";
      if (!text) return;
      if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); return; }
      const u = new SpeechSynthesisUtterance(text.slice(0, 2000));
      u.lang = "zh-CN"; u.rate = 1.1;
      window.speechSynthesis.speak(u);
    });
  });
  document.querySelectorAll(".code-copy-btn").forEach(btn => {
    btn.onclick = function() {
      const code = this.parentElement.querySelector("code").textContent;
      navigator.clipboard.writeText(code).then(() => {
        this.textContent = "✔ 已复制"; this.classList.add("copied");
        setTimeout(() => { this.innerHTML = SVG_COPY + ' 复制'; this.classList.remove("copied"); }, 2000);
      }).catch(() => showToast("复制失败"));
    };
  });
}

async function regenerateMessage(msgId) {
  if (state.isGenerating) return;
  const msgs = await storage.getMessages(state.currentConvId);
  const msg = msgs.find(m => m.id === msgId);
  if (!msg || msg.role !== "assistant") return;
  if (!msg.versions) msg.versions = [];
  msg.versions.push({ content: msg.content, model: msg.model || "unknown", createdAt: Date.now() });
  const msgIdx = msgs.findIndex(m => m.id === msgId);
  let userMsg = null;
  for (let i = msgIdx - 1; i >= 0; i--) { if (msgs[i].role === "user") { userMsg = msgs[i]; break; } }
  if (!userMsg) { showToast("找不到对应的用户消息"); return; }
  const savedVersions = [...msg.versions];
  await storage.deleteAfterMessage(msgId);
  const userContent = userMsg.content;
  await storage.deleteAfterMessage(userMsg.id);
  await storage.addMessage(state.currentConvId, "user", userContent);
  await renderMessages();
  await streamAIResponse(userContent);
  const newMsgs = await storage.getMessages(state.currentConvId);
  const lastAiMsg = newMsgs.filter(m => m.role === "assistant").pop();
  if (lastAiMsg && savedVersions.length > 0) {
    lastAiMsg.versions = savedVersions;
    const msgStore = await storage._tx("messages", "readwrite");
    await new Promise((res, rej) => { const r = msgStore.put(lastAiMsg); r.onsuccess = res; r.onerror = rej; });
  }
  await renderMessages(); scrollToBottom();
}


function updateNavProgress() {
  const track = document.getElementById("navTrack");
  const userMsgs = document.querySelectorAll(".message.user");
  const chatArea = document.getElementById("chatArea");
  
  if (!track || !state.currentConvId || userMsgs.length <= 1) {
    if (track) track.innerHTML = "";
    const navP = document.getElementById("navProgress");
    if (navP) navP.style.display = "none";
    return;
  }

  const navP = document.getElementById("navProgress");
  if (navP) navP.style.display = "";
  
  const scrollH = chatArea.scrollHeight;
  const areaRect = chatArea.getBoundingClientRect();
  track.innerHTML = "";
  
  userMsgs.forEach((msgEl) => {
    const dot = document.createElement("div");
    dot.className = "nav-progress-dot";
    // Calculate absolute content position from viewport + scroll
    const msgRect = msgEl.getBoundingClientRect();
    const msgContentPos = msgRect.top - areaRect.top + chatArea.scrollTop;
    const dotTop = (msgContentPos / scrollH) * 100;
    dot.style.top = Math.min(98, Math.max(2, dotTop)) + "%";
    dot.title = (msgEl.querySelector(".message-body")?.textContent || "").trim().slice(0, 40);
    
    dot.addEventListener("mouseenter", (e) => {
      const tip = document.getElementById("navTip");
      if (!tip) return;
      tip.textContent = dot.title;
      tip.style.display = "block";
      tip.style.left = (e.clientX - 220) + "px";
      tip.style.top = (e.clientY - 30) + "px";
    });
    dot.addEventListener("mousemove", (e) => {
      const tip = document.getElementById("navTip");
      if (!tip) return;
      tip.style.left = (e.clientX - 220) + "px";
      tip.style.top = (e.clientY - 30) + "px";
    });
    dot.addEventListener("mouseleave", () => {
      const tip = document.getElementById("navTip");
      if (tip) tip.style.display = "none";
    });
    dot.addEventListener("click", () => {
      msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
      msgEl.classList.add("flash-highlight");
      setTimeout(() => msgEl.classList.remove("flash-highlight"), 700);
    });
    
    track.appendChild(dot);
  });
}

function checkAutoScroll() {
  const area = $("chatArea");
  const dist = area.scrollHeight - area.scrollTop - area.clientHeight;
  $("btnScrollBottom").style.display = dist > 150 ? "" : "none";
}

async function generatePrompt() {
  const requirement = $("promptRequirement").value.trim();
  if (!requirement) { showToast("请输入需求描述"); return; }
  const apiKey = getApiKey();
  if (!apiKey) { showToast("请先设置 API Key"); return; }
  $("btnGeneratePrompt").disabled = true;
  $("btnGeneratePrompt").textContent = "生成中...";
  $("promptResult").style.display = "block";
  $("promptResultContent").textContent = "";
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: "You are a prompt engineering expert. Based on the user requirements, generate a well-crafted, detailed prompt in the same language. Output ONLY the prompt, no explanations." },
          { role: "user", content: requirement }
        ],
        stream: false, temperature: 0.7, max_tokens: 2048,
      }),
    });
    if (!resp.ok) throw new Error("API error " + resp.status);
    const data = await resp.json();
    $("promptResultContent").textContent = data.choices?.[0]?.message?.content || "生成失败";
  } catch (err) {
    $("promptResultContent").textContent = "生成失败: " + err.message;
  } finally {
    $("btnGeneratePrompt").disabled = false;
    $("btnGeneratePrompt").innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/></svg> 生成提示词';
  }
}


function clearAttachment() {
  state.attachedFile = null;
  $("filePreview").style.display = "none";
  $("fileInput").value = "";
}



async function generateTitle(userText) {
  const conv = await storage.getConversation(state.currentConvId);
  if (!conv || conv.title !== "???") return;
  const t = (userText || "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (t) {
    await storage.updateConversation(state.currentConvId, { title: t });
    renderSidebar();
  }
}

async function exportConversation() {
  if (!state.currentConvId) return;
  const msgs = await storage.getMessages(state.currentConvId);
  const conv = allConvs.find(c => c.id === state.currentConvId);
  let md = "# " + (conv?.title || "对话") + "\n\n";
  msgs.forEach(m => {
    const role = m.role === "user" ? "**You**" : "**DeepClaude**";
    let content = m.content;
    if (m.role === "assistant" && content.startsWith("__REASONING__")) {
      const parts = content.split("__ANSWER__");
      content = parts.length === 2 ? "> 深度思考：\n> " + parts[0].replace("__REASONING__","").replace(/\n/g,"\n> ") + "\n\n" + parts[1] : content;
    }
    md += role + "\n\n" + content + "\n\n---\n\n";
  });
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = (conv?.title||"conversation") + ".md"; a.click();
  URL.revokeObjectURL(url);
  showToast("导出成功");
}

// ===== Chat / API =====

// ===== Auto Context Retrieval =====
function retrieveContext(userInput, allMessages) {
  if (allMessages.length < 4) return "";
  
  // Extract keywords: Chinese bigrams + English words
  const keywords = [];
  const text = userInput.toLowerCase();
  
  // Chinese bigrams (2-char sliding window for CJK chars)
  const cjk = [];
  for (let i = 0; i < text.length - 1; i++) {
    const c = text.charCodeAt(i);
    if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF)) {
      cjk.push(text[i] + text[i + 1]);
      i++; // skip next to avoid overlap, effectively bigrams
    }
  }
  
  // Add CJK trigrams for better precision
  for (let i = 0; i < text.length - 2; i++) {
    const c = text.charCodeAt(i);
    if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF)) {
      cjk.push(text[i] + text[i + 1] + text[i + 2]);
    }
  }
  
  // English words (3+ chars)
  const enWords = text.match(/[a-z]{3,}/g) || [];
  
  // Combine and deduplicate
  const allKW = [...new Set([...cjk, ...enWords])];
  if (allKW.length === 0) return "";
  
  // Filter stop words
  const stops = new Set(["the","and","for","that","this","with","from","have","are","was","not","but","you","your","all","can","has","had","been","will","would","what","when","where","which","who","how"]);
  const keywords_filtered = allKW.filter(kw => kw.length < 3 || !stops.has(kw));
  if (keywords_filtered.length === 0) return "";
  
  // Score each message pair (user + assistant)
  const pairs = [];
  for (let i = 0; i < allMessages.length - 1; i += 2) {
    const userMsg = allMessages[i];
    const aiMsg = allMessages[i + 1];
    if (userMsg.role !== "user" || !aiMsg || aiMsg.role !== "assistant") continue;
    
    const combined = (userMsg.content + " " + (aiMsg?.content || "")).toLowerCase();
    let score = 0;
    for (const kw of keywords_filtered) {
      const count = (combined.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
      score += count * (kw.length >= 3 ? 3 : 1); // weight longer keywords higher
    }
    
    if (score > 0) {
      pairs.push({ userMsg, aiMsg, score, index: i });
    }
  }
  
  if (pairs.length === 0) return "";
  
  // Sort by score, take top 3
  pairs.sort((a, b) => b.score - a.score);
  const top = pairs.slice(0, 3);
  
  // Format snippets
  let context = "\n\n[RELEVANT PAST CONTEXT - use this to stay consistent:]\n";
  for (const p of top) {
    const userSnippet = p.userMsg.content.replace(/\n/g, " ").slice(0, 120);
    const aiSnippet = (p.aiMsg?.content || "").replace(/__REASONING__.*?__ANSWER__/s, "").replace(/\n/g, " ").slice(0, 200);
    context += "Previous exchange: User: \"" + userSnippet + "...\" AI: \"" + aiSnippet + "...\"\n";
  }
  
  return context;
}

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

  // Build messages for API
  const allMsgs = await storage.getMessages(state.currentConvId);
  const apiMessages = [];

  // System prompt
  let systemPrompt = "You are DeepClaude, a helpful AI assistant.";
  if (state.model === "pro") {
    systemPrompt += " Provide detailed reasoning before your final answer.";
  }

  // Auto context retrieval
  const contextSnippet = retrieveContext(userText.trim(), allMsgs);
  if (contextSnippet) {
    systemPrompt += contextSnippet;
  }

  // Add web search results
  if (state.webSearch) {
    const searchResults = await webSearch(userText.trim());
    if (searchResults) {
      systemPrompt += `\n\nCurrent web search results:\n${searchResults}`;
    }
  }

  apiMessages.push({ role: "system", content: systemPrompt });
  
  // Add conversation history (last 50 messages)
  const recentMsgs = allMsgs.slice(-50);
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

    // Show context retrieval indicator
  if (contextSnippet) {
    const matchCount = (contextSnippet.match(/Previous exchange:/g) || []).length;
    showToast("\u{1f517} \u5df2\u5173\u8054 " + matchCount + " \u6761\u76f8\u5173\u8bb0\u5f55", 3000);
  }
  
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
    const model = state.model === "pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
    
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
        temperature: state.model === "pro" ? 0.1 : 0.7,
        max_tokens: state.model === "pro" ? 8192 : 4096,
        ...(state.thinkingEffort !== "disabled" ? {
          reasoning_effort: state.thinkingEffort,
          thinking: { type: "enabled" }
        } : {}),
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
            displayHtml += `<details class="reasoning-block">
              <summary>\ud83e\udde0 \u6df1\u5ea6\u601d\u8003\u8fc7\u7a0b</summary>
              <div class="reasoning-content">${renderMarkdown(reasoningContent)}</div>
            </details>`;
          }
          displayHtml += wrapCodeBlocks(renderMarkdown(fullContent));
          displayHtml += '<span class="streaming-cursor"></span>';
          bodyEl.innerHTML = displayHtml;
          highlightCode();
          scrollToBottom();
          checkAutoScroll();
          checkAutoScroll();
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
    $("btnScrollBottom").style.display = "none";
    await renderMessages();
    scrollToBottom();
    await generateTitle(userText.trim());
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
  // Mobile: collapse sidebar by default
  if (window.innerWidth <= 768) {
    state.sidebarVisible = false;
    $("sidebar").classList.add("collapsed");
  }

  // Sidebar toggle (with mobile backdrop)
  const isMobile = () => window.innerWidth <= 768;
  let sidebarBackdrop = null;
  
  function showSidebarBackdrop() {
    if (!sidebarBackdrop) {
      sidebarBackdrop = document.createElement("div");
      sidebarBackdrop.className = "sidebar-backdrop";
      sidebarBackdrop.style.cssText = "position:fixed;inset:0;z-index:250;background:rgba(0,0,0,0.4);";
      sidebarBackdrop.addEventListener("click", () => {
        state.sidebarVisible = false;
        $("sidebar").classList.add("collapsed");
        hideSidebarBackdrop();
      });
      document.body.appendChild(sidebarBackdrop);
    }
    sidebarBackdrop.style.display = "block";
  }
  
  function hideSidebarBackdrop() {
    if (sidebarBackdrop) sidebarBackdrop.style.display = "none";
  }
  
  $("btnToggleSidebar").addEventListener("click", () => {
    state.sidebarVisible = !state.sidebarVisible;
    $("sidebar").classList.toggle("collapsed", !state.sidebarVisible);
    if (isMobile()) {
      state.sidebarVisible ? showSidebarBackdrop() : hideSidebarBackdrop();
    }
  });
  $("btnCloseSidebar").addEventListener("click", () => {
    state.sidebarVisible = false;
    $("sidebar").classList.add("collapsed");
    if (isMobile()) hideSidebarBackdrop();
  });
  
  // Close sidebar on conversation click (mobile)
  const closeMobileSidebar = () => {
    setTimeout(() => {
      state.sidebarVisible = false;
      $("sidebar").classList.add("collapsed");
      hideSidebarBackdrop();
    }, 150);
  };
  document.getElementById("convList").addEventListener("click", (e) => {
    if (isMobile() && e.target.closest(".conv-item")) closeMobileSidebar();
  });
  // New chat button
  $("btnNewChat").addEventListener("click", () => {
    newConversation();
    if (isMobile()) closeMobileSidebar();
  })
  // Close on clicking sidebar header area
  document.querySelector(".sidebar-header").addEventListener("click", (e) => {
    // Don't close when clicking the close button (handled separately)
    if (isMobile() && !e.target.closest("#btnCloseSidebar")) closeMobileSidebar();
  });

  // Web search toggle
  $("btnWebSearch").addEventListener("click", () => {
    state.webSearch = !state.webSearch;
    $("btnWebSearch").classList.toggle("active", state.webSearch);
  });
  // Thinking mode toggle
  $("btnThinking").addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = $("thinkingDropdown");
    dd.style.display = dd.style.display === "none" ? "block" : "none";
  });
  document.querySelectorAll(".thinking-option").forEach(opt => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      state.thinkingEffort = opt.dataset.effort;
      document.querySelectorAll(".thinking-option").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      $("thinkingDropdown").style.display = "none";
            // Update button style and text
      const btn = $("btnThinking");
      const span = btn.querySelector(".thinking-label");
      if (state.thinkingEffort === "disabled") {
        btn.classList.remove("active");
        if (span) span.textContent = "思考";
      } else {
        btn.classList.add("active");
        const label = state.thinkingEffort === "high" ? "思考 · High" : "思考 · Max";
        if (span) span.textContent = label;
      }
    });
  });
  document.addEventListener("click", () => {
    $("thinkingDropdown").style.display = "none";
  });
  // Model switcher
  document.querySelectorAll(".model-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".model-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.model = btn.dataset.model;
    });
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
  // Prompt panel
  $("btnPromptPanel").addEventListener("click", () => {
    $("promptPanel").classList.toggle("open");
    $("btnPromptPanel").classList.toggle("active", $("promptPanel").classList.contains("open"));
  });
  $("btnClosePrompt").addEventListener("click", () => {
    $("promptPanel").classList.remove("open");
    $("btnPromptPanel").classList.remove("active");
  });
  $("btnGeneratePrompt").addEventListener("click", generatePrompt);
  $("btnCopyPrompt").addEventListener("click", () => {
    const text = $("promptResultContent").textContent;
    navigator.clipboard.writeText(text).then(() => showToast("提示词已复制")).catch(() => showToast("复制失败"));
  });

  // Export
  $("btnExportConv").addEventListener("click", exportConversation);

  // Auto-scroll
  $("btnScrollBottom").addEventListener("click", scrollToBottom);
  $("chatArea").addEventListener("scroll", () => {
    checkAutoScroll();
    updateNavProgress();
  });

  $("btnVoice").addEventListener("click", startVoice);

  // Send
  $("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.ctrlKey) {
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const val = $("chatInput").value;
      $("chatInput").value = "";
      $("chatInput").style.height = "auto";
      sendMessage(val);
    }
  });
  $("btnSend").addEventListener("click", () => {
    const val = $("chatInput").value;
    $("chatInput").value = "";
    $("chatInput").style.height = "auto";
    sendMessage(val);
  });
  $("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.ctrlKey) {
      return;
    }
    if (e.key === "Enter") {
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
