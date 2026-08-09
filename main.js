const { app, BrowserWindow, Menu, shell, protocol, powerSaveBlocker, Notification, Tray, clipboard, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const os = require('os')

// 桌面应用直连 AI 接口：关闭 Chromium 同源策略 + 强制对 OPTIONS 预检返回 200
app.commandLine.appendSwitch('disable-web-security')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')

// ============ 错误日志（诊断用）============
const LOG_FILE = path.join(app.getPath('userData'), 'mindmap-debug.log')
function dlog(msg) {
  try {
    fs.appendFileSync(
      LOG_FILE,
      `[${new Date().toISOString()}] ${msg}\n`
    )
  } catch (e) {}
}

// ============ 自定义 app:// 协议 ============
// 必须在 app ready 之前注册为特权协议：
// standard/secure 让 localStorage 可用且数据按 app://local 源持久化，
// 避免 file:// 协议下的各种加载限制
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.map': 'application/json'
}

function registerAppProtocol() {
  const baseDir = path.join(__dirname, 'app2')
  protocol.handle('app', async request => {
    try {
      const url = new URL(request.url)
      let pathname = decodeURIComponent(url.pathname)
      if (pathname === '/' || pathname === '') pathname = '/index.html'
      const filePath = path.join(baseDir, pathname)
      // 防目录穿越
      if (!filePath.startsWith(baseDir)) {
        return new Response('forbidden', { status: 403 })
      }
      // fs 在主进程中原生支持 asar，比 net.fetch(file://) 更可靠
      const data = await fs.promises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' }
      })
    } catch (e) {
      dlog(`[protocol] error: ${e.message} url=${request.url}`)
      return new Response('not found', { status: 404 })
    }
  })
}

// ============ 文件系统 IPC（左侧文件目录树）============

function registerFsIpc() {
  // 获取桌面路径
  ipcMain.handle('zmind:getDesktopPath', async () => {
    return app.getPath('desktop')
  })

  ipcMain.handle('zmind:selectFolder', async e => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const ret = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    return ret.canceled ? null : ret.filePaths[0]
  })

  ipcMain.handle('zmind:listDir', async (e, dirPath) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const dirs = []
    const files = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        dirs.push({ name: entry.name, path: full, isDir: true })
      } else if (/\.(smm|md|json)$/i.test(entry.name)) {
        // 只显示本程序能识别加载的文件
        const stat = await fs.promises.stat(full)
        files.push({
          name: entry.name,
          path: full,
          isDir: false,
          mtime: stat.mtimeMs
        })
      }
    }
    const byName = (a, b) => a.name.localeCompare(b.name, 'zh-CN')
    return [...dirs.sort(byName), ...files.sort(byName)]
  })

  ipcMain.handle('zmind:readFile', async (e, p) => {
    return fs.promises.readFile(p, 'utf8')
  })

  ipcMain.handle('zmind:writeFile', async (e, p, content) => {
    await fs.promises.writeFile(p, content, 'utf8')
    return true
  })

  ipcMain.handle('zmind:rename', async (e, oldPath, newPath) => {
    if (await exists(newPath)) {
      throw new Error('目标名称已存在')
    }
    await fs.promises.rename(oldPath, newPath)
    return newPath
  })

  ipcMain.handle('zmind:remove', async (e, p) => {
    await shell.trashItem(p)
    return true
  })

  ipcMain.handle('zmind:mkdir', async (e, p) => {
    const target = await uniquePath(p)
    await fs.promises.mkdir(target, { recursive: true })
    return target
  })

  ipcMain.handle('zmind:createFile', async (e, p, content) => {
    const target = await uniquePath(p)
    await fs.promises.writeFile(target, content || '', 'utf8')
    return target
  })

  ipcMain.handle('zmind:move', async (e, src, destDir) => {
    const target = path.join(destDir, path.basename(src))
    if (path.resolve(target) === path.resolve(src)) return src
    if (await exists(target)) {
      throw new Error('目标位置已存在同名文件或文件夹')
    }
    await fs.promises.rename(src, target)
    return target
  })

  ipcMain.handle('zmind:exists', async (e, p) => {
    return exists(p)
  })
}

