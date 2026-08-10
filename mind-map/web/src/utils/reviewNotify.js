// 复习计划通知逻辑：处理主进程的触发事件，按节点去重后发送飞书交互式卡片

import {
  getTodayUncompletedItems,
  getPendingReviewItems,
  getToday,
  formatDate
} from './reviewPlan'
import { getTextFromHtml } from 'simple-mind-map/src/utils'

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

// 发送飞书交互式卡片消息
async function sendFeishuCard(webhookUrl, { title, template, items }) {
  if (!window.zmindReview || !window.zmindReview.sendFeishuWebhook) return

  const elements = [
    {
      tag: 'note',
      elements: [
        { tag: 'plain_text', content: `共 ${items.length} 个节点待复习` }
      ]
    }
  ]

  items.forEach((item, i) => {
    const text = getTextFromHtml(item.nodeText || '')
    const parent = getTextFromHtml(item.parentText || '')
    const file = item.fileName || ''
    let content = `${i + 1}. **${text}**`
    if (parent) content += `\n← ${parent}`
    if (file) content += `\n📄 ${file}`
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content
      }
    })
    if (i < items.length - 1) {
      elements.push({ tag: 'hr' })
    }
  })

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
