# Zmind-map 功能实现文档（复用参考）

> 适用范围：基于 `github.com/wanglin2/mind-map` 二开的 Windows 桌面思维导图。
> 本文档聚焦二开功能，给出**实现方法、核心代码与逻辑**，便于后续功能复用。
> 涉及源码位置约定：
> - 前端：`mind-map/web/src/`（组件 `pages/Edit/components/*`，工具 `utils/*`）
> - 核心库：`mind-map/simple-mind-map/src/`（插件 `plugins/RichText.js`）
> - 桌面壳：`electron-app/`（入口 `main.js`、预加载 `preload.js`、产物 `app2/`）

---

## 0. 关键机制速查（复用前必读）

| 机制 | 要点 |
|------|------|
| 缩放竞态 | `new MindMap({fit:true})` 会在初始渲染回调里 `view.fit()→setScale(fitScale)`，**覆盖构造后同步设置的缩放**。要设固定缩放，必须在 `node_tree_render_end` 事件回调里再 `setScale()`（该事件在 fit 回调之后触发）。 |
| 改尺寸 | MindMap 只有 `resize()`，没有 `setSize()`。全屏/尺寸变化后必须调 `resize()`（内部自动更新 SVG 尺寸并重渲染），否则内容只显示在左上角。 |
| 节点高亮 | **用 `position:fixed` 的 DOM div 覆盖 `getBoundingClientRect()`**，不要用 SVG 高亮组（重渲染后 `node.group` 坐标系失效、引用丢失）。 |
| 重渲染后找节点 | 调用 `moveNodeToCenter` / 展开父节点后会触发 `node_tree_render_end` 重渲染，旧 `node.group` 会失效。必须在 `node_tree_render_end` 或 fallback 超时后**重新 `findNode`** 拿到 fresh 节点。 |
| 链接协议 | 文档引用 `zmind-file:<绝对路径>`、节点引用 `zmind-node:<绝对路径>:<节点uid>`。Quill 默认 `sanitize` 会把这些改成 `#`，**必须注册 ZmindLink 放行**（见 §3）。 |
| outside-click 关闭弹窗 | 必须在 **capture 阶段** `document.addEventListener('mousedown', fn, true)`，因为编辑框 `textEditNode` 的 mousedown 有 `stopPropagation`，bubble 阶段收不到。 |

---

## 1. 节点内悬浮窗功能（FilePreviewOverlay）

### 1.1 触发链路
```
渲染态点击 <a href="zmind-file:..."> / <a href="zmind-node:...">
  → RichText.onRenderLinkClick (document capture)
  → this.mindMap.emit('file_link_click' / 'node_link_click', {filePath, nodeUid, pos})
  → Edit.vue handleFileLinkClick / handleNodeLinkClick
  → $bus.$emit('show_file_preview', {filePath, nodeUid, pos})
  → FilePreviewOverlay.vue show() 显示悬浮窗

# 节点搜索列表项 hover 预览：
FileMentionPopup.vue onItemMouseEnter → $bus.$emit('show_file_preview', {hoverPreview:true,...})
```

### 1.2 核心实现
- 悬浮窗是一个 `position:fixed` 的 div（360×280），跟随被点击节点下方（`pos.y + 8`），带指向小三角。
- 内部 `new MindMap({fit:true, readonly:true})` 渲染被引用文件的思维导图（**新建独立实例**，非 iframe）。
- **缩放 0.4** 通过一次性 `node_tree_render_end` 监听设置（见 §0）。
- 若带 `nodeUid`，渲染完成后 `moveNodeToCenter` + 蓝框闪烁高亮（同复习高亮方案）。

