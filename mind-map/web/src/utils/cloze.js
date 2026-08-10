// 挖空功能状态管理（二开功能）
// 数据格式：节点富文本中被挖空的内容包裹在 <span class="smm-cloze"> 中
// 显示状态：运行时管理，不落盘（挖空标记本身会随节点文本保存）
//
// Ctrl+Enter / 悬浮按钮挖空策略（Quill 2.x 环境）：
//   toggleSelectionCloze 直接调 quill.formatText('code')，选中文字立即包裹 <code>，
//   编辑器内显示紫色下划线（见 .ql-editor code 样式）。
//   RichText.hideEditText 保存时 clozeEncode 把 <code> 转为 <span class="smm-cloze">。
//   全程在 quill delta 内完成，不走事件系统，不依赖自定义 blot。

let hiddenAll = true
const nodeOverrideMap = new Map()
let mindMapRef = null
let clozeObserver = null
let clozeObserverTimer = null

const CLOZE_STATE_KEY = 'SIMPLE_MIND_MAP_CLOZE_STATE'

// 保存挖空显示状态到 localStorage（供局域网同步）
export const saveClozeState = () => {
  const state = {
    hiddenAll,
    overrides: Object.fromEntries(nodeOverrideMap)
  }
  try {
    localStorage.setItem(CLOZE_STATE_KEY, JSON.stringify(state))
  } catch (e) {}
  // 通知 Edit.vue 触发局域网同步（桌面端 → 网页端）
  if (window.$bus) {
    window.$bus.$emit('clozeStateChanged')
  }
}

// 从 localStorage 加载挖空显示状态
export const loadClozeState = () => {
  try {
    const raw = localStorage.getItem(CLOZE_STATE_KEY)
    if (!raw) return
    const state = JSON.parse(raw)
    hiddenAll = state.hiddenAll !== undefined ? state.hiddenAll : true
    nodeOverrideMap.clear()
    if (state.overrides) {
      for (const [uid, hidden] of Object.entries(state.overrides)) {
        nodeOverrideMap.set(uid, hidden)
      }
    }
  } catch (e) {}
}

// 从 localStorage 加载并应用挖空状态
export const applyClozeStateFromStorage = () => {
  loadClozeState()
  applyClozeStyles()
}

export const initCloze = mindMap => {
  // 重新初始化前先清理旧观察器，避免 MutationObserver 泄漏
  destroyCloze()
  mindMapRef = mindMap
  loadClozeState()
  startClozeObserver()
}

// 销毁挖空观察器（切文档/重建实例/组件卸载时调用，避免 MutationObserver 泄漏）
export const destroyCloze = () => {
  if (clozeObserverTimer) { clearTimeout(clozeObserverTimer); clozeObserverTimer = null }
  if (clozeObserver) {
    try { clozeObserver.disconnect() } catch (e) {}
    clozeObserver = null
  }
}

const startClozeObserver = (retries = 20) => {
  if (clozeObserver) return
  const container = document.getElementById('mindMapContainer')
  if (!container) {
    // 容器未就绪时重试，最多 retries 次，避免无限循环
    if (retries > 0) {
      setTimeout(() => startClozeObserver(retries - 1), 500)
    }
    return
  }
  clozeObserver = new MutationObserver(() => {
    if (clozeObserverTimer) clearTimeout(clozeObserverTimer)
    clozeObserverTimer = setTimeout(applyClozeStyles, 100)
  })
  clozeObserver.observe(container, { childList: true, subtree: true })
}

export const isClozeHiddenAll = () => hiddenAll

const isNodeClozeHidden = uid => {
  if (nodeOverrideMap.has(uid)) return nodeOverrideMap.get(uid)
  return hiddenAll
}

export const nodeHasCloze = node => {
  const text = node.getData('text') || ''
  return typeof text === 'string' && text.includes('smm-cloze')
}

