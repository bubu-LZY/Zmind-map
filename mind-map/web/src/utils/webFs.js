// 网页端文件系统适配器：通过 HTTP API 访问桌面端文件
// 当 window.zmindFs（Electron IPC）不可用时（局域网访问），使用此适配器

const fetchJson = async url => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const postJson = async (url, data) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const enc = encodeURIComponent

const webFs = {
  getDesktopPath: async () => {
    const data = await fetchJson('/api/fs/desktop')
    return data.path
  },
  selectFolder: async () => {
    const data = await fetchJson('/api/fs/desktop')
    return data.path
  },
  listDir: async p => {
    return fetchJson(`/api/fs/list?path=${enc(p)}`)
  },
  readFile: async p => {
    const data = await fetchJson(`/api/fs/read?path=${enc(p)}`)
    return data.content
  },
  writeFile: async (p, c) => {
    return postJson('/api/fs/write', { path: p, content: c })
  },
  rename: async (o, n) => {
    const data = await postJson('/api/fs/rename', { oldPath: o, newPath: n })
    return data.path
  },
  remove: async p => {
    return postJson('/api/fs/remove', { path: p })
  },
  mkdir: async p => {
    const data = await postJson('/api/fs/mkdir', { path: p })
    return data.path
  },
  createFile: async (p, c) => {
    const data = await postJson('/api/fs/create', { path: p, content: c })
    return data.path
  },
  move: async (src, destDir) => {
    const data = await postJson('/api/fs/move', { src, destDir })
    return data.path
  },
  exists: async p => {
    const data = await fetchJson(`/api/fs/exists?path=${enc(p)}`)
    return data.exists
  }
}

export const isWebMode = () =>
  typeof window !== 'undefined' &&
  !window.zmindFs &&
  (location.protocol === 'http:' || location.protocol === 'https:')

export const getFs = () => window.zmindFs || webFs

export default webFs