### 1.3 关键代码
```js
// FilePreviewOverlay.vue —— 缩放竞态的正确修法
createPreviewMindMap(data, retries = 8) {
  const container = this.$refs.mindMapContainerRef
  if (!container || container.offsetWidth === 0) {
    if (retries > 0) return setTimeout(() => this.createPreviewMindMap(data, retries - 1), 100)
    this.error = '预览容器未就绪，请重试'; return
  }
  this.previewMindMap = new MindMap({ el: container, data: data.root || data, fit: true, readonly: true })
  const applyPreviewScale = () => {
    this.previewMindMap.off('node_tree_render_end', applyPreviewScale)
    try { this.previewMindMap.view.setScale(0.4) } catch (e) {}
  }
  this.previewMindMap.on('node_tree_render_end', applyPreviewScale)
}
```
```js
// 蓝框高亮（hover 预览模式复用，与复习高亮一致）
doHighlightInFloat(node) {
  const fresh = this.findPreviewNodeByUid(this.nodeUid) || node
  const rect = fresh.group.node.getBoundingClientRect()
  const box = document.createElement('div')
  box.style.cssText = `position:fixed;left:${rect.left-6}px;top:${rect.top-6}px;
    width:${rect.width+12}px;height:${rect.height+12}px;
    border:3px solid #0984e3;border-radius:8px;pointer-events:none;
    z-index:99999;box-shadow:0 0 15px rgba(9,132,227,0.5);`
  document.body.appendChild(box)
  // setInterval 闪烁 8 次后 3 秒移除
}
```
> 跨文件节点跳转（点击"去编辑"或大图 # 引用）用 Edit.vue `loadAndHighlightFile`（主窗口 `setData` 加载 + `expandToNodeUid` + `highlightReferencedNode`），支持 `navStack` 返回原文档，见 §3.5。

---

## 2. 节点内文档引用（@ 文件引用）

### 2.1 实现逻辑
1. 节点进入编辑态后，在 Quill 输入 `@` → `RichText.text-change` 监听检测到插入 `@` → emit `show_file_mention {mode:'file'}`。
2. `FileMentionPopup.vue` 从 `ZMIND_FOLDER_ROOTS` 配置的目录树递归扫描 `*.smm/*.md/*.json`，展示文件名搜索列表。
3. 选中后回调 `RichText.insertFileLink(name, 'zmind-file:' + absPath)`，在光标处插入 `<a href="zmind-file:...">文件名</a>`。
4. 渲染态点击该链接（§0 链路）→ 弹出悬浮窗预览（§1）。

### 2.2 关键代码
```js
// RichText.js —— 检测 @ / # 输入
this.quill.on('text-change', (delta) => {
  for (const op of delta.ops) {
    if (op.insert === '@') this.checkAndShowFileMention('file')
    else if (op.insert === '#') this.checkAndShowFileMention('node')
  }
})

// 在光标处插入文件引用链接
insertFileLink(displayText, linkUrl, insertIndex) {
  if (insertIndex !== undefined) this.quill.deleteText(insertIndex - 1, 1) // 删掉刚输入的 @
  const index = this.quill.getSelection().index
  this.quill.insertText(index, displayText, { link: linkUrl })
  this.quill.insertText(index + displayText.length, ' ', {})
}
```
```js
// 扫描目录（FileMentionPopup.vue）
async scanDir(dirPath, rootPath, depth) {
  if (depth < 0) return
  const list = await fs.listDir(dirPath)
  for (const item of list) {
    if (item.isDir) await this.scanDir(item.path, rootPath, depth - 1)
    else if (/\.(smm|json|md)$/i.test(item.name)) this.allFiles.push({ name: item.name, path: item.path })
  }
}
```
> 渲染态点击拦截（含坐标传递）：见 §0 链路 + RichText.onRenderLinkClick。编辑态点击在 `textEditNode` 的 click 监听里直接 `preventDefault` + emit。

---

## 3. 节点内节点引用（#）与跨节点/跨文件引用

### 3.1 节点引用 vs 跨节点引用
- **# 节点引用**：在 `#` 弹窗中从所有文件节点里搜索，选中后插入 `zmind-node:<文件绝对路径>:<节点uid>`。
- **跨节点引用**：本质就是 # 引用指向**另一个文件**里的节点（链接协议里带了别的文件的路径），因此天然支持跨文件。
- 点击后的行为：
  - 悬浮窗预览（hover 列表项时即时显示，点击时固定显示）+ 蓝框高亮（§1.3）。
  - 点击"去编辑"或在复习中跳转 → `loadAndHighlightFile(backupOrOriginalPath, nodeUid)` 主窗口加载并定位（§3.5）。

