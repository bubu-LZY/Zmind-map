// AI 智能挖空模块（二开功能）
// 通过 AI 分析思维导图内容，自动选择关键词进行挖空
// 支持保存多个挖空版本，便于切换不同挖空方案

import Ai from './ai'
import { applyClozeStyles } from './cloze'

let mindMapRef = null

const VERSIONS_STORAGE_KEY = 'smm_cloze_versions'

// 初始化
export const initAiCloze = mindMap => {
  mindMapRef = mindMap
}

// 从富文本 HTML 中提取纯文本
const extractPlainText = html => {
  if (typeof html !== 'string') return ''
  if (!html.includes('<')) return html
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

// 遍历思维导图，提取所有节点信息
export const extractNodes = () => {
  if (!mindMapRef || !mindMapRef.renderer) return []
  const root = mindMapRef.renderer.root
  if (!root) return []
  const nodes = []
  const walk = (node, level) => {
    const text = extractPlainText(node.getData('text') || '')
    if (text.trim()) {
      nodes.push({
        uid: node.uid,
        level,
        text: text.trim()
      })
    }
    ;(node.children || []).forEach(child => walk(child, level + 1))
  }
  walk(root, 0)
  return nodes
}

// 构建智能挖空规则的 system prompt（保守策略，保留上下文线索）
const buildSmartSystemPrompt = () => {
  return `你是一个思维导图智能挖空助手。请根据思维导图节点内容，智能选择适合挖空（隐藏）的关键词，用于辅助记忆和复习。

## 核心原则
挖空后，剩余的文字必须能让用户通过上下文推断出被挖空的内容。挖空的目的是帮助记忆，而不是制造无法回答的谜题。

## 挖空规则
1. 只挖空有实际意义的内容词：名词、专业术语、关键数字、重要概念、人名、地名、日期
2. 不挖空功能词：的、了、是、在、和、与、或、等语法词
3. 根节点（level 为 0）不挖空
4. 挖空的文本必须与节点原文完全匹配，包括标点符号
5. 跳过文本过短（少于 2 个字）的节点
6. 如果节点内容不适合挖空（如纯编号、符号），则跳过
7. 同一个关键词在同一个节点中只出现一次

## 保留可推测性规则（最重要）
1. "标签：值"或"标签：值"格式（如"唯一特性：客观实在性"），只挖空"值"部分，保留"标签"作为提示。绝不能把冒号前后都挖空。
2. 一句话中的核心语义成分（主语、谓语、宾语）不能全部挖空，至少保留一个让句子有意义。
3. 如果两个词在语义上互补或并列（如"物质世界"和"人类认识"），只挖空其中一个，保留另一个作为线索。
4. 挖空后，用户读到剩余文字应该能大致猜出被隐藏的内容是什么类别、什么方向。
5. 如果挖空某个词后会导致整句话失去理解线索，则不要挖空该词。

## 挖空数量规则
根据节点文本长度和内容智能决定挖空数量：
- 短文本（10字以内）：最多挖空 1 个关键词
- 中文本（10-25字）：最多挖空 2 个关键词，且两个词不能是句子的核心骨架
- 长文本（25字以上）：最多挖空 3 个关键词，需确保挖空后仍有足够上下文
- 无论多长，挖空后保留的文字必须多于被挖空的文字

## 返回格式（必须严格遵守）
你必须返回一个 JSON 对象，赋值给变量 cloze_result，格式如下：

cloze_result = {"results": [{"uid": "节点uid字符串", "clozes": ["挖空片段1"]}, {"uid": "另一个节点uid", "clozes": ["挖空片段1", "挖空片段2"]}]}

要求：
1. 返回内容必须是合法的 JSON，外层用 {"results": [...]} 包裹
2. 不要包含任何解释文字、markdown 标记或代码块标记
3. uid 必须与输入中的 uid 完全一致
4. clozes 数组中的每个文本片段必须与该节点原文中的文字完全匹配
5. 如果没有任何节点需要挖空，返回 {"results": []}

示例返回：
{"results": [{"uid": "abc123", "clozes": ["客观实在性"]}, {"uid": "def456", "clozes": ["叶绿体"]}, {"uid": "ghi789", "clozes": ["光合作用", " ATP"]}]}

示例说明：
- "唯一特性：客观实在性" → 只挖空"客观实在性"，保留"唯一特性"作为提示
- "实践推动物质世界与人类认识的共同发展" → 只挖空"共同发展"，保留"实践推动物质世界与人类的"作为线索
- "光合作用是植物利用光能将二氧化碳和水转化为有机物和ATP的过程" → 可挖空"二氧化碳"和"ATP"，因为剩余文字仍有充足线索`
}

// 构建激进挖空规则的 system prompt（激进策略，尽可能多挖空关键词）
const buildAggressiveSystemPrompt = () => {
  return `你是一个思维导图激进挖空助手。请根据思维导图节点内容，尽可能多地选择关键词进行挖空（隐藏），用于高强度的记忆测试和复习。

## 核心原则
尽可能多地挖空节点中的关键词，制造高难度的回忆挑战。挖空的目标是让用户通过主动回忆来加深记忆。

## 挖空规则
1. 挖空所有有实际意义的内容词：名词、动词、专业术语、关键数字、重要概念、人名、地名、日期、形容词
2. 不挖空功能词：的、了、是、在、和、与、或、等语法词
3. 根节点（level 为 0）不挖空
4. 挖空的文本必须与节点原文完全匹配，包括标点符号
5. 跳过文本过短（少于 2 个字）的节点
6. 如果节点内容不适合挖空（如纯编号、符号），则跳过
7. 同一个关键词在同一个节点中只出现一次

## 激进挖空策略
1. 只要是一个独立的意义单元（词语、短语），就可以挖空，不必保留过多线索
2. "标签：值"格式，可以同时挖空"标签"和"值"中的关键词
3. 一句话中可以挖空多个语义成分，甚至主语、谓语、宾语都可以同时挖空
4. 不需要保证挖空后用户一定能推断出答案，高难度是预期效果
5. 并列的多个概念可以全部挖空

## 挖空数量规则
- 短文本（10字以内）：挖空 1-2 个关键词
- 中文本（10-25字）：挖空 2-4 个关键词
- 长文本（25字以上）：挖空 3-6 个关键词，尽可能多地挖空有意义的内容词
- 不限制挖空后保留的文字比例

## 返回格式（必须严格遵守）
你必须返回一个 JSON 对象，赋值给变量 cloze_result，格式如下：

cloze_result = {"results": [{"uid": "节点uid字符串", "clozes": ["挖空片段1"]}, {"uid": "另一个节点uid", "clozes": ["挖空片段1", "挖空片段2"]}]}

要求：
1. 返回内容必须是合法的 JSON，外层用 {"results": [...]} 包裹
2. 不要包含任何解释文字、markdown 标记或代码块标记
3. uid 必须与输入中的 uid 完全一致
4. clozes 数组中的每个文本片段必须与该节点原文中的文字完全匹配
5. 如果没有任何节点需要挖空，返回 {"results": []}

示例返回：
{"results": [{"uid": "abc123", "clozes": ["唯一特性", "客观实在性"]}, {"uid": "def456", "clozes": ["实践", "物质世界", "人类认识", "共同发展"]}]}

示例说明：
- "唯一特性：客观实在性" → 激进挖空"唯一特性"和"客观实在性"
- "实践推动物质世界与人类认识的共同发展" → 激进挖空"实践"、"物质世界"、"人类认识"、"共同发展"`
}

// 构建用户消息
const buildUserMessage = (nodes, mode) => {
  const modeLabel = mode === 'aggressive' ? 'AI激进挖空' : 'AI智能挖空'
  return `请对以下思维导图节点进行${modeLabel}，返回 JSON 格式结果：

${JSON.stringify(nodes)}

请严格按照系统提示中的格式返回 cloze_result JSON 对象。`
}

// 解析 AI 返回的 JSON
const parseAiResponse = content => {
  if (!content || typeof content !== 'string') return []
  let text = content.trim()
  // 移除可能的 markdown 代码块标记
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  // 移除可能的变量赋值前缀（如 "cloze_result = ..."）
  text = text.replace(/^[a-zA-Z_]\w*\s*=\s*/, '')
  try {
    let parsed = JSON.parse(text)
    // 支持 {"results": [...]} 格式和直接数组格式
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.results)) return parsed.results
    return []
  } catch (e) {
    // 尝试提取 JSON 对象
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0])
        if (parsed && Array.isArray(parsed.results)) return parsed.results
      } catch (e2) {}
    }
    // 尝试提取 JSON 数组
    const arrMatch = text.match(/\[[\s\S]*\]/)
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0])
        if (Array.isArray(parsed)) return parsed
      } catch (e3) {}
    }
    console.error('解析AI挖空响应失败:', e, text)
    return []
  }
}

