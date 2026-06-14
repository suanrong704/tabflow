// DeepClaude Storage - IndexedDB wrapper
const DB_NAME = "deepclaude_db";
const DB_VERSION = 1;

class Storage {
  constructor() {
    this.db = null;
    this.ready = this._init();
  }

  async _init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("conversations")) {
          const s = db.createObjectStore("conversations", { keyPath: "id" });
          s.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("messages")) {
          const s = db.createObjectStore("messages", { keyPath: "id" });
          s.createIndex("conversationId", "conversationId", { unique: false });
          s.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _tx(name, mode) {
    await this.ready;
    return this.db.transaction(name, mode).objectStore(name);
  }

  // Conversations
  async createConversation(title = "???") {
    const conv = { id: crypto.randomUUID(), title, createdAt: Date.now(), updatedAt: Date.now() };
    const store = await this._tx("conversations", "readwrite");
    return new Promise((resolve, reject) => {
      const r = store.add(conv);
      r.onsuccess = () => resolve(conv);
      r.onerror = () => reject(r.error);
    });
  }

  async getConversations() {
    const store = await this._tx("conversations", "readonly");
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result.sort((a, b) => b.updatedAt - a.updatedAt));
      r.onerror = () => reject(r.error);
    });
  }

  async getConversation(id) {
    const store = await this._tx("conversations", "readonly");
    return new Promise((resolve, reject) => {
      const r = store.get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async updateConversation(id, updates) {
    const store = await this._tx("conversations", "readwrite");
    const conv = await new Promise((res, rej) => {
      const r = store.get(id); r.onsuccess = () => res(r.result); r.onerror = rej;
    });
    if (!conv) return;
    Object.assign(conv, updates, { updatedAt: Date.now() });
    return new Promise((resolve, reject) => {
      const r = store.put(conv); r.onsuccess = () => resolve(conv); r.onerror = reject;
    });
  }

  async deleteConversation(id) {
    const msgStore = await this._tx("messages", "readwrite");
    const idx = msgStore.index("conversationId");
    const msgs = await new Promise((res, rej) => {
      const r = idx.getAll(id); r.onsuccess = () => res(r.result); r.onerror = rej;
    });
    for (const m of msgs) msgStore.delete(m.id);
    const convStore = await this._tx("conversations", "readwrite");
    convStore.delete(id);
  }

  // Messages
  async addMessage(conversationId, role, content, model = null) {
    const msg = {
      id: crypto.randomUUID(), conversationId, role, content, model,
      editHistory: [], createdAt: Date.now()
    };
    const store = await this._tx("messages", "readwrite");
    await new Promise((resolve, reject) => {
      const r = store.add(msg); r.onsuccess = resolve; r.onerror = reject;
    });
    await this.updateConversation(conversationId, {});
    return msg;
  }

  async getMessages(conversationId) {
    const store = await this._tx("messages", "readonly");
    const idx = store.index("conversationId");
    return new Promise((resolve, reject) => {
      const r = idx.getAll(conversationId);
      r.onsuccess = () => resolve(r.result.sort((a, b) => a.createdAt - b.createdAt));
      r.onerror = () => reject(r.error);
    });
  }

  async editMessage(id, newContent) {
    const store = await this._tx("messages", "readwrite");
    const msg = await new Promise((res, rej) => {
      const r = store.get(id); r.onsuccess = () => res(r.result); r.onerror = rej;
    });
    if (!msg) return;
    msg.editHistory.push({ content: msg.content, editedAt: Date.now() });
    msg.content = newContent;
    return new Promise((resolve, reject) => {
      const r = store.put(msg); r.onsuccess = () => resolve(msg); r.onerror = reject;
    });
  }

  async deleteAfterMessage(messageId) {
    const store = await this._tx("messages", "readonly");
    const msg = await new Promise((res, rej) => {
      const r = store.get(messageId); r.onsuccess = () => res(r.result); r.onerror = rej;
    });
    if (!msg) return;
    const idx = store.index("conversationId");
    const all = await new Promise((res, rej) => {
      const r = idx.getAll(msg.conversationId); r.onsuccess = () => res(r.result); r.onerror = rej;
    });
    const toDelete = all.filter(m => m.createdAt >= msg.createdAt);
    const delStore = await this._tx("messages", "readwrite");
    for (const m of toDelete) delStore.delete(m.id);
  }
}

const storage = new Storage();
