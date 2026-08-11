// 艾宾浩斯遗忘曲线复习计划管理
// 9 个记忆周期：5分钟、30分钟、12小时、1天、2天、4天、7天、15天、31天

import { createUid } from 'simple-mind-map/src/utils'

const REVIEW_KEY = 'ZMIND_REVIEW_PLAN'
const REVIEW_BACKUP_DIR_KEY = 'ZMIND_REVIEW_BACKUP_DIR'

// 9 个记忆周期（毫秒）
const CYCLES = [
  { cycle: 1, label: '5分钟', ms: 5 * 60 * 1000 },
  { cycle: 2, label: '30分钟', ms: 30 * 60 * 1000 },
  { cycle: 3, label: '12小时', ms: 12 * 60 * 60 * 1000 },
  { cycle: 4, label: '1天', ms: 1 * 24 * 60 * 60 * 1000 },
  { cycle: 5, label: '2天', ms: 2 * 24 * 60 * 60 * 1000 },
  { cycle: 6, label: '4天', ms: 4 * 24 * 60 * 60 * 1000 },
  { cycle: 7, label: '7天', ms: 7 * 24 * 60 * 60 * 1000 },
  { cycle: 8, label: '15天', ms: 15 * 24 * 60 * 60 * 1000 },
  { cycle: 9, label: '31天', ms: 31 * 24 * 60 * 60 * 1000 }
]