// 在 DOM 元素中查找并包裹文本片段
const wrapTextInElement = (el, searchText) => {
  if (!searchText || !el) return
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      // 跳过已在 smm-cloze 内的文本
      let parent = node.parentNode
      while (parent && parent !== el) {
        if (parent.classList && parent.classList.contains('smm-cloze')) {
          return NodeFilter.FILTER_REJECT
        }
        parent = parent.parentNode
      }
      return node.nodeValue && node.nodeValue.includes(searchText)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    }
  })
  const textNodes = []
  let current
  while ((current = walker.nextNode())) {
    textNodes.push(current)
  }
  textNodes.forEach(textNode => {
    const text = textNode.nodeValue
    const parts = text.split(searchText)
    if (parts.length <= 1) return
    const parent = textNode.parentNode
    const fragment = document.createDocumentFragment()
    parts.forEach((part, i) => {
      if (i > 0) {
        const span = document.createElement('span')
        span.className = 'smm-cloze'
        span.textContent = searchText
        fragment.appendChild(span)
      }
      if (part) {
        fragment.appendChild(document.createTextNode(part))
      }
    })
    parent.replaceChild(fragment, textNode)
  })
}

// 清除单个节点的所有挖空标记
const clearNodeCloze = node => {
  let text = node.getData('text') || ''
  if (typeof text !== 'string' || !text.includes('smm-cloze')) return
  text = text.replace(
    /<span[^>]*class=["'][^"']*smm-cloze[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    '$1'
  )
  node.setText(text, !!node.getData('richText'))
}

// 对单个节点应用挖空
const applyClozeToNode = (node, clozes) => {
  if (!clozes || clozes.length === 0) return
  let text = node.getData('text') || ''
  if (typeof text !== 'string' || !text.trim()) return

  // 先清除已有的挖空标记
  text = text.replace(
    /<span[^>]*class=["'][^"']*smm-cloze[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    '$1'
  )

  const isRichText = !!node.getData('richText')
  if (isRichText && text.includes('<')) {
    // 富文本：用 DOM 操作
    const div = document.createElement('div')
    div.innerHTML = text
    clozes.forEach(cloze => wrapTextInElement(div, cloze))
    text = div.innerHTML
  } else {
    // 纯文本：直接替换
    let plainText = text
    clozes.forEach(cloze => {
      const escaped = cloze.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c])
      plainText = plainText.split(cloze).join('<span class="smm-cloze">' + escaped + '</span>')
    })
    text = '<p>' + plainText + '</p>'
  }
  node.setText(text, true)
}

