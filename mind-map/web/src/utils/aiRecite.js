// AI 背诵改写模块（二开功能）
// 对选中的节点调用 AI 进行背诵改写，只改写文字，不新增/删除节点

import Ai from './ai'

let mindMapRef = null
let currentAiInstance = null

// 初始化，注入 mindMap 实例
export const initAiRecite = mindMap => {
  mindMapRef = mindMap
}

// 停止当前正在进行的 AI 背诵改写请求
export const stopAiRecite = () => {
  if (currentAiInstance) {
    currentAiInstance.stop()
    currentAiInstance = null
  }
}

// 从富文本 HTML 中提取纯文本
const extractPlainText = html => {
  if (typeof html !== 'string') return ''
  if (!html.includes('<')) return html
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

// 构建背诵改写 system prompt
const buildSystemPrompt = () => {
  return `你是一个思维导图背诵改写助手。请将给定节点的文字改写得更易背诵、更易理解。

## 改写规则（必须严格遵守）
1. 不可改变原节点的意思，必须和原节点意思、本意完全一致
2. 尽可能改写得更易背诵、更易理解
3. 改写尽可能言简意赅
4. 对应节点不可再延续新增多个子节点（即不要把一个节点拆成多段，保持单节点单段文字）
5. 不可随意删除原节点的重要信息

## 输入格式
JSON 数组：[{"uid":"节点uid","text":"节点原文"}]

## 输出格式
严格输出 JSON 数组，不要包含任何额外文字或解释：
[{"uid":"节点uid","text":"改写后的文字"}]

注意：uid 必须与输入一一对应，不可新增或删除条目。`
}

// 调用 AI 获取改写结果
const callAiForRewrite = (config, nodes) => {
  return new Promise((resolve, reject) => {
    const ai = new Ai()
    ai.init(config)
    currentAiInstance = ai
    ai.request(
      {
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          {
            role: 'user',
            content: JSON.stringify(
              nodes.map(n => ({ uid: n.uid, text: n.text }))
            )
          }
        ]
      },
      () => {},
      content => {
        try {
          const match = content.match(/\[[\s\S]*\]/)
          const list = JSON.parse(match ? match[0] : content)
          if (!Array.isArray(list)) {
            throw new Error('返回不是数组')
          }
          resolve(list)
        } catch (e) {
          reject(new Error('AI 返回格式解析失败'))
        }
      },
      error => {
        reject(error)
      }
    )
  })
}

// 将改写结果应用到节点
const applyRewriteResult = result => {
  const map = {}
  result.forEach(item => {
    if (item.uid && item.text) map[item.uid] = item.text
  })
  const root = mindMapRef.renderer.root
  const walk = node => {
    if (map[node.uid]) {
      node.setText(map[node.uid], !!node.getData('richText'))
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
  mindMapRef.render()
}

// 对指定节点进行 AI 背诵改写
export const reciteRewriteNodes = async (config, nodeList) => {
  if (!mindMapRef || !mindMapRef.renderer) {
    throw new Error('思维导图未初始化')
  }
  if (!nodeList || nodeList.length === 0) {
    throw new Error('未选择任何节点')
  }
  const nodes = nodeList
    .filter(n => !n.isRoot && !n.isGeneralization)
    .map(n => ({
      uid: n.uid,
      text: extractPlainText(n.getData('text') || '').trim()
    }))
    .filter(n => n.text)
  if (nodes.length === 0) {
    throw new Error('选中的节点没有可改写的文本')
  }
  const result = await callAiForRewrite(config, nodes)
  if (!result || result.length === 0) {
    throw new Error('AI 未能生成改写结果，请重试')
  }
  applyRewriteResult(result)
  return result.length
}