### 3.2 链接协议与解析
```js
// zmind-node 链接格式：zmind-node:<filePath>:<nodeUid>
// 解析（RichText.onRenderLinkClick / textEditNode click）
const data = href.replace('zmind-node:', '')
const sepIdx = data.lastIndexOf(':')
const filePath = data.substring(0, sepIdx)
const nodeUid = data.substring(sepIdx + 1)
this.mindMap.emit('node_link_click', { filePath, nodeUid, pos })
```

### 3.3 Quill Link 放行（必做，否则引用失效）
```js
// RichText.js —— 覆盖默认 sanitize，放行 zmind-file:/zmind-node:
(() => {
  const OriginalLink = Quill.import('formats/link')
  if (OriginalLink && !OriginalLink._zmindPatched) {
    class ZmindLink extends OriginalLink {
      static sanitize(url) {
        if (typeof url === 'string' &&
            (url.startsWith('zmind-file:') || url.startsWith('zmind-node:'))) return url
        return super.sanitize(url)
      }
    }
    ZmindLink._zmindPatched = true
    Quill.register(ZmindLink, true)
  }
})()
```
> ⚠️ 且 `initQuillEditor` 的 `formats` 白名单**必须含 `'link'`**，否则 `<a>` 被剥离、灰底样式丢失。

### 3.4 整体删除引用
```js
// 光标紧贴链接时 Backspace / Delete 整体删除（RichText.onGlobalKeydown）
onGlobalKeydown(e) {
  const isBackspace = e.key === 'Backspace', isDelete = e.key === 'Delete'
  if (!isBackspace && !isDelete) return
  const sel = this.quill.getSelection()
  if (!sel || sel.length > 0) return
  const checkIndex = isBackspace ? sel.index - 1 : sel.index
  const fmt = this.quill.getFormat(checkIndex, 1)
  if (fmt && fmt.link) {
    const range = isBackspace ? this.findLinkRange(sel.index) : this.findLinkRangeForward(sel.index)
    e.preventDefault()
    this.quill.deleteText(range.start, range.end - range.start)
  }
}
```

### 3.5 跨文件节点跳转（主窗口加载 + 高亮）
```js
// Edit.vue —— 在引用/复习中跳转到另一个文件的节点
async loadAndHighlightFile(filePath, nodeUid) {
  const content = await window.zmindFs.readFile(filePath)
  let data = /\.md$/i.test(filePath)
    ? mdToTree(content) : (JSON.parse(content).root ? JSON.parse(content) : { root: JSON.parse(content) })
  // 跨文件才压栈（返回用）
  if (!this.isReturning && prevPath && prevPath !== filePath) this.navStack.push(prevPath)
  this.$bus.$emit('setData', data)
  this.$store.commit('setCurrentFilePath', filePath)
  if (nodeUid) {
    const onRender = () => {
      this.mindMap.off('node_tree_render_end', onRender)
      // 用库内置 expandToNodeUid 展开父节点（比手动稳定）
      this.mindMap.renderer.expandToNodeUid(nodeUid, () => {
        setTimeout(() => this.highlightReferencedNode(nodeUid), 200)
      })
    }
    this.mindMap.on('node_tree_render_end', onRender)
    setTimeout(() => { this.mindMap.off('node_tree_render_end', onRender); /* fallback */ }, 2000)
  }
  return true
}
```

---

## 4. 挖空功能（Cloze）

### 4.1 数据格式
- 落盘：被挖空内容包在 `<span class="smm-cloze">文本</span>` 中（节点富文本 HTML 内）。
- 编辑载体：Quill 内建 `code` 格式（`<code>文本</code>`）。保存时 `<code>→<span class="smm-cloze">`，加载时还原。
- 大纲语法：`[==文本==]`（双等号），在 `OutlineEdit.vue` 用 `clozeSpanToMarker`/`markerToClozeSpan` 双向转换（需兼容 `<code>` 残留）。