// 日期格式化为 YYYY-MM-DD
function formatDate(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

// 日期格式化为 YYYY-MM-DD HH:mm
function formatDateTime(date) {
  const d = new Date(date)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return formatDate(date) + ' ' + h + ':' + min
}

// 判断是否同一天
function isSameDay(d1, d2) {
  return formatDate(d1) === formatDate(d2)
}

// 获取今天的日期字符串
function getToday() {
  return formatDate(new Date())
}

// 获取所有复习计划
export function getReviewPlan() {
  try {
    const data = localStorage.getItem(REVIEW_KEY)
    const list = data ? JSON.parse(data) : []
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

// 保存复习计划（localStorage 满时返回 false，避免抛错中断调用方）
function saveReviewPlan(list) {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(list))
    return true
  } catch (e) {
    console.error('[复习计划] 保存失败（可能存储空间不足）:', e)
    return false
  }
}

// 计算从当前时间开始的 9 个复习日期
export function calculateReviewDates(startTime = Date.now()) {
  return CYCLES.map(c => {
    const reviewTime = startTime + c.ms
    return {
      cycle: c.cycle,
      label: c.label,
      reviewDate: formatDateTime(reviewTime),
      reviewDateTs: reviewTime,
      completed: false,
      completedDate: null
    }
  })
}

// 添加节点到复习计划
export function addToReviewPlan(nodeData) {
  const list = getReviewPlan()
  const startTime = Date.now()
  const cycles = calculateReviewDates(startTime)

  const item = {
    id: createUid(),
    nodeUid: nodeData.nodeUid || '',
    nodeText: nodeData.nodeText || '',
    parentText: nodeData.parentText || '',
    filePath: nodeData.filePath || '',
    fileName: nodeData.fileName || '',
    backupFilePath: nodeData.backupFilePath || '',
    backupFileName: nodeData.backupFileName || '',
    createdDate: formatDateTime(startTime),
    createdDateTs: startTime,
    cycles: cycles
  }

  list.push(item)
  saveReviewPlan(list)
  return item
}

// 从复习计划中移除（按节点 UID）
export function removeFromReviewPlan(nodeUid) {
  const list = getReviewPlan().filter(item => item.nodeUid !== nodeUid)
  saveReviewPlan(list)
}

// 按 ID 移除
export function removeById(id) {
  const list = getReviewPlan().filter(item => item.id !== id)
  saveReviewPlan(list)
}

// 按 filePath 获取该文件的复习计划列表
export function getReviewPlanByFile(filePath) {
  if (!filePath) return []
  return getReviewPlan().filter(item => item.filePath === filePath)
}

// 按 filePath 删除该文件的所有复习计划（删除文件时同步清理），返回删除数量
export function removeFromReviewPlanByFile(filePath) {
  if (!filePath) return 0
  const list = getReviewPlan()
  const filtered = list.filter(item => item.filePath !== filePath)
  const removed = list.length - filtered.length
  if (removed > 0) saveReviewPlan(filtered)
  return removed
}

// 清除所有已完成的复习计划（所有周期都已完成）
export function removeAllCompleted() {
  const list = getReviewPlan()
  const filtered = list.filter(item => !item.cycles.every(c => c.completed))
  saveReviewPlan(filtered)
  return list.length - filtered.length
}

// 检查节点是否已在复习计划中
export function isInReviewPlan(nodeUid) {
  return getReviewPlan().some(item => item.nodeUid === nodeUid)
}

// 按节点 UID 获取复习项
export function getReviewItemByNodeUid(nodeUid) {
  return getReviewPlan().find(item => item.nodeUid === nodeUid)
}

// 获取指定日期的复习任务
export function getReviewItemsByDate(dateStr) {
  const list = getReviewPlan()
  const results = []
  list.forEach(item => {
    item.cycles.forEach(c => {
      if (formatDate(c.reviewDateTs) === dateStr) {
        results.push({
          ...item,
          currentCycle: c
        })
      }
    })
  })
  return results
}

// 获取今日复习任务
export function getTodayReviewItems() {
  return getReviewItemsByDate(getToday())
}

// 获取所有有复习任务的日期（去重排序）
export function getAllReviewDates() {
  const list = getReviewPlan()
  const dateSet = new Set()
  list.forEach(item => {
    item.cycles.forEach(c => {
      dateSet.add(formatDate(c.reviewDateTs))
    })
  })
  return Array.from(dateSet).sort()
}

// 标记某个复习周期为已完成
export function markCycleCompleted(id, cycleNum) {
  const list = getReviewPlan()
  const item = list.find(i => i.id === id)
  if (item) {
    const c = item.cycles.find(c => c.cycle === cycleNum)
    if (c) {
      c.completed = true
      c.completedDate = formatDateTime(Date.now())
      c.completedDateTs = Date.now()
    }
  }
  saveReviewPlan(list)
}

// 标记某个复习周期为未完成
export function markCycleUncompleted(id, cycleNum) {
  const list = getReviewPlan()
  const item = list.find(i => i.id === id)
  if (item) {
    const c = item.cycles.find(c => c.cycle === cycleNum)
    if (c) {
      c.completed = false
      c.completedDate = null
    }
  }
  saveReviewPlan(list)
}

// 获取今日未完成的复习任务
export function getTodayUncompletedItems() {
  const today = getToday()
  return getReviewItemsByDate(today).filter(item => !item.currentCycle.completed)
}

// 检查某个复习项是否所有周期都已完成
export function isAllCyclesCompleted(id) {
  const item = getReviewPlan().find(i => i.id === id)
  if (!item) return false
  return item.cycles.every(c => c.completed)
}

// 清理已完成全部周期的复习项（3个月前的）
export function cleanupOldCompleted() {
  const list = getReviewPlan()
  const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
  const filtered = list.filter(item => {
    if (item.cycles.every(c => c.completed)) {
      const lastCycle = item.cycles[item.cycles.length - 1]
      if (lastCycle.completedDateTs && lastCycle.completedDateTs < threeMonthsAgo) {
        return false
      }
    }
    return true
  })
  saveReviewPlan(filtered)
  return list.length - filtered.length
}

// 获取复习计划统计
export function getReviewStats() {
  const list = getReviewPlan()
  const today = getToday()
  let todayTotal = 0
  let todayCompleted = 0
  let todayUncompleted = 0

  list.forEach(item => {
    item.cycles.forEach(c => {
      if (formatDate(c.reviewDateTs) === today) {
        todayTotal++
        if (c.completed) {
          todayCompleted++
        } else {
          todayUncompleted++
        }
      }
    })
  })

  return {
    total: list.length,
    todayTotal,
    todayCompleted,
    todayUncompleted
  }
}

// 获取备份目录配置
export function getBackupDir() {
  return localStorage.getItem(REVIEW_BACKUP_DIR_KEY) || ''
}

// 设置备份目录配置
export function setBackupDir(dir) {
  localStorage.setItem(REVIEW_BACKUP_DIR_KEY, dir)
}

// 获取指定日期之前所有未完成的复习任务（用于补推检测）
export function getUncompletedBeforeDate(dateStr) {
  const list = getReviewPlan()
  const results = []
  list.forEach(item => {
    item.cycles.forEach(c => {
      if (!c.completed && formatDate(c.reviewDateTs) <= dateStr) {
        results.push({
          ...item,
          currentCycle: c
        })
      }
    })
  })
  return results
}

// 获取已逾期末完成的复习任务（按时间戳比较，只返回复习时间已到但未完成的）
// 注意：必须用时间戳比较，不能用日期比较，否则今天尚未到点的复习项
// 会在打开软件时被误判为"逾期"而触发补推
export function getPendingReviewItems() {
  const list = getReviewPlan()
  const now = Date.now()
  const results = []
  list.forEach(item => {
    item.cycles.forEach(c => {
      if (!c.completed && c.reviewDateTs <= now) {
        results.push({
          ...item,
          currentCycle: c
        })
      }
    })
  })
  return results
}

export { CYCLES, formatDate, formatDateTime, getToday }
