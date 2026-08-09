const { contextBridge, ipcRenderer } = require('electron')

// 暴露给渲染进程的文件系统能力（用于左侧文件目录树）
contextBridge.exposeInMainWorld('zmindFs', {
  // 获取桌面路径
  getDesktopPath: () => ipcRenderer.invoke('zmind:getDesktopPath'),
  // 选择文件夹，返回路径或 null
  selectFolder: () => ipcRenderer.invoke('zmind:selectFolder'),
  // 列出目录内容（只返回文件夹和 .smm/.json/.md 文件）
  listDir: p => ipcRenderer.invoke('zmind:listDir', p),
  // 读取文件（utf8）
  readFile: p => ipcRenderer.invoke('zmind:readFile', p),
  // 写入文件（utf8）
  writeFile: (p, c) => ipcRenderer.invoke('zmind:writeFile', p, c),
  // 重命名/移动：oldPath -> newPath
  rename: (o, n) => ipcRenderer.invoke('zmind:rename', o, n),
  // 删除（移入回收站）
  remove: p => ipcRenderer.invoke('zmind:remove', p),
  // 新建文件夹，返回实际路径
  mkdir: p => ipcRenderer.invoke('zmind:mkdir', p),
  // 新建文件（已存在则自动加序号），返回实际路径
  createFile: (p, c) => ipcRenderer.invoke('zmind:createFile', p, c),
  // 移动到指定目录下，返回新路径
  move: (src, destDir) => ipcRenderer.invoke('zmind:move', src, destDir),
  // 判断路径是否存在
  exists: p => ipcRenderer.invoke('zmind:exists', p)
})

// 暴露给渲染进程的局域网访问能力
contextBridge.exposeInMainWorld('zmindLan', {
  // 启动局域网 HTTP 服务器，返回 { success, port, ip } 或 { success: false, error }
  start: port => ipcRenderer.invoke('zmind:startLanServer', port),
  // 停止局域网 HTTP 服务器
  stop: () => ipcRenderer.invoke('zmind:stopLanServer'),
  // 获取服务器状态 { running, port, ip }
  getStatus: () => ipcRenderer.invoke('zmind:getLanStatus'),
  // 获取局域网 IP 地址
  getIp: () => ipcRenderer.invoke('zmind:getLanIp'),
  // 同步 localStorage 数据到主进程（供局域网访问注入）
  syncLocalStorage: data => ipcRenderer.invoke('zmind:syncLocalStorage', data),
  // 获取已缓存的 localStorage 数据
  getCachedLocalStorage: () => ipcRenderer.invoke('zmind:getCachedLocalStorage'),
  // 监听网页端同步过来的数据
  onWebSync: callback => {
    ipcRenderer.on('zmind:webSync', (event, data) => callback(data))
  }
})

// 暴露给渲染进程的复习计划能力
contextBridge.exposeInMainWorld('zmindReview', {
  // 设置开机自启动
  setAutoStart: enabled => ipcRenderer.invoke('zmind:setAutoStart', enabled),
  // 显示系统通知
  showNotification: (title, body) => ipcRenderer.invoke('zmind:showNotification', title, body),
  // 发送飞书 webhook 消息
  sendFeishuWebhook: (url, payload) => ipcRenderer.invoke('zmind:sendFeishuWebhook', url, payload),
  // 获取应用数据目录路径
  getAppDataPath: () => ipcRenderer.invoke('zmind:getAppDataPath'),
  // 备份文件到指定目录
  backupFile: (src, destDir) => ipcRenderer.invoke('zmind:backupFile', src, destDir),
  // 监听主进程的复习触发事件（定时提醒/忘记复习/补推）
  onReviewTrigger: callback => {
    ipcRenderer.on('zmind:reviewTrigger', (event, data) => callback(data))
  },
  // 同步复习配置到主进程（时间设置等）
  syncReviewConfig: config => ipcRenderer.invoke('zmind:syncReviewConfig', config),
  // 检查错过的复习（启动时补推）
  checkMissedReviews: () => ipcRenderer.invoke('zmind:checkMissedReviews')
})

// 暴露系统托盘能力
contextBridge.exposeInMainWorld('zmindTray', {
  // 监听托盘菜单动作
  onTrayAction: callback => {
    ipcRenderer.on('zmind:trayAction', (event, data) => callback(data))
  }
})