async function exists(p) {
  try {
    await fs.promises.access(p)
    return true
  } catch (e) {
    return false
  }
}

// ============ 复习计划 IPC ============
let reviewConfig = {
  forgotTime: '23:59',
  reminderTime: '20:00',
  webhookUrl: '',
  backupDir: ''
}
let lastForgotTrigger = null
let lastReminderTrigger = null
let reviewTimer = null

function getTodayStr() {
  const d = new Date()
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

function getCurrentTimeStr() {
  const d = new Date()
  return String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0')
}

function sendReviewTrigger(type, date) {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    windows[0].webContents.send('zmind:reviewTrigger', { type, date })
  }
}

function startReviewTimer() {
  if (reviewTimer) clearInterval(reviewTimer)
  reviewTimer = setInterval(() => {
    const today = getTodayStr()
    const currentTime = getCurrentTimeStr()
    if (currentTime === reviewConfig.forgotTime && lastForgotTrigger !== today) {
      lastForgotTrigger = today
      sendReviewTrigger('forgot', today)
    }
    if (currentTime === reviewConfig.reminderTime && lastReminderTrigger !== today) {
      lastReminderTrigger = today
      sendReviewTrigger('reminder', today)
    }
  }, 30000)
}

function registerReviewIpc() {
  ipcMain.handle('zmind:setAutoStart', async (e, enabled) => {
    app.setLoginItemSettings({ openAtLogin: !!enabled })
    dlog(`[auto-start] set to ${enabled}`)
    return true
  })

  ipcMain.handle('zmind:showNotification', async (e, title, body) => {
    if (Notification.isSupported()) {
      const notif = new Notification({ title, body })
      notif.show()
      return true
    }
    dlog('[notification] not supported')
    return false
  })

  ipcMain.handle('zmind:sendFeishuWebhook', async (e, url, payload) => {
    if (!url) return { success: false, error: 'no webhook url' }
    try {
      const https = require('https')
      const urlObj = new URL(url)
      const client = https
      const postData = typeof payload === 'string' ? payload : JSON.stringify(payload)
      return new Promise(resolve => {
        const req = client.request(urlObj, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, res => {
          let data = ''
          res.on('data', chunk => { data += chunk })
          res.on('end', () => {
            resolve({ success: res.statusCode >= 200 && res.statusCode < 300, data, status: res.statusCode })
          })
        })
        req.on('error', err => {
          resolve({ success: false, error: err.message })
        })
        req.write(postData)
        req.end()
      })
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('zmind:getAppDataPath', async () => {
    return app.getPath('userData')
  })

  ipcMain.handle('zmind:backupFile', async (e, src, destDir) => {
    try {
      const dest = path.join(destDir, path.basename(src))
      await fs.promises.mkdir(destDir, { recursive: true })
      await fs.promises.copyFile(src, dest)
      return { success: true, path: dest }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('zmind:syncReviewConfig', async (e, config) => {
    reviewConfig = { ...reviewConfig, ...config }
    dlog(`[review] config synced: ${JSON.stringify(reviewConfig)}`)
    return true
  })

  ipcMain.handle('zmind:checkMissedReviews', async () => {
    sendReviewTrigger('missed', getTodayStr())
    return true
  })
}

// ============ 局域网 HTTP 服务器 ============
let lanServer = null

// 缓存桌面端的 localStorage 数据，供局域网访问时注入
let cachedLocalStorage = null

// SSE 客户端连接池（桌面端 → 网页端 实时推送）
let sseClients = {}
let sseClientId = 0

// 向所有 SSE 客户端广播数据
function broadcastToSseClients(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  Object.keys(sseClients).forEach(id => {
    try {
      sseClients[id].write(msg)
    } catch (e) {
      delete sseClients[id]
    }
  })
}

function getLanIp() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function startLanServer(port) {
  return new Promise((resolve, reject) => {
    if (lanServer) {
      lanServer.close(() => {
        lanServer = null
        doStart()
      })
    } else {
      doStart()
    }

    function doStart() {
      const baseDir = path.join(__dirname, 'app2')
      lanServer = http.createServer(async (req, res) => {
        try {
          let urlPath = decodeURIComponent(req.url.split('?')[0])

          // API: 网页端 → 桌面端 同步
          if (urlPath === '/api/sync' && req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              try {
                const data = JSON.parse(body)
                cachedLocalStorage = data
                // 推送到桌面端渲染进程
                BrowserWindow.getAllWindows().forEach(win => {
                  win.webContents.send('zmind:webSync', data)
                })
                // 广播到所有 SSE 网页客户端（多网页端同步）
                broadcastToSseClients(data)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end('{"ok":true}')
              } catch (e) {
                res.writeHead(400)
                res.end('{"error":"bad json"}')
              }
            })
            return
          }

          // API: 桌面端 → 网页端 获取最新数据
          if (urlPath === '/api/data' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(cachedLocalStorage || {}))
            return
          }

          // API: SSE 实时推送通道（桌面端 → 网页端）
          if (urlPath === '/api/sse' && req.method === 'GET') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            })
            // 发送初始数据
            res.write(`data: ${JSON.stringify(cachedLocalStorage || {})}\n\n`)
            // 注册客户端
            const id = ++sseClientId
            sseClients[id] = res
            req.on('close', () => {
              delete sseClients[id]
            })
            return
          }

          // ===== 文件系统 API（供网页端访问桌面端文件）=====
          const urlObj = new URL(req.url, 'http://localhost')
          const queryParams = Object.fromEntries(urlObj.searchParams)

          const readBody = () => new Promise((resolve) => {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              try { resolve(JSON.parse(body)) }
              catch (e) { resolve({}) }
            })
          })

          // 获取桌面路径
          if (urlPath === '/api/fs/desktop' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ path: app.getPath('desktop') }))
            return
          }

          // 列出目录内容
          if (urlPath === '/api/fs/list' && req.method === 'GET') {
            const dirPath = queryParams.path
            if (!dirPath) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            try {
              const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
              const dirs = []
              const files = []
              for (const entry of entries) {
                if (entry.name.startsWith('.')) continue
                const full = path.join(dirPath, entry.name)
                if (entry.isDirectory()) {
                  dirs.push({ name: entry.name, path: full, isDir: true })
                } else if (/\.(smm|md|json)$/i.test(entry.name)) {
                  const stat = await fs.promises.stat(full)
                  files.push({ name: entry.name, path: full, isDir: false, mtime: stat.mtimeMs })
                }
              }
              const byName = (a, b) => a.name.localeCompare(b.name, 'zh-CN')
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify([...dirs.sort(byName), ...files.sort(byName)]))
            } catch (e) {
              res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
            }
            return
          }

          // 读取文件
          if (urlPath === '/api/fs/read' && req.method === 'GET') {
            const filePath = queryParams.path
            if (!filePath) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            try {
              const content = await fs.promises.readFile(filePath, 'utf8')
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ content }))
            } catch (e) {
              res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
            }
            return
          }

          // 写入文件
          if (urlPath === '/api/fs/write' && req.method === 'POST') {
            const { path: filePath, content } = await readBody()
            if (!filePath) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            try {
              await fs.promises.writeFile(filePath, content || '', 'utf8')
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end('{"ok":true}')
            } catch (e) {
              res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
            }
            return
          }

          // 新建文件
          if (urlPath === '/api/fs/create' && req.method === 'POST') {
            const { path: filePath, content } = await readBody()
            if (!filePath) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            try {
              const target = await uniquePath(filePath)
              await fs.promises.writeFile(target, content || '', 'utf8')
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ path: target }))
            } catch (e) {
              res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
            }
            return
          }

          // 新建文件夹
          if (urlPath === '/api/fs/mkdir' && req.method === 'POST') {
            const { path: dirPath } = await readBody()
            if (!dirPath) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            try {
              const target = await uniquePath(dirPath)
              await fs.promises.mkdir(target, { recursive: true })
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ path: target }))
            } catch (e) {
              res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
            }
            return
          }

          // 重命名
          if (urlPath === '/api/fs/rename' && req.method === 'POST') {
            const { oldPath, newPath } = await readBody()
            if (!oldPath || !newPath) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            try {
              if (await exists(newPath)) throw new Error('目标名称已存在')
              await fs.promises.rename(oldPath, newPath)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ path: newPath }))
            } catch (e) {
              res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
            }
            return
          }

          // 删除（移入回收站）
          if (urlPath === '/api/fs/remove' && req.method === 'POST') {
            const { path: filePath } = await readBody()
            if (!filePath) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            try {
              await shell.trashItem(filePath)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end('{"ok":true}')
            } catch (e) {
              res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
            }
            return
          }

          // 移动文件
          if (urlPath === '/api/fs/move' && req.method === 'POST') {
            const { src, destDir } = await readBody()
            if (!src || !destDir) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            try {
              const target = path.join(destDir, path.basename(src))
              if (path.resolve(target) === path.resolve(src)) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ path: src }))
                return
              }
              if (await exists(target)) throw new Error('目标位置已存在同名文件或文件夹')
              await fs.promises.rename(src, target)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ path: target }))
            } catch (e) {
              res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
            }
            return
          }

          // 判断路径是否存在
          if (urlPath === '/api/fs/exists' && req.method === 'GET') {
            const filePath = queryParams.path
            if (!filePath) { res.writeHead(400); res.end('{"error":"no path"}'); return }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ exists: await exists(filePath) }))
            return
          }

          if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
          // 安全：禁止路径穿越
          const filePath = path.join(baseDir, urlPath)
          if (!filePath.startsWith(baseDir)) {
            res.writeHead(403)
            res.end('forbidden')
            return
          }
          fs.readFile(filePath, (err, data) => {
            if (err) {
              res.writeHead(404)
              res.end('not found')
              return
            }
            const ext = path.extname(filePath).toLowerCase()
            // 对 index.html 注入桌面端 localStorage 数据 + 双向同步脚本
            if (urlPath === '/index.html') {
              let html = data.toString('utf8')
              const lsJson = JSON.stringify(cachedLocalStorage || {})
              const injectScript = '<script>' +
                '(function(){' +
                'var LS_KEYS=["SIMPLE_MIND_MAP_DATA","SIMPLE_MIND_MAP_CONFIG","SIMPLE_MIND_MAP_LANG","SIMPLE_MIND_MAP_LOCAL_CONFIG","SIMPLE_MIND_MAP_CLOZE_STATE","SIMPLE_MIND_MAP_COLLAPSE_STATE","ZMIND_RECENT_FILES","ZMIND_FOLDER_ROOTS","ZMIND_REVIEW_PLAN"];' +
                'var _set=localStorage.setItem.bind(localStorage);' +
                'var syncTimer=null;' +
                'var lastSentData="{}";' +
                'var _fromSSE=false;' +
                // 注入桌面端初始数据
                'var __LS__=' + lsJson + ';' +
                'if(__LS__){for(var k in __LS__){try{_set(k,__LS__[k])}catch(e){}}}' +
                // 网页端→桌面端：拦截 setItem，防抖发送（SSE 更新的数据不回传，防止循环）
                'localStorage.setItem=function(key,val){_set(key,val);if(_fromSSE)return;if(LS_KEYS.indexOf(key)>=0){if(syncTimer)clearTimeout(syncTimer);syncTimer=setTimeout(function(){var d={};LS_KEYS.forEach(function(k){var v=localStorage.getItem(k);if(v!==null)d[k]=v});lastSentData=JSON.stringify(d);try{var x=new XMLHttpRequest();x.open("POST","/api/sync",true);x.setRequestHeader("Content-Type","application/json");x.send(lastSentData)}catch(e){}},300)}};' +
                // 桌面端→网页端：SSE 实时推送（替代轮询）
                'var es=new EventSource("/api/sse");' +
                'es.onmessage=function(event){var t=event.data;if(t===lastSentData||t==="{}")return;lastSentData=t;try{var d=JSON.parse(t);var changed=false;var dataChanged=false;var clozeChanged=false;var collapseChanged=false;var fileChanged=false;_fromSSE=true;for(var k in d){var c=localStorage.getItem(k);if(c!==d[k]){_set(k,d[k]);changed=true;if(k==="SIMPLE_MIND_MAP_DATA")dataChanged=true;if(k==="SIMPLE_MIND_MAP_CLOZE_STATE")clozeChanged=true;if(k==="SIMPLE_MIND_MAP_COLLAPSE_STATE")collapseChanged=true;if(k==="ZMIND_RECENT_FILES"||k==="ZMIND_FOLDER_ROOTS")fileChanged=true}}if(changed){try{if(window.$bus&&dataChanged&&d.SIMPLE_MIND_MAP_DATA){window.$bus.$emit("lanSyncUpdate",JSON.parse(d.SIMPLE_MIND_MAP_DATA))}if(window.$bus&&clozeChanged){window.$bus.$emit("lanClozeStateChanged")}if(window.$bus&&collapseChanged){window.$bus.$emit("lanCollapseStateChanged")}if(window.$bus&&fileChanged){window.$bus.$emit("lanSyncFileState")}}catch(e){}}setTimeout(function(){_fromSSE=false},500)}catch(e){_fromSSE=false}};' +
                'es.onerror=function(){_fromSSE=false};' +
                '})();' +
                '</script>'
              html = html.replace(
                'window.takeOverApp = false</script>',
                'window.takeOverApp = false</script>' + injectScript
              )
              data = Buffer.from(html, 'utf8')
            }
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
            res.end(data)
          })
        } catch (e) {
          res.writeHead(500)
          res.end('server error')
        }
      })
      lanServer.on('error', err => {
        dlog(`[lan-server] error: ${err.message}`)
        lanServer = null
        reject(err)
      })
      lanServer.listen(port, '0.0.0.0', () => {
        const ip = getLanIp()
        dlog(`[lan-server] listening on http://${ip}:${port}`)
        resolve({ port, ip })
      })
    }
  })
}