// 从指定节点列表提取信息
const extractNodesFromList = nodeList => {
  if (!nodeList || nodeList.length === 0) return []
  // 构建层级映射：通过遍历整棵树找到每个节点的 level
  const levelMap = {}
  if (mindMapRef && mindMapRef.renderer && mindMapRef.renderer.root) {
    const walkLevel = (node, level) => {
      levelMap[node.uid] = level
      ;(node.children || []).forEach(child => walkLevel(child, level + 1))
    }
    walkLevel(mindMapRef.renderer.root, 0)
  }
  return nodeList
    .map(node => {
      const text = extractPlainText(node.getData('text') || '')
      if (!text.trim()) return null
      return {
        uid: node.uid,
        level: levelMap[node.uid] !== undefined ? levelMap[node.uid] : 1,
        text: text.trim()
      }
    })
    .filter(Boolean)
}

// 调用 AI 获取挖空结果（不应用，仅返回 clozeList）
const callAiForCloze = (config, nodes, mode, onProgress) => {
  return new Promise((resolve, reject) => {
    const ai = new Ai()
    ai.init(config)
    const systemPrompt = mode === 'aggressive' ? buildAggressiveSystemPrompt() : buildSmartSystemPrompt()
    ai.request(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserMessage(nodes, mode) }
        ]
      },
      content => {
        if (onProgress) onProgress(content)
      },
      content => {
        resolve(parseAiResponse(content))
      },
      error => {
        reject(error)
      }
    )
  })
}

