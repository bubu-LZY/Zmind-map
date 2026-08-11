// 复习计划通知逻辑：处理主进程的触发事件，按节点去重后发送飞书交互式卡片

import {
  getTodayUncompletedItems,
  getPendingReviewItems,
  getToday,
  formatDate
} from './reviewPlan'
import { getTextFromHtml } from 'simple-mind-map/src/utils'

// 缓存当前 mindMap 实例
let _mindMap = null

// 同步复习配置到主进程
export function syncReviewConfigToMain(config) {
  if (window.zmindReview && window.zmindReview.syncReviewConfig) {
    window.zmindReview.syncReviewConfig({
      forgotTime: config.reviewForgotTime || '23:59',
      reminderTime: config.reviewReminderTime || '20:00',
      webhookUrl: config.reviewWebhookUrl || '',
      backupDir: config.reviewBackupDir || ''
    })
  }
}

// 初始化复习触发监听
export function initReviewTriggerHandler(mindMap, store) {
  _mindMap = mindMap
  if (!window.zmindReview || !window.zmindReview.onReviewTrigger) return

  window.zmindReview.onReviewTrigger(async (data) => {
    const { type, date } = data
    const webhookUrl = store.state.localConfig.reviewWebhookUrl || ''

    if (type === 'forgot') {
      await handleForgotReview(date, webhookUrl, mindMap, store)
    } else if (type === 'reminder') {
      await handleReminderReview(date, webhookUrl, mindMap, store)
    } else if (type === 'missed') {
      await handleMissedReview(date, webhookUrl, store)
    }
  })

  // 启动时检查错过的复习
  if (window.zmindReview.checkMissedReviews) {
    setTimeout(() => {
      window.zmindReview.checkMissedReviews()
    }, 3000)
  }

  // 启动时检查定时提醒：若已过今日定时提醒时间且未推过，补推（避免错过定时推送）
  setTimeout(() => {
    checkStartupReminder(store)
  }, 3500)
}

// 忘记复习处理
async function handleForgotReview(date, webhookUrl, mindMap, store) {
  const items = dedupeByNode(getTodayUncompletedItems())
  if (items.length === 0) return

  const dateDisplay = formatDate(date)

  // 系统通知
  if (window.zmindReview && window.zmindReview.showNotification) {
    window.zmindReview.showNotification(
      '您忘记复习了',
      `${dateDisplay}：您有 ${items.length} 个节点忘记复习了`
    )
  }

  // 飞书webhook 卡片
  if (webhookUrl) {
    await sendFeishuCard(webhookUrl, {
      title: `您忘记复习了 - ${dateDisplay}`,
      template: 'red',
      items
    })
  }
}

// 定时提醒处理（含今日去重，避免重启后重复推送）
async function handleReminderReview(date, webhookUrl, mindMap, store) {
  const reminderKey = 'ZMIND_REVIEW_LAST_REMINDER'
  if (localStorage.getItem(reminderKey) === date) return
  const items = dedupeByNode(getTodayUncompletedItems())
  if (items.length === 0) return
  localStorage.setItem(reminderKey, date)

  const dateDisplay = formatDate(date)

  // 飞书webhook 卡片
  if (webhookUrl) {
    await sendFeishuCard(webhookUrl, {
      title: `今日待复习 ${dateDisplay}`,
      template: 'blue',
      items
    })
  }

  // 系统通知
  if (window.zmindReview && window.zmindReview.showNotification) {
    window.zmindReview.showNotification(
      `今日待复习 ${dateDisplay}`,
      `您有 ${items.length} 个节点需要复习`
    )
  }
}

// 启动时检查定时提醒：仅在已过今日定时提醒时间且今日未推过时补推，未到时间不推（避免重复推送）
async function checkStartupReminder(store) {
  const reminderTime = store.state.localConfig.reviewReminderTime || '20:00'
  const now = new Date()
  const nowStr =
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0')
  // 未到定时提醒时间，不推，等定时器到点触发
  if (nowStr < reminderTime) return
  // 已过时间，补推（handleReminderReview 内部有今日去重）
  const webhookUrl = store.state.localConfig.reviewWebhookUrl || ''
  await handleReminderReview(getToday(), webhookUrl, null, store)
}

// 错过复习补推处理
async function handleMissedReview(date, webhookUrl, store) {
  const items = dedupeByNode(getPendingReviewItems())
  if (items.length === 0) return

  // 检查今天是否已经触发过补推
  const lastMissedKey = 'ZMIND_REVIEW_LAST_MISSED'
  const today = getToday()
  const lastMissed = localStorage.getItem(lastMissedKey)
  if (lastMissed === today) return
  localStorage.setItem(lastMissedKey, today)

  const dateDisplay = formatDate(date)

  // 系统通知
  if (window.zmindReview && window.zmindReview.showNotification) {
    window.zmindReview.showNotification(
      '您忘记复习了',
      `${dateDisplay}：您有 ${items.length} 个节点忘记复习了`
    )
  }

  // 飞书webhook 卡片
  if (webhookUrl) {
    await sendFeishuCard(webhookUrl, {
      title: `您忘记复习了 - ${dateDisplay}`,
      template: 'red',
      items
    })
  }
}