### 4.2 编解码（RichText.js）
```js
const clozeEncode = html =>
  html.replace(/<code\b([^>]*)>([\s\S]*?)<\/code>/gi, '<span class="smm-cloze">$2</span>')
const clozeDecode = html =>
  html.replace(/<span[^>]*class=["'][^"']*smm-cloze[^"']*["'][^>]*>([\s\S]*?)<\/span>/g, '<code>$1</code>')
```
- `clozeEncode` 在 `hideEditText`（保存）时调用；`clozeDecode` 在 `showEditText`（加载）时调用。

### 4.3 显示状态管理（cloze.js）
- 运行时状态：`hiddenAll`（全局显隐）+ `nodeOverrideMap`（按节点 uid 覆盖），**不落盘**，靠 `MutationObserver` 在重渲染后重绘。
- 隐藏样式：文字 `transparent` + 紫色下划线（`.smm-cloze-hidden`）。

```js
// 切换当前选区挖空（编辑态）
export const toggleSelectionCloze = () => {
  const rt = mindMapRef.richText
  if (!rt.showTextEdit) return null
  const quill = rt.quill
  let range = quill.getSelection(true) || rt.range
  if (!range || range.length === 0) return null
  const isClozed = !!quill.getFormat(range.index, range.length).code
  quill.formatText(range.index, range.length, 'code', !isClozed, 'user') // 立即包裹 <code>
  return isClozed ? 'removed' : 'added'
}
```
```js
// 非编辑态：整节点挖空 / 取消（Ctrl+Enter 无选区时）
export const clozeWholeNode = () => {
  const node = mindMapRef.renderer.activeNodeList[0]
  let text = node.getData('text') || ''
  if (/class=["'][^"']*smm-cloze/.test(text)) {
    text = text.replace(/<span[^>]*smm-cloze[^>]*>([\s\S]*?)<\/span>/g, '$1') // 取消
    node.setText(text); return 'removed'
  }
  text = `<p><span class="smm-cloze">${text}</span></p>` // 全部挖空
  node.setText(text, true); return 'added'
}
```
- 节点级显隐：`setNodesClozeHidden(nodeList, hidden)`（右键"显示/隐藏挖空"）。
- **销毁防泄漏**：`destroyCloze()` 在切文档/组件卸载时 `disconnect` observer + clear timer。

### 4.4 复用禁忌
- ❌ 不要注册自定义 `ClozeBlot`（Quill 2.x `blots/inline` 路径 `extends undefined` 崩溃）。
- ❌ 不要 `deferred addPendingCloze`（无即时反馈）。

---

## 5. 艾宾浩斯复习日期（9 周期）

### 5.1 周期定义（reviewPlan.js）
```js
const CYCLES = [
  { cycle: 1, label: '5分钟',   ms: 5 * 60 * 1000 },
  { cycle: 2, label: '30分钟',  ms: 30 * 60 * 1000 },
  { cycle: 3, label: '12小时',  ms: 12 * 60 * 60 * 1000 },
  { cycle: 4, label: '1天',    ms: 1 * 24 * 60 * 60 * 1000 },
  { cycle: 5, label: '2天',    ms: 2 * 24 * 60 * 60 * 1000 },
  { cycle: 6, label: '4天',    ms: 4 * 24 * 60 * 60 * 1000 },
  { cycle: 7, label: '7天',    ms: 7 * 24 * 60 * 60 * 1000 },
  { cycle: 8, label: '15天',   ms: 15 * 24 * 60 * 60 * 1000 },
  { cycle: 9, label: '31天',   ms: 31 * 24 * 60 * 60 * 1000 },
]
```

### 5.2 存储结构（localStorage `ZMIND_REVIEW_PLAN`）
```js
// addToReviewPlan(nodeData) —— 添加时一次性算出 9 个日期，后续不再重算
const cycles = CYCLES.map(c => ({
  cycle: c.cycle, label: c.label,
  reviewDate: formatDateTime(startTime + c.ms),  // YYYY-MM-DD HH:mm
  reviewDateTs: startTime + c.ms,                 // 用时间戳比较，避免"启动误判逾期"
  completed: false, completedDate: null
}))
const item = {
  id: createUid(), nodeUid, nodeText, parentText,
  filePath, fileName, backupFilePath, backupFileName,
  createdDate, createdDateTs, cycles
}
```