function stopLanServer() {
  return new Promise(resolve => {
    if (!lanServer) {
      resolve()
      return
    }
    lanServer.close(() => {
      lanServer = null
      dlog('[lan-server] stopped')
      resolve()
    })
  })
}

function getLanStatus() {
  if (!lanServer || !lanServer.listening) {
    return { running: false }
  }
  const addr = lanServer.address()
  return { running: true, port: addr.port, ip: getLanIp() }
}

function registerLanIpc() {
  ipcMain.handle('zmind:startLanServer', async (e, port) => {
    try {
      const result = await startLanServer(port || 8080)
      return { success: true, ...result }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('zmind:stopLanServer', async () => {
    await stopLanServer()
    return { success: true }
  })
  ipcMain.handle('zmind:getLanStatus', async () => {
    return getLanStatus()
  })
  ipcMain.handle('zmind:getLanIp', async () => {
    return getLanIp()
  })
  // 接收渲染进程同步的 localStorage 数据
  ipcMain.handle('zmind:syncLocalStorage', async (e, data) => {
    cachedLocalStorage = data
    // 实时推送到所有 SSE 网页客户端
    broadcastToSseClients(data)
    return true
  })
  // 获取已缓存的 localStorage 数据
  ipcMain.handle('zmind:getCachedLocalStorage', async () => {
    return cachedLocalStorage
  })
}

// 生成不冲突的路径：xxx.smm -> xxx (1).smm
async function uniquePath(p) {
  if (!(await exists(p))) return p
  const dir = path.dirname(p)
  const ext = path.extname(p)
  const base = path.basename(p, ext)
  for (let i = 1; i < 1000; i++) {
    const candidate = path.join(dir, `${base} (${i})${ext}`)
    if (!(await exists(candidate))) return candidate
  }
  throw new Error('无法生成唯一文件名')
}

// ============ 系统托盘 ============
let tray = null
let isQuitting = false
let mainWindow = null

function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon2-512.png')
  tray = new Tray(iconPath)
  tray.setToolTip('ZMind Map')

  // 向渲染进程发送托盘动作（等待页面加载完成）
  const sendTrayAction = (data) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('zmind:trayAction', data)
      })
    } else {
      mainWindow.webContents.send('zmind:trayAction', data)
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '复习模式',
      click: () => {
        showMainWindow()
        sendTrayAction({ action: 'reviewMode' })
      }
    },
    {
      label: 'AI对话',
      click: () => {
        showMainWindow()
        sendTrayAction({ action: 'aiChat' })
      }
    },
    {
      label: '一键复制网页端访问地址',
      click: () => {
        const status = getLanStatus()
        let url
        if (status.running) {
          url = `http://${status.ip}:${status.port}`
        } else {
          url = `http://${getLanIp()}:8080`
        }
        clipboard.writeText(url)
        showMainWindow()
        sendTrayAction({ action: 'copyUrlCopied', url })
      }
    },
    { type: 'separator' },
    {
      label: '退出程序',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // 点击托盘图标显示/隐藏窗口
  tray.on('click', () => {
    showMainWindow()
  })
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
}

