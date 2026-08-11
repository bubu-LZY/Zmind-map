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
  return `你是一个思维导图背诵改写助手。请将给定节点的文字改写得更易背诵、更精炼、更好记。

## 核心原则
精简、准确、好记。不刻意增加内容，不画蛇添足。

## 改写规则（必须严格遵守）
1. 不可改变原意，必须和原节点意思完全一致
2. 改写格式：【1-4字简写】+ 精简概括。其中【】内是1-4个字的简短标签，用于快速记忆定位
3. 概括必须言简意赅：能3个字说清的不用5个字，能一句话说清的不用两句
4. 关键信息（人名、时间、地点、数字、核心概念）必须保留，但表述要精炼
5. 可以用谐音、口诀、联想、顺口溜等记忆技巧，但前提是不增加多余内容
6. 不要把一个节点拆成多段，保持单节点单段
7. 【】内的简写要能一眼看出这条内容讲什么
8. 不要添加原文没有的解释、补充或展开

## 改写示例
原文：马克思主义是由马克思、恩格斯创立并为后继者所不断发展的科学理论体系
改写：【创立】马恩创立，后继发展

原文：是关于自然、社会和人类思维发展一般规律的学说
改写：【三域规律】自然·社会·思维的一般规律

原文：是关于社会主义必然代替资本主义、最终实现共产主义的学说
改写：【替代】社代资，终达共产

原文：是关于无产阶级解放、全人类解放和每个人自由而全面发展的学说
改写：【三解放】无产阶级→全人类→个人自由全面

原文：是无产阶级政党和社会主义国家的指导思想，是指引人民创造美好生活的行动指南
改写：【指南】党和国家的指导思想，人民的行动指南

原文：实践是检验真理的唯一标准
改写：【唯一标准】实践检验真理

原文：物质是不依赖于人的意识并能为人的意识所反映的客观实在
改写：【客观实在】独立于意识，能被意识反映

## 输入格式
JSON 数组：[{"uid":"节点uid","text":"节点原文"}]

## 输出格式
严格输出 JSON 数组，不要包含任何额外文字或解释，不要使用 markdown 代码块：
[{"uid":"节点uid","text":"【简写】概括内容"}]

注意：uid 必须与输入一一对应，不可新增或删除条目。每条 text 必须以【】开头。`
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

// HTML 转义
const escapeHtml = s => {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 将改写文本构造为富文本 HTML：【】及内部内容用绿色加粗，其余为普通文本
const buildRewrittenHtml = text => {
  if (!text) return ''
  // 按 【...】 分割，【】部分绿色加粗
  return text
    .split(/(【[^】]*】)/)
    .map(part => {
      if (/^【[^】]*】$/.test(part)) {
        return `<span style="color: #00b894; font-weight: bold;">${escapeHtml(part)}</span>`
      }
      return escapeHtml(part)
    })
    .join('')
}

// 将改写结果应用到节点
// 1. 改写前的原始内容以备注(note)形式保存到节点
// 2. 改写后【简写】及括号用绿色加粗显示（富文本模式下）
const applyRewriteResult = result => {
  const map = {}
  result.forEach(item => {
    if (item.uid && item.text) map[item.uid] = item.text
  })
  const root = mindMapRef.renderer.root
  const walk = node => {
    if (map[node.uid]) {
      const rewritten = map[node.uid]
      const isRich = !!node.getData('richText')
      // 保存改写前的原始内容到备注（避免多次改写导致累积）
      const originText = extractPlainText(node.getData('text') || '').trim()
      if (originText) {
        const oldNote = node.getData('note') || ''
        const marker = '【改写前原文】'
        let newNote
        if (oldNote.includes(marker)) {
          newNote = oldNote.replace(
            new RegExp(marker + '[\\s\\S]*?(?=\\n\\n|$)'),
            marker + originText
          )
        } else {
          newNote = marker + originText + (oldNote ? '\n\n' + oldNote : '')
        }
        try {
          node.setNote(newNote)
        } catch (e) {
          console.error('[背诵改写] 设置备注失败:', e)
        }
      }
      // 设置改写后的文本：富文本模式下【】绿色加粗
      if (isRich) {
        node.setText(buildRewrittenHtml(rewritten), true)
      } else {
        node.setText(rewritten, false)
      }
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