// 按节点去重：同一节点（nodeUid）即使有多个周期落在今天，也只保留一条（取最早到期的周期）
function dedupeByNode(items) {
  const map = new Map()
  items.forEach(item => {
    const key = item.nodeUid || item.id
    if (!map.has(key)) {
      map.set(key, item)
    }
  })
  return Array.from(map.values())
}

// 递归查找节点（按 uid）
function findNodeByUid(node, uid) {
  if (!node) return null
  if (node.uid === uid) return node
  try {
    if (node.getData && node.getData('uid') === uid) return node
  } catch (e) {}
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByUid(child, uid)
      if (found) return found
    }
  }
  return null
}

// 转义 markdown 表格单元格内的特殊字符（| 和换行）
function escapeTableCell(text) {
  if (!text) return ''
  return String(text)
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\|/g, '\\|')
}

// 发送飞书交互式卡片消息（markdown 表格形式）
// 表格列：序号 | 被复习节点的上级标题 | 被复习节点同级所有内容 | 艾宾浩斯复习节点
// 上级标题相同的行合并显示（同组只在首行显示上级标题，其余留空）
async function sendFeishuCard(webhookUrl, { title, template, items }) {
  if (!window.zmindReview || !window.zmindReview.sendFeishuWebhook) return

  // 收集每个 item 的同级节点信息（实时从当前 mindMap 获取）
  const rows = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const nodeText = getTextFromHtml(item.nodeText || '')
    let parentText = getTextFromHtml(item.parentText || '')
    let siblings = []
    // 尝试从当前 mindMap 获取同级节点（父节点的所有子节点）
    if (_mindMap && _mindMap.renderer && _mindMap.renderer.root && item.nodeUid) {
      try {
        const targetNode = findNodeByUid(_mindMap.renderer.root, item.nodeUid)
        if (targetNode && targetNode.parent) {
          const parentNode = targetNode.parent
          const pText = getTextFromHtml(parentNode.getData('text') || '')
          if (pText) parentText = pText
          siblings = (parentNode.children || [])
            .map(c => getTextFromHtml(c.getData('text') || ''))
            .filter(t => t)
        }
      } catch (e) {
        console.error('[飞书推送] 获取同级节点失败:', e)
      }
    }
    // 兜底：未获取到同级时至少包含自身
    if (siblings.length === 0 && nodeText) {
      siblings = [nodeText]
    }
    rows.push({
      parentText,
      siblings,
      nodeText
    })
  }

  // 构造 markdown 表格
  let table = '| 序号 | 被复习节点的上级标题 | 被复习节点同级所有内容 | 艾宾浩斯复习节点 |\n'
  table += '| --- | --- | --- | --- |\n'
  let lastGroupKey = ''
  rows.forEach((row, idx) => {
    // 按 parentText 分组，同组上级标题合并（首行显示，其余留空）
    const groupKey = row.parentText
    const parentCell = groupKey === lastGroupKey ? '' : escapeTableCell(row.parentText)
    lastGroupKey = groupKey
    // 同级所有内容：用 <br> 连接，复习节点本身加粗标记
    const siblingsCell = row.siblings
      .map(s => escapeTableCell(s === row.nodeText ? `**${s}**` : s))
      .join('<br>')
    table += `| ${idx + 1} | ${parentCell} | ${siblingsCell} | ${escapeTableCell(row.nodeText)} |\n`
  })

  const elements = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: table
      }
    },
    {
      tag: 'note',
      elements: [
        { tag: 'plain_text', content: `共 ${items.length} 个节点待复习` }
      ]
    }
  ]

  const payload = {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: title },
        template: template || 'red'
      },
      elements
    }
  }

  await window.zmindReview.sendFeishuWebhook(webhookUrl, payload)
}

// 备份复习文件
export async function backupReviewFile(srcPath, backupDir) {
  if (!window.zmindReview || !window.zmindReview.backupFile) return false
  if (!backupDir) {
    // 使用默认目录
    if (window.zmindReview.getAppDataPath) {
      backupDir = await window.zmindReview.getAppDataPath()
      backupDir = backupDir + '/review-backup'
    }
  }
  const result = await window.zmindReview.backupFile(srcPath, backupDir)
  return result.success
}

// 清理旧的已完成备份文件（3个月前）
export async function cleanupOldBackups(backupDir) {
  if (!backupDir) return
  try {
    const fs = window.zmindFs
    if (!fs || !fs.listDir) return
    const entries = await fs.listDir(backupDir)
    const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
    for (const entry of entries) {
      if (entry.isDir || !entry.mtime) continue
      if (entry.mtime < threeMonthsAgo) {
        if (fs.remove) {
          await fs.remove(entry.path)
        }
      }
    }
  } catch (e) {
    console.error('cleanup old backups error:', e)
  }
}

// 测试推送：发送复习计划交互式卡片（用今日待复习数据，为空则用示例），便于测试飞书 webhook 是否能正常接收卡片
export async function sendTestReviewCard(webhookUrl) {
  const items = dedupeByNode(getTodayUncompletedItems())
  const testItems =
    items.length > 0
      ? items
      : [
          {
            nodeText: '示例：复习任务标题',
            parentText: '示例父节点',
            fileName: '示例文件.smm'
          }
        ]
  await sendFeishuCard(webhookUrl, {
    title:
      items.length > 0
        ? `测试推送 - 今日待复习 ${formatDate(getToday())}`
        : '测试推送 - 飞书卡片示例',
    template: 'blue',
    items: testItems
  })
}