// 将挖空结果应用到思维导图节点
const applyClozeList = clozeList => {
  const clozeMap = {}
  clozeList.forEach(item => {
    if (item.uid && Array.isArray(item.clozes)) {
      clozeMap[item.uid] = item.clozes
    }
  })
  const root = mindMapRef.renderer.root
  const walk = node => {
    if (clozeMap[node.uid]) {
      applyClozeToNode(node, clozeMap[node.uid])
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
  mindMapRef.render()
  setTimeout(() => applyClozeStyles(), 100)
}

// 核心挖空执行：传入节点信息数组，调用 AI 并应用挖空
// mode: 'smart'（智能保守）或 'aggressive'（激进）
// 智能挖空返回空结果时，自动用激进挖空兜底
const doSmartCloze = async (config, nodes, onProgress, mode = 'smart') => {
  if (!nodes || nodes.length === 0) {
    throw new Error('没有可挖空的节点')
  }
  let clozeList = await callAiForCloze(config, nodes, mode, onProgress)
  // 智能挖空返回空结果时，自动用激进挖空兜底
  if (clozeList.length === 0 && mode === 'smart') {
    clozeList = await callAiForCloze(config, nodes, 'aggressive', onProgress)
  }
  if (clozeList.length === 0) {
    throw new Error('AI 未能生成有效的挖空内容，请重试')
  }
  applyClozeList(clozeList)
  return clozeList.length
}

// 对整个思维导图进行 AI 智能挖空
// 如果有选中的节点，则只对选中节点挖空；否则对整张图挖空
// config: { api, key, model }
export const smartCloze = (config, onProgress) => {
  if (!mindMapRef || !mindMapRef.renderer) {
    return Promise.reject(new Error('思维导图未初始化'))
  }
  // 检查是否有选中的节点，如果有则只对选中节点挖空
  const activeNodes = mindMapRef.renderer.activeNodeList || []
  if (activeNodes.length > 0) {
    const nodes = extractNodesFromList(activeNodes)
    if (nodes.length > 0) {
      return doSmartCloze(config, nodes, onProgress, 'smart')
    }
  }
  // 没有选中节点时，对整个思维导图挖空
  const nodes = extractNodes()
  if (nodes.length === 0) {
    return Promise.reject(new Error('思维导图为空，无法挖空'))
  }
  return doSmartCloze(config, nodes, onProgress, 'smart')
}

// 对指定节点进行 AI 智能挖空（右键菜单/框选节点用）
// nodeList: 思维导图节点对象数组
export const smartClozeNodes = (config, nodeList, onProgress) => {
  if (!mindMapRef || !mindMapRef.renderer) {
    return Promise.reject(new Error('思维导图未初始化'))
  }
  if (!nodeList || nodeList.length === 0) {
    return Promise.reject(new Error('未选择任何节点'))
  }
  const nodes = extractNodesFromList(nodeList)
  if (nodes.length === 0) {
    return Promise.reject(new Error('选中的节点没有可挖空的文本内容'))
  }
  return doSmartCloze(config, nodes, onProgress, 'smart')
}

// 对整个思维导图进行 AI 激进挖空
// 如果有选中的节点，则只对选中节点挖空；否则对整张图挖空
export const aggressiveCloze = (config, onProgress) => {
  if (!mindMapRef || !mindMapRef.renderer) {
    return Promise.reject(new Error('思维导图未初始化'))
  }
  const activeNodes = mindMapRef.renderer.activeNodeList || []
  if (activeNodes.length > 0) {
    const nodes = extractNodesFromList(activeNodes)
    if (nodes.length > 0) {
      return doSmartCloze(config, nodes, onProgress, 'aggressive')
    }
  }
  const nodes = extractNodes()
  if (nodes.length === 0) {
    return Promise.reject(new Error('思维导图为空，无法挖空'))
  }
  return doSmartCloze(config, nodes, onProgress, 'aggressive')
}

// 对指定节点进行 AI 激进挖空（右键菜单/框选节点用）
export const aggressiveClozeNodes = (config, nodeList, onProgress) => {
  if (!mindMapRef || !mindMapRef.renderer) {
    return Promise.reject(new Error('思维导图未初始化'))
  }
  if (!nodeList || nodeList.length === 0) {
    return Promise.reject(new Error('未选择任何节点'))
  }
  const nodes = extractNodesFromList(nodeList)
  if (nodes.length === 0) {
    return Promise.reject(new Error('选中的节点没有可挖空的文本内容'))
  }
  return doSmartCloze(config, nodes, onProgress, 'aggressive')
}

// 清除所有节点的挖空标记
export const clearAllCloze = () => {
  if (!mindMapRef || !mindMapRef.renderer) return 0
  const root = mindMapRef.renderer.root
  if (!root) return 0
  let count = 0
  const walk = node => {
    const text = node.getData('text') || ''
    if (typeof text === 'string' && text.includes('smm-cloze')) {
      clearNodeCloze(node)
      count++
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
  if (count > 0) {
    mindMapRef.render()
    setTimeout(() => applyClozeStyles(), 100)
  }
  return count
}

// ==================== 挖空版本管理 ====================

// 获取当前挖空状态（uid -> clozes 映射）
export const getCurrentClozeState = () => {
  if (!mindMapRef || !mindMapRef.renderer) return {}
  const root = mindMapRef.renderer.root
  if (!root) return {}
  const state = {}
  const walk = node => {
    const text = node.getData('text') || ''
    if (typeof text === 'string' && text.includes('smm-cloze')) {
      const div = document.createElement('div')
      div.innerHTML = text
      const clozeEls = div.querySelectorAll('.smm-cloze')
      if (clozeEls.length > 0) {
        state[node.uid] = Array.from(clozeEls).map(el => el.textContent)
      }
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
  return state
}

// 获取所有保存的挖空版本
export const getClozeVersions = () => {
  try {
    const raw = localStorage.getItem(VERSIONS_STORAGE_KEY)
    if (!raw) return []
    const versions = JSON.parse(raw)
    return Array.isArray(versions) ? versions : []
  } catch (e) {
    return []
  }
}

// 保存当前挖空状态为新版本
export const saveClozeVersion = name => {
  const state = getCurrentClozeState()
  const versions = getClozeVersions()
  const version = {
    id: 'clz_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    name: name || `版本 ${versions.length + 1}`,
    timestamp: Date.now(),
    clozes: state
  }
  versions.push(version)
  localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(versions))
  return version
}

// 加载某个挖空版本
export const loadClozeVersion = versionId => {
  const versions = getClozeVersions()
  const version = versions.find(v => v.id === versionId)
  if (!version || !version.clozes) return false
  // 先清除所有现有挖空
  clearAllCloze()
  // 应用版本中的挖空
  if (!mindMapRef || !mindMapRef.renderer) return false
  const root = mindMapRef.renderer.root
  if (!root) return false
  const walk = node => {
    if (version.clozes[node.uid]) {
      applyClozeToNode(node, version.clozes[node.uid])
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
  mindMapRef.render()
  setTimeout(() => applyClozeStyles(), 100)
  return true
}

// 删除某个挖空版本
export const deleteClozeVersion = versionId => {
  const versions = getClozeVersions()
  const filtered = versions.filter(v => v.id !== versionId)
  localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(filtered))
  return filtered
}
