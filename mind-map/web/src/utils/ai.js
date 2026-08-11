// 通用 OpenAI 兼容接口的 AI 客户端
// 支持所有符合 OpenAI Chat Completions 规范的第三方服务
// （OpenAI、DeepSeek、通义千问、Kimi、火山方舟、Ollama 等）

/**
 * 二开：根据模型名智能识别深度思考模式参数
 * 兼容主流大模型的深度思考开关：
 * - Qwen（通义千问）: enable_thinking: true
 * - DeepSeek: thinking: {type: "enabled"} + reasoning_effort: "high"
 * - OpenAI o系列: reasoning_effort: "high"
 * - GLM（智谱）: thinking: {type: "enabled"}
 * - Claude: thinking: {type: "enabled", budget_tokens: 10000}
 * - 通用兼容: 同时发送 enable_thinking 和 thinking 参数
 */
export const buildThinkingParams = (model) => {
  if (!model || typeof model !== 'string') return null
  const m = model.toLowerCase()

  // Qwen（通义千问）系列: qwen3, qwen-plus, qwen-max, qwen-flash, qwq 等
  if (m.includes('qwen') || m.includes('qwq')) {
    return { enable_thinking: true }
  }

  // DeepSeek 系列: deepseek-r1, deepseek-chat, deepseek-v4 等
  if (m.includes('deepseek')) {
    return { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
  }

  // OpenAI o 系列: o1, o3, o4, o5 等（推理模型）
  if (/^o[1-9]/.test(m) || m.includes('o1-') || m.includes('o3-') || m.includes('o4-')) {
    return { reasoning_effort: 'high' }
  }

  // OpenAI GPT-5 系列也支持 reasoning
  if (m.includes('gpt-5') || m.includes('gpt5')) {
    return { reasoning_effort: 'high' }
  }

  // GLM（智谱）系列: glm-4, glm-zero, chatglm 等
  if (m.includes('glm') || m.includes('chatglm')) {
    return { thinking: { type: 'enabled' } }
  }

  // Claude 系列（通过 OpenAI 兼容接口）
  if (m.includes('claude')) {
    return { thinking: { type: 'enabled', budget_tokens: 10000 } }
  }

  // Kimi / Moonshot 系列
  if (m.includes('kimi') || m.includes('moonshot')) {
    return { thinking: { type: 'enabled' } }
  }

  // 通用兼容：同时发送两种最常见的参数格式
  // 适用于自部署模型或未知模型，让 API 自行忽略不支持的参数
  return { enable_thinking: true, thinking: { type: 'enabled' } }
}

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
   *   enableThinking: 是否开启深度思考模式（可选，默认 false）
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
    // 二开：深度思考模式 - 根据模型名智能识别对应的参数格式
    if (config.enableThinking) {
      const thinkingParams = buildThinkingParams(config.model)
      if (thinkingParams) {
        Object.assign(this.baseData.data, thinkingParams)
        console.log('[AI] 深度思考模式已开启，模型:', config.model, '参数:', thinkingParams)
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