### 5.3 触发逻辑
```
main.js 每 30s 定时器
  if 当前时间 == reviewConfig.forgotTime(默认23:59) 且今日未触发 → sendReviewTrigger('forgot')
  if 当前时间 == reviewConfig.reminderTime(默认20:00) 且今日未触发 → sendReviewTrigger('reminder')
  → BrowserWindow.webContents.send('zmind:reviewTrigger', {type, date})
  → web 端 reviewNotify.initReviewTriggerHandler 处理
  → 按节点去重后发送飞书卡片 + 系统通知（见 §9）
启动额外：checkMissedReviews() 补推错过的、checkStartupReminder() 补推已过的定时提醒
```

### 5.4 跨文件备份（保证 uid 一致）
- 添加复习计划时把当前文档复制到 `userData/review-backup/review_<ts>_<原名>.smm`（IPC `zmind:backupFile`，唯一化文件名）。
- 点击复习节点优先加载**备份文件**（uid 一致），失败回退原文件（`Edit.handleReviewNavigate`）。

### 5.5 常用 API（reviewPlan.js）
- `addToReviewPlan` / `removeById(id)` / `removeFromReviewPlan(nodeUid)`
- `getTodayUncompletedItems()` / `getPendingReviewItems()`（用时间戳）
- `markCycleCompleted(id, cycleNum)` / `isAllCyclesCompleted(id)`
- `getReviewStats()` / `cleanupOldCompleted()`（清 3 个月前已完成项）

---

## 6. AI 相关所有功能（通用 OpenAI 兼容）

### 6.1 通用流式客户端（ai.js）
```js
// 兼容 OpenAI / DeepSeek / 通义 / Kimi / 火山方舟 / Ollama 等
class Ai {
  init({ api, key, model }) {
    this.baseData = {
      api,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      data: { model, stream: true }
    }
  }
  async request(data, progress, end, err) { /* fetch + 读流 + SSE 解析 + [DONE] 结束 */ }
  stop() { this.controller.abort(); this.controller = new AbortController() }
}
export const testAiConnection = async config =>
  fetch(config.api, { method:'POST', headers:{...}, body: JSON.stringify({model,stream:false,max_tokens:1,...}) })
```
> config：`{ api, key, model }`，存于 `store.aiConfig`（持久化到 `SIMPLE_MIND_MAP_LOCAL_CONFIG`）。

### 6.2 AI 智能挖空（aiCloze.js）
- 入口：`smartCloze(config)`（整图）/ `smartClozeNodes(config, nodeList)`（选中节点）。
- 流程：遍历节点提取 `{uid, level, text}` → 调 AI（system prompt 保守策略，要求返回 `{"results":[{"uid","clozes":[...]}]}`）→ `parseAiResponse`（先剥离 `<think>` 推理标签，再从最后一个 JSON 对象尝试）→ `applyClozeList` 把挖空结果写成 `<span class="smm-cloze">`。
- 失败直接抛**真实错误**（不再误导为"多次理解"）。
- 停止：`stopAiCloze()`（`currentAiInstance.stop()`）。

### 6.3 AI 背诵改写（aiRecite.js）
- 入口：`reciteRewriteNodes(config, nodeList)`。
- system prompt 要求"意思不变、更易背诵、不增删节点"，返回 `[{uid, text}]`，`applyRewriteResult` 用 `node.setText` 改写（不增删节点）。
- 停止：`stopAiRecite()`。

### 6.4 AI 生成节点（AiCreate.vue）
- 两种：①以选中节点为主题 AI 扩展子节点；②对节点 AI 补充分支细节。
- 用 `new Ai()` 流式生成，生成中显示 `aiCreatingMask` 遮罩 + 停止按钮；完成后把结果转为子节点插入思维导图。

### 6.5 AI 对话（AiChat.vue）
- 右侧对话面板。节点右键"发送给 AI"(`add_nodes_to_ai_chat`) 把选中节点文本带入对话上下文。
- 复用 `Ai` 客户端，支持把对话结果一键生成/插入节点。

### 6.6 AI 配置（AiConfigDialog.vue）
- 表单：接口地址 `api`、API Key `key`、模型 `model`。
- "连接测试"调用 `testAiConnection`；保存写入 `store.aiConfig`。

