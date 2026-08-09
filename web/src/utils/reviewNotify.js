// 复习计划通知逻辑：处理主进程的触发事件，生成图片，发送飞书webhook

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
}

// 忘记复习处理
async function handleForgotReview(date, webhookUrl, mindMap, store) {
  const items = getTodayUncompletedItems()
  if (items.length === 0) return

  const dateDisplay = formatDate(date)

  // 系统通知
  if (window.zmindReview && window.zmindReview.showNotification) {
    window.zmindReview.showNotification(
      '您忘记复习了',
      `${dateDisplay}：您有 ${items.length} 个节点忘记复习了`
    )
  }

  // 飞书webhook
  if (webhookUrl) {
    await sendFeishuText(webhookUrl, {
      title: `您忘记复习了 - ${dateDisplay}`,
      items
    })
  }
}

// 定时提醒处理
async function handleReminderReview(date, webhookUrl, mindMap, store) {
  const items = getTodayUncompletedItems()
  if (items.length === 0) return

  const dateDisplay = formatDate(date)

  // 尝试生成思维导图图片
  let imageBase64 = null
  try {
    imageBase64 = await generateReviewImage(mindMap, items, dateDisplay)
  } catch (e) {
    console.error('generate review image error:', e)
  }

  // 飞书webhook
  if (webhookUrl) {
    if (imageBase64) {
      await sendFeishuImage(webhookUrl, imageBase64, `今日待复习 ${dateDisplay}`)
    } else {
      await sendFeishuText(webhookUrl, {
        title: `今日待复习 ${dateDisplay}`,
        items
      })
    }
  }

  // 系统通知
  if (window.zmindReview && window.zmindReview.showNotification) {
    window.zmindReview.showNotification(
      `今日待复习 ${dateDisplay}`,
      `您有 ${items.length} 个节点需要复习`
    )
  }
}

// 错过复习补推处理
async function handleMissedReview(date, webhookUrl, store) {
  const items = getPendingReviewItems(date)
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

  // 飞书webhook
  if (webhookUrl) {
    await sendFeishuText(webhookUrl, {
      title: `您忘记复习了 - ${dateDisplay}`,
      items
    })
  }
}

// 生成复习思维导图图片
async function generateReviewImage(mindMap, items, dateDisplay) {
  if (!mindMap) return null

  // 构建合并的思维导图数据
  const rootData = {
    data: { text: `今日待复习 ${dateDisplay}` },
    children: []
  }

  // 按文件分组
  const fileGroups = {}
  items.forEach(item => {
    const fileKey = item.fileName || '未分类'
    if (!fileGroups[fileKey]) {
      fileGroups[fileKey] = []
    }
    fileGroups[fileKey].push(item)
  })

  // 构建树结构
  Object.keys(fileGroups).forEach(fileName => {
    const fileNode = {
      data: { text: fileName },
      children: []
    }
    fileGroups[fileName].forEach(item => {
      const parentText = getTextFromHtml(item.parentText || '')
      const nodeText = getTextFromHtml(item.nodeText || '')
      if (parentText) {
        // 查找是否已有相同父节点的分组
        let parentNode = fileNode.children.find(c => c.data.text === parentText)
        if (!parentNode) {
          parentNode = {
            data: { text: parentText },
            children: []
          }
          fileNode.children.push(parentNode)
        }
        parentNode.children.push({
          data: { text: nodeText },
          children: []
        })
      } else {
        fileNode.children.push({
          data: { text: nodeText },
          children: []
        })
      }
    })
    rootData.children.push(fileNode)
  })

  // 创建临时隐藏的 MindMap 实例来生成图片
  return new Promise((resolve) => {
    try {
      const MindMap = require('simple-mind-map').default
      const tempDiv = document.createElement('div')
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      tempDiv.style.top = '0'
      tempDiv.style.width = '1200px'
      tempDiv.style.height = '800px'
      document.body.appendChild(tempDiv)

      const tempMindMap = new MindMap({
        el: tempDiv,
        data: rootData,
        fit: true,
        layout: 'logicalStructure',
        theme: 'fresh-green',
        nodeTextEditZIndex: 1000,
        enableAutoEnterTextEditWhenKeydown: false
      })

      tempMindMap.on('node_tree_render_end', () => {
        setTimeout(() => {
          try {
            const png = tempMindMap.export('png', false, `今日待复习 ${dateDisplay}`)
            tempMindMap.destroy()
            document.body.removeChild(tempDiv)

            // 转换为 base64
            const base64 = png.replace(/^data:image\/png;base64,/, '')
            resolve(base64)
          } catch (e) {
            console.error('export error:', e)
            try { tempMindMap.destroy() } catch (e2) {}
            try { document.body.removeChild(tempDiv) } catch (e2) {}
            resolve(null)
          }
        }, 500)
      })

      // 超时保护
      setTimeout(() => {
        try { tempMindMap.destroy() } catch (e) {}
        try { document.body.removeChild(tempDiv) } catch (e) {}
        resolve(null)
      }, 5000)
    } catch (e) {
      console.error('create temp mindmap error:', e)
      resolve(null)
    }
  })
}

// 发送飞书文本消息
async function sendFeishuText(webhookUrl, { title, items }) {
  if (!window.zmindReview || !window.zmindReview.sendFeishuWebhook) return

  const lines = items.map((item, i) => {
    const text = getTextFromHtml(item.nodeText || '')
    const parent = getTextFromHtml(item.parentText || '')
    const file = item.fileName || ''
    return `${i + 1}. ${text}${parent ? ' (← ' + parent + ')' : ''}${file ? ' [' + file + ']' : ''}`
  })

  const content = `${title}\n\n${lines.join('\n')}`

  const payload = {
    msg_type: 'text',
    content: {
      text: content
    }
  }

  await window.zmindReview.sendFeishuWebhook(webhookUrl, payload)
}

// 发送飞书图片消息
async function sendFeishuImage(webhookUrl, imageBase64, title) {
  if (!window.zmindReview || !window.zmindReview.sendFeishuWebhook) return

  // 飞书 webhook 图片格式需要 image_key，不支持直接 base64
  // 改用富文本消息，先发文本再发图片
  // 由于飞书 webhook 不支持直接上传图片，这里先用文本消息
  const payload = {
    msg_type: 'text',
    content: {
      text: `【${title}】\n\n请查看应用内的复习计划面板`
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
