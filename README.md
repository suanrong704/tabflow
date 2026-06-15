# DeepClaude

**DeepSeek 风格的个人 AI 聊天应用**，纯静态站点，部署在 GitHub Pages。

🌐 **网址**：[suanrong704.github.io/deepclaude](https://suanrong704.github.io/deepclaude/)

---

## 功能概览

### 🤖 AI 对话
- 支持 **DeepSeek-V4-Flash**（快速响应）和 **DeepSeek-V4-Pro**（深度推理）
- 流式输出（SSE），逐字显示
- Pro 模式下可展开的「🧠 深度思考过程」面板
- 思考强度可调：Enable / High / Max
- Markdown 渲染 + 代码语法高亮
- Enter 发送，Ctrl+Enter 换行

### 🌐 联网搜索
- 一键开启，自动调用 DuckDuckGo 免费搜索
- 搜索结果拼入提示词再发给 AI
- 无需 API Key

### 🧠 智能记忆
- 每次发送前自动检索对话历史中的相关内容
- 关键词提取 + 匹配评分，取 Top 3 注入提示词
- **纠错检测**：当你说「不对」「错了」时，不会把旧错误喂回去
- 最近 50 条消息始终保留在上下文中

### 👤 人设配置
- 侧边栏自定义 AI 身份："毒舌代码审查员""古汉语专家"...
- 注入每次对话和提示词生成

### 🌍 世界观/底层框架
- 为 AI 设定背景规则，适用于小说创作、角色扮演等
- 支持数万字大文本，可折叠编辑
- 支持 .txt / .md / .docx 导入

### 📄 文件上传
- 支持 .txt / .md / .docx / .json / .csv / 代码文件
- Word 文档自动解析（mammoth.js 本地集成）
- 上传后显示文件名 + 前 200 字预览，可展开看全文
- 发送后聊天气泡中显示附件卡片，可重新下载

### 🔄 消息版本切换
- 编辑消息重新发送后，旧版本不丢失
- 用户消息旁显示 ◀ n/m ▶ 翻页器
- 重新生成 AI 回复也可在多个版本间切换

### 💾 导入/导出
- **导出 JSON**：完整对话数据，含版本信息，可完美还原
- **导出 Markdown**：适合阅读和分享
- **导入对话**：上传 .json 或 .md 还原到侧边栏

### 📊 对话进度条
- 右侧固定进度条，随聊天滚动
- 标记每条用户消息位置，hover 预览内容
- 点击跳转到对应消息

### 📱 手机端适配
- 侧边栏默认关闭，打开后点选自动收回
- 输入框适配底部导航栏（safe-area-inset-bottom）
- 响应式布局

### 🎨 界面
- 跟随系统主题（亮色/暗色）
- 自定义用户和 AI 头像
- 对话搜索（侧边栏内）
- 新对话自动用首条消息命名

### 🔒 隐私
- API Key 仅保存在浏览器 localStorage
- 聊天记录仅保存在 IndexedDB（本地）
- 不上传任何数据到第三方服务器（除了 API 调用）

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 原生 HTML/CSS/JS，单文件 SPA |
| 存储 | IndexedDB（storage.js 封装） |
| Markdown | marked.js |
| 代码高亮 | highlight.js |
| Word 解析 | mammoth.js（本地集成） |
| PWA | Service Worker + manifest.json |
| API | DeepSeek API（OpenAI 兼容格式） |
| 部署 | GitHub Pages |

---

## 开发过程

这个项目由用户 @suanrong704 和 AI 编程助手 Codex 协作开发，经历了多个迭代：

1. **起步** — 搭建基础 DeepSeek 对话页面，支持 Flash/Pro 切换和流式输出
2. **联网搜索** — 集成免费 DuckDuckGo 搜索 API
3. **丰富交互** — 语音输入、附件、对话搜索、停止生成、Markdown 渲染
4. **模仿 DeepSeek** — 重新设计 UI，接近官方风格，做自己的 Logo
5. **记忆系统** — 上下文自动检索，解决长对话遗忘问题
6. **世界框架** — 世界观面板 + 提示词生成器，支持大文本
7. **版本切换** — 编辑消息后能在新旧版本间切换
8. **移动端适配** — Safari 兼容、手机布局、输入框适配
9. **导入导出** — JSON/MD 格式对话备份还原
10. **持续打磨** — 人设、附件卡片、纠错检测、SW 缓存修复...

---

## 本地运行

`ash
# 任意 HTTP 服务器即可
npx serve .
# 或
python -m http.server 8080
`

然后打开 http://localhost:8080，在侧边栏设置你的 DeepSeek API Key。

---

## 版本

当前版本：**v1.0.0**

详见 [CHANGELOG.md](./CHANGELOG.md)