### 6.7 AI 图片处理（复用要点）
- 粘贴的截图 base64 可达 1–5 MB，发送前用 canvas 缩放到最大 1024px + JPEG 0.85 压缩。
- 视觉模型（多模态）请求需额外加 `max_tokens`，否则可能截断。

### 6.8 Toolbar 触发入口
- 顶部工具条按钮：`doSmartCloze`（智能挖空，整图/选中）、`aiReciteRewrite`（背诵改写），均由 `aiConfig` 缺失时引导打开 `AiConfigDialog`；生成中显示停止遮罩，调用 `stopAiCloze`/`stopAiRecite`。

---

## 7. 端口开放（局域网）后前端访问的所有功能

### 7.1 启动（Setting.vue）
- 设置项"开启局域网访问"勾选 → `window.zmindLan.start(port)`（默认 8080）→ 显示访问地址 `http://<局域网IP>:<port>` + 令牌。
- 端口变更自动 `start` 重启；取消勾选 `stop`。

### 7.2 Token 鉴权（main.js）
```js
const LAN_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000 // 30 天
function loadLanToken() {
  const data = JSON.parse(fs.readFileSync(LAN_TOKEN_FILE)) // userData/lan-token.json
  if (data.token && Date.now() - data.createdAt < LAN_TOKEN_TTL) return currentLanToken = data.token
  currentLanToken = crypto.randomBytes(12).toString('hex') // 过期则重新生成
  fs.writeFileSync(LAN_TOKEN_FILE, JSON.stringify({ token: currentLanToken, createdAt: Date.now() }))
}
function isLanAuthed(req, urlObj) {
  return (urlObj.searchParams.get('token') === currentLanToken) ||
         (req.headers.authorization?.replace(/^Bearer\s+/i,'') === currentLanToken)
}
```
- 所有 `/api/*` 必须带 token（query `?token=` 或 `Authorization: Bearer`），否则 401；静态资源（index.html）不限制，以便首次加载令牌输入页。
- 网页端首次访问：注入 `zmindTokenGate` 输入页，验证通过后 `location.reload` 进入。