export const applyClozeStyles = () => {
  if (!mindMapRef || !mindMapRef.renderer) return
  const root = mindMapRef.renderer.root
  if (!root) return
  const walk = node => {
    if (node._textData && node._textData.node && node._textData.node.node) {
      const el = node._textData.node.node
      const clozeEls = el.querySelectorAll('.smm-cloze')
      if (clozeEls.length > 0) {
        const hidden = isNodeClozeHidden(node.uid)
        clozeEls.forEach(span => {
          span.classList.toggle('smm-cloze-hidden', hidden)
          // background-image 作为主要下划线方式（SVG foreignObject 中最可靠）
          // border-bottom 和 text-decoration 在 SVG foreignObject 内不可靠
          if (hidden) {
            span.style.setProperty('color', 'transparent', 'important')
            span.style.setProperty('background-color', 'transparent', 'important')
            span.style.setProperty('background-image', 'linear-gradient(#8e44ad, #8e44ad)', 'important')
            span.style.setProperty('background-position', '0 100%', 'important')
            span.style.setProperty('background-size', '100% 3px', 'important')
            span.style.setProperty('background-repeat', 'no-repeat', 'important')
            span.style.setProperty('padding-bottom', '2px', 'important')
            span.style.setProperty('border-bottom', '3px solid #8e44ad', 'important')
          } else {
            span.style.setProperty('background-image', 'linear-gradient(#8e44ad, #8e44ad)', 'important')
            span.style.setProperty('background-position', '0 100%', 'important')
            span.style.setProperty('background-size', '100% 2px', 'important')
            span.style.setProperty('background-repeat', 'no-repeat', 'important')
            span.style.setProperty('padding-bottom', '2px', 'important')
            span.style.setProperty('border-bottom', '2px solid #8e44ad', 'important')
            span.style.removeProperty('color')
            span.style.removeProperty('background-color')
          }
        })
      }
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
}

export const toggleNodeCloze = node => {
  const cur = isNodeClozeHidden(node.uid)
  nodeOverrideMap.set(node.uid, !cur)
  applyClozeStyles()
  saveClozeState()
  requestAnimationFrame(() => {
    applyClozeStyles()
    requestAnimationFrame(applyClozeStyles)
  })
  setTimeout(applyClozeStyles, 100)
  setTimeout(applyClozeStyles, 300)
}

// 显式设置多个节点的挖空显隐状态（右键"显示挖空"/"隐藏挖空"用）
// hidden: true=隐藏挖空, false=显示挖空
export const setNodesClozeHidden = (nodeList, hidden) => {
  if (!nodeList || nodeList.length === 0) return
  nodeList.forEach(node => {
    nodeOverrideMap.set(node.uid, hidden)
  })
  applyClozeStyles()
  saveClozeState()
  requestAnimationFrame(() => {
    applyClozeStyles()
    requestAnimationFrame(applyClozeStyles)
  })
  setTimeout(applyClozeStyles, 100)
  setTimeout(applyClozeStyles, 300)
}

export const toggleAllCloze = () => {
  hiddenAll = !hiddenAll
  nodeOverrideMap.clear()
  applyClozeStyles()
  saveClozeState()
  return hiddenAll
}

// 切换当前文本编辑中选区的挖空格式
// 用 quill 内建 code 格式作为载体（已加入 formats 白名单）：
//   选中文字立即包裹 <code>，编辑器中显示紫色下划线；
//   保存时由 RichText.hideEditText 的 clozeEncode 把 <code> 转为 <span class="smm-cloze">。
// 返回 'added' / 'removed' / null（无有效选区或不在编辑态）。
export const toggleSelectionCloze = () => {
  if (!mindMapRef || !mindMapRef.richText) return null
  const rt = mindMapRef.richText
  if (!rt.showTextEdit) return null
  const quill = rt.quill
  if (!quill) return null
  let range = quill.getSelection(true)
  // 选区可能因点击悬浮工具条而丢失，回退到最近一次记录的选区
  if (!range || range.length === 0) {
    range = rt.range || null
  }
  if (!range || range.length === 0) return null
  const formats = quill.getFormat(range.index, range.length) || {}
  const isClozed = !!formats.code
  quill.formatText(
    range.index,
    range.length,
    'code',
    isClozed ? false : true,
    'user'
  )
  // 保持选区，便于连续操作 & 悬浮按钮状态刷新
  try {
    quill.setSelection(range.index, range.length, 'user')
  } catch (e) {}
  return isClozed ? 'removed' : 'added'
}

export const resetClozeState = () => {
  nodeOverrideMap.clear()
}

// 编解码工具（大纲语法转换用）
export const encodeClozeInHtml = html =>
  html.replace(/<code\b([^>]*)>([\s\S]*?)<\/code>/gi, '<span class="smm-cloze">$2</span>')

export const decodeClozeFromHtml = html =>
  html.replace(/<span class="smm-cloze">([\s\S]*?)<\/span>/g, '<code>$1</code>')

// 非编辑态全节点挖空（Ctrl+Enter 在节点未进入编辑时调用）：
//   把当前选中节点的全部文本内容包裹在 <span class="smm-cloze"> 中；
//   如果已经是富文本且已有 smm-cloze，则取消全部挖空（toggle 语义）。
// 返回 'added' / 'removed' / null（无活跃节点或根节点不挖空）。
export const clozeWholeNode = () => {
  if (!mindMapRef || !mindMapRef.renderer) return null
  const activeNodes = mindMapRef.renderer.activeNodeList
  if (!activeNodes || activeNodes.length === 0) return null
  const node = activeNodes[0]
  if (!node) return null
  // 根节点不挖空
  if (mindMapRef.renderer.root === node) return null
  let text = node.getData('text') || ''
  // 检查是否已有挖空
  const hasCloze = /<span[^>]*class=["'][^"']*smm-cloze[^"']*["'][^>]*>/.test(text)
  if (hasCloze) {
    // 取消全部挖空：移除所有 smm-cloze span 包裹，保留内部文字
    text = text.replace(
      /<span[^>]*class=["'][^"']*smm-cloze[^"']*["'][^>]*>([\s\S]*?)<\/span>/g,
      '$1'
    )
    node.setText(text)
    mindMapRef.render()
    applyClozeStyles()
    return 'removed'
  }
  // 全部挖空：把文字内容包裹在 smm-cloze span 中
  const isRichText = !!node.getData('richText')
  if (isRichText && typeof text === 'string') {
    // 富文本：提取 <p>...</p> 内的文字内容并包裹
    text = text.replace(
      /(<p[^>]*>)([\s\S]*?)(<\/p>)/gi,
      (m, open, inner, close) => open + '<span class="smm-cloze">' + inner + '</span>' + close
    )
  } else {
    // 纯文本 → 升级为富文本
    const escaped = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    text = '<p><span class="smm-cloze">' + escaped + '</span></p>'
  }
  node.setText(text, true)
  mindMapRef.render()
  applyClozeStyles()
  return 'added'
}
