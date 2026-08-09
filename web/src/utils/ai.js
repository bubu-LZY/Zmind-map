// 通用 OpenAI 兼容接口的 AI 客户端
// 支持所有符合 OpenAI Chat Completions 规范的第三方服务
// （OpenAI、DeepSeek、通义千问、Kimi、火山方舟、Ollama 等）
class Ai {
  constructor(options = {}) {
    this.options = options

    this.baseData = {}
    this.controller = null
    this.currentChunk = ''
    this.content = ''
  }

  /**
   * 初始化配置
   * config: {
   *   api:   完整的 chat completions 接口地址，
   *          如 https://api.openai.com/v1/chat/completions
   *   key:   API Key
   *   model: 模型名称，如 gpt-4o-mini、deepseek-chat
   *          （火山方舟填推理接入点 ID，如 ep-xxxx）
   * }
   */
  init(config = {}) {
    this.baseData = {
      api: config.api,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.key
      },
      data: {
        model: config.model,
        stream: true
      }
    }
  }

  // 发起流式请求
  async request(data, progress = () => {}, end = () => {}, err = () => {}) {
    try {
      const res = await this.postMsg(data)
      const decoder = new TextDecoder()
      while (1) {
        const { done, value } = await res.read()
        if (done) {
          return
        }
        // 拿到当前切片的数据
        const text = decoder.decode(value)
        // 处理切片数据
        let chunk = this.handleChunkData(text)
        // 判断是否有不完整切片，如果有，合并下一次处理，没有则获取数据
        if (this.currentChunk) continue
        let isEnd = false
        const list = chunk
          .split('\n')
          .filter(item => {
            isEnd = item.includes('[DONE]')
            return !!item && !isEnd
          })
          .map(item => {
            return JSON.parse(item.replace(/^data:/, ''))
          })
        list.forEach(item => {
          this.content += (item.choices || [])
            .map(item2 => {
              return (item2.delta && item2.delta.content) || ''
            })
            .join('')
        })
        progress(this.content)
        if (isEnd) {
          end(this.content)
        }
      }
    } catch (error) {
      console.log(error)
      // 手动停止请求不需要触发错误回调
      if (!(error && error.name === 'AbortError')) {
        err(error)
      }
    }
  }

  async postMsg(data) {
    this.controller = new AbortController()
    const res = await fetch(this.baseData.api, {
      signal: this.controller.signal,
      method: 'POST',
      headers: this.baseData.headers,
      body: JSON.stringify({
        ...this.baseData.data,
        ...data
      })
    })
    if (res.status && res.status !== 200) {
      let detail = ''
      try {
        detail = await res.text()
      } catch (e) {}
      throw new Error(`请求失败(${res.status})：${detail.slice(0, 200)}`)
    }
    return res.body.getReader()
  }

  handleChunkData(chunk) {
    chunk = chunk.trim()
    // 如果存在上一个切片
    if (this.currentChunk) {
      chunk = this.currentChunk + chunk
      this.currentChunk = ''
    }
    // 如果存在done,认为是完整切片且是最后一个切片
    if (chunk.includes('[DONE]')) {
      return chunk
    }
    // 最后一个字符串不为}，则默认切片不完整，保存与下次拼接使用（这种方法不严谨，但已经能解决大部分场景的问题）
    if (chunk[chunk.length - 1] !== '}') {
      this.currentChunk = chunk
    }
    return chunk
  }

  stop() {
    this.controller.abort()
    this.controller = new AbortController()
  }
}

// 连接检测：发送一个最小化请求验证 接口地址/Key/模型 是否可用
export const testAiConnection = async config => {
  const res = await fetch(config.api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + config.key
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    })
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch (e) {}
    throw new Error(`${res.status} ${detail.slice(0, 200)}`)
  }
  return true
}

export default Ai