### 7.3 端点清单（端口开放后可访问的全部功能）
| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/auth/verify` | GET | 校验 token（网页端输入后调用） |
| `/api/data` | GET | 获取桌面端缓存的 localStorage 全量数据 |
| `/api/sync` | POST | 网页端 → 桌面端 回传 localStorage（双向同步） |
| `/api/sse` | GET | **桌面端 → 网页端** 实时推送（EventSource） |
| `/api/fs/desktop` | GET | 获取桌面路径 |
| `/api/fs/list` | GET | 列出目录（`smm/md/json`） |
| `/api/fs/read` | GET | 读取文件内容 |
| `/api/fs/write` | POST | 写入文件 |
| `/api/fs/create` | POST | 新建文件（自动唯一名） |
| `/api/fs/mkdir` | POST | 新建文件夹 |
| `/api/fs/rename` | POST | 重命名 |
| `/api/fs/remove` | POST | 删除（移入回收站 `shell.trashItem`） |
| `/api/fs/move` | POST | 移动文件 |
| `/api/fs/exists` | GET | 判断路径是否存在 |

### 7.4 双向实时同步（SSE）
- 桌面端在 `index.html` 注入脚本：拦截 `localStorage.setItem`，对 9 个关键 key（思维导图数据、配置、语言、本地配置、挖空状态、折叠状态、最近文件、目录根、复习计划）防抖 POST 到 `/api/sync`；同时开 `EventSource('/api/sse?token=...')` 接收桌面端推送并写回 localStorage。
- **防回环**：网页端收到 SSE 时设 `window._fromSSE=true`，期间 `setItem` 不会反向回传。

### 7.5 前端桥（preload.js）
```js
contextBridge.exposeInMainWorld('zmindLan', {
  start: port => ipcRenderer.invoke('zmind:startLanServer', port),
  stop: () => ipcRenderer.invoke('zmind:stopLanServer'),
  getStatus: () => ipcRenderer.invoke('zmind:getLanStatus'),
  getToken: () => ipcRenderer.invoke('zmind:getLanToken'),
  regenerateToken: () => ipcRenderer.invoke('zmind:regenerateLanToken'),
})
```

---

## 8. 飞书 Webhook 推送（复习提醒）

### 8.1 配置（Setting.vue）
- `reviewWebhookUrl`（飞书自定义机器人 webhook）
- `reviewForgotTime`（默认 23:59）、`reviewReminderTime`（默认 20:00）
- `reviewBackupDir`（备份目录）
- "测试推送"调用 `sendTestReviewCard(webhookUrl)` 发送示例卡片

### 8.2 卡片构造逻辑（reviewNotify.js）
```js
async function sendFeishuCard(webhookUrl, { title, template, items }) {
  const elements = [{ tag: 'note', elements: [{ tag:'plain_text', content:`共 ${items.length} 个节点待复习` }] }]
  items.forEach((item, i) => {
    const text = getTextFromHtml(item.nodeText || '')
    const parent = getTextFromHtml(item.parentText || '')
    let content = `${i+1}. **${text}**`
    if (parent) content += `\n← ${parent}`
    if (item.fileName) content += `\n📄 ${item.fileName}`
    elements.push({ tag:'div', text:{ tag:'lark_md', content } })
    if (i < items.length - 1) elements.push({ tag:'hr' })
  })
  const payload = {
    msg_type: 'interactive',
    card: { config:{ wide_screen_mode:true },
      header:{ title:{ tag:'plain_text', content: title }, template: template||'red' },
      elements }
  }
  await window.zmindReview.sendFeishuWebhook(webhookUrl, payload)
}
```
- **按节点去重**：`dedupeByNode` 同一 `nodeUid` 多周期落同日只保留一条（取最早到期）。
- **防当日重复**：forgot/reminder/missed 各用 localStorage key（如 `ZMIND_REVIEW_LAST_REMINDER`）记录今日已推。

### 8.3 发送实现（web → 主进程 IPC → Node https）
```js
// reviewNotify.js 调用桥
window.zmindReview.sendFeishuWebhook(webhookUrl, payload)

// electron-app/main.js —— IPC 真正发请求
ipcMain.handle('zmind:sendFeishuWebhook', async (e, url, payload) => {
  const https = require('https')
  const urlObj = new URL(url)
  const postData = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return new Promise(resolve => {
    const req = https.request(urlObj, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, res => {
      let data = ''; res.on('data', c => data += c)
      res.on('end', () => resolve({ success: res.statusCode >= 200 && res.statusCode < 300, data }))
    })
    req.on('error', err => resolve({ success:false, error: err.message }))
    req.write(postData); req.end()
  })
})
```
> 触发来源：main.js 定时器 → `webContents.send('zmind:reviewTrigger', {type})` → `reviewNotify.initReviewTriggerHandler` 按 type 调 `handleForgotReview` / `handleReminderReview` / `handleMissedReview`，最终 `sendFeishuCard` + 系统通知（`zmind:showNotification`）。

---

## 9. 复用清单（新增同类功能时对照）
1. **新弹窗/浮层**：监听 `$bus` 事件 + `position:fixed` + capture 阶段 outside-click 关闭。
2. **新引用类型**：扩展链接协议 → 改 `RichText` 的 `onRenderLinkClick`/`insertFileLink` + `FileMentionPopup` 的 mode → 悬浮窗 `show_file_preview`。
3. **新 AI 能力**：新增 `utils/aiXxx.js` 导出 `xxx(config, nodes)` + `stopXxx()`，复用 `ai.js` 的 `Ai`，Toolbar 加按钮带停止遮罩。
4. **新定时任务**：main.js `setInterval` 比对 `HH:MM` + `lastXxxTrigger` 去重 → IPC → web 端 handler。
5. **新局域网端点**：main.js `startLanServer` 内加 `if (urlPath === '/api/xxx')`，注意 `/api/*` 自动走 `isLanAuthed` 鉴权。
6. **新外部推送**：web 端构造 payload → `window.zmindXxx` IPC 桥 → main.js `ipcMain.handle` 用 Node 原生模块发请求。
