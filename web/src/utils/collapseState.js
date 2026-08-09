// 节点折叠状态记忆（二开功能）
// 收集所有折叠节点的 uid，持久化到 localStorage，供跨会话和局域网同步使用

let mindMapRef = null
let saveTimer = null

const COLLAPSE_KEY = 'SIMPLE_MIND_MAP_COLLAPSE_STATE'

// 收集所有折叠状态的节点 uid
const collectCollapsedUids = () => {
  if (!mindMapRef || !mindMapRef.renderer) return []
  const root = mindMapRef.renderer.root
  if (!root) return []
  const uids = []
  const walk = node => {
    const expand = node.getData('expand')
    const children = node.nodeData ? node.nodeData.children : []
    if (expand === false && children.length > 0) {
      uids.push(node.uid)
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
  return uids
}

// 保存折叠状态到 localStorage
export const saveCollapseState = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const uids = collectCollapsedUids()
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(uids))
    } catch (e) {}
    if (window.$bus) {
      window.$bus.$emit('collapseStateChanged')
    }
  }, 200)
}

// 从 localStorage 加载折叠状态并应用
export const loadCollapseState = () => {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (!raw) return
    const uids = JSON.parse(raw)
    if (!Array.isArray(uids) || uids.length === 0) return
    if (!mindMapRef || !mindMapRef.renderer) return
    const root = mindMapRef.renderer.root
    if (!root) return
    let needRender = false
    const walk = node => {
      if (uids.includes(node.uid)) {
        const children = node.nodeData ? node.nodeData.children : []
        if (children.length > 0 && node.getData('expand') !== false) {
          node.nodeData.data.expand = false
          needRender = true
        }
      }
      ;(node.children || []).forEach(walk)
    }
    walk(root)
    if (needRender) {
      mindMapRef.render()
    }
  } catch (e) {}
}

// 从 localStorage 加载并应用折叠状态
export const applyCollapseStateFromStorage = () => {
  loadCollapseState()
}

// 初始化折叠状态记忆
export const initCollapseState = mindMap => {
  mindMapRef = mindMap
  // 监听展开/折叠按钮点击
  mindMap.on('expand_btn_click', saveCollapseState)
  // 渲染结束后保存（捕获通过命令触发的折叠）
  mindMap.on('node_tree_render_end', () => {
    // 延迟保存，避免渲染过程中频繁写入
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveCollapseState, 500)
  })
  // 首次加载折叠状态
  setTimeout(loadCollapseState, 300)
}