// ============ 窗口 ============
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'build', 'icon2-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })
  mainWindow = win

  // 诊断日志
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    if (level >= 2) dlog(`[console] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    dlog(`[did-fail-load] ${code} ${desc} ${url}`)
  })
  win.webContents.on('render-process-gone', (e, details) => {
    dlog(`[render-process-gone] ${JSON.stringify(details)}`)
    // 渲染进程崩溃后尝试重新加载，避免程序静默退出
    setTimeout(() => {
      const allWindows = BrowserWindow.getAllWindows()
      if (allWindows.length === 0) {
        dlog('[render-process-gone] recreating window...')
        createWindow()
      } else {
        // 窗口还在但渲染进程崩溃，重新加载
        allWindows.forEach(w => {
          if (!w.isDestroyed()) {
            dlog('[render-process-gone] reloading window...')
            w.loadURL('app://local/index.html')
          }
        })
      }
    }, 1000)
  })

  win.loadURL('app://local/index.html')

  // 点击关闭按钮时最小化到托盘而不是退出
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  // 外部链接一律交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // 幕布快捷键：Ctrl+T 新建标签页 -> 新建窗口；Ctrl+W 关闭当前窗口
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const ctrl = input.control || input.meta
    if (ctrl && !input.shift && !input.alt && input.key.toLowerCase() === 't') {
      event.preventDefault()
      createWindow()
    }
    if (ctrl && !input.shift && !input.alt && input.key.toLowerCase() === 'w') {
      event.preventDefault()
      win.close()
    }
  })
}

app.whenReady().then(() => {
  registerAppProtocol()
  registerFsIpc()
  registerLanIpc()
  registerReviewIpc()
  Menu.setApplicationMenu(null)

  // 默认开启开机自启动
  app.setLoginItemSettings({ openAtLogin: true })

  // 启动复习定时检查
  startReviewTimer()

  // 防止系统休眠/屏幕关闭导致程序被挂起或退出
  powerSaveBlocker.start('prevent-display-sleep')

  // 允许渲染进程直连任意 OpenAI 兼容接口（本地桌面应用，绕过 CORS 限制）
  const { session } = require('electron')
  const corsHeaders = {
    'Access-Control-Allow-Origin': ['*'],
    'Access-Control-Allow-Headers': ['*'],
    'Access-Control-Allow-Methods': ['*']
  }
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // OPTIONS 预检请求：无论服务器返回什么，强制 200 + 放行
    if (details.method === 'OPTIONS') {
      callback({
        responseHeaders: {
          ...corsHeaders,
          'Content-Type': ['text/plain'],
          'Access-Control-Max-Age': ['86400']
        },
        statusLine: 'HTTP/1.1 200 OK'
      })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        ...corsHeaders
      }
    })
  })

  createWindow()
  createTray()
  dlog('app started')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 托盘模式下不退出应用，窗口隐藏到托盘
  if (process.platform !== 'darwin' && !isQuitting) {
    // 窗口已通过 close 事件隐藏，不执行 quit
    return
  }
  stopLanServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  if (tray) {
    tray.destroy()
    tray = null
  }
})

// 防止 GPU 进程崩溃导致程序退出
app.on('gpu-process-crashed', (event) => {
  dlog(`[gpu-process-crashed] ${JSON.stringify(event)}`)
})

// 渲染进程无响应时记录日志（不强制关闭，给系统恢复机会）
app.on('renderer-unresponsive', () => {
  dlog('[renderer-unresponsive] renderer became unresponsive')
})

// 捕获未处理的 Promise rejection，避免静默崩溃
process.on('unhandledRejection', (reason) => {
  dlog(`[unhandledRejection] ${reason}`)
})

process.on('uncaughtException', (err) => {
  dlog(`[uncaughtException] ${err && err.stack ? err.stack : err}`)
})

// 单实例锁：防止多开导致文件冲突
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}
