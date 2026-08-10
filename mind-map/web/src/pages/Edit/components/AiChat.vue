<template>
  <Sidebar ref="sidebar" :title="$t('ai.chatTitle')">
    <div class="aiChatBox" :class="{ isDark: isDark }">
      <div class="chatHeader">
        <el-button size="mini" @click="clear">
          <span class="el-icon-delete"></span>
          {{ $t('ai.clearRecords') }}
        </el-button>
        <el-button size="mini" @click="modifyAiConfig">
          <span class="el-icon-edit"></span>
          {{ $t('ai.modifyAIConfiguration') }}
        </el-button>
      </div>
      <div class="chatResBox customScrollbar" ref="chatResBoxRef">
        <div
          class="chatItem"
          v-for="item in chatList"
          :key="item.id"
          :class="[item.type]"
        >
          <div class="chatItemInner" v-if="item.type === 'user'">
            <div class="content">
              <div class="msgImages" v-if="item.images && item.images.length > 0">
                <img
                  v-for="(img, idx) in item.images"
                  :key="idx"
                  :src="img"
                  class="msgImage"
                />
              </div>
              <template v-if="item.content">{{ item.content }}</template>
            </div>
            <!-- 二开：右上角一键复制 -->
            <div class="msgCopyBtn" @click="copyMessage(item)" title="复制">
              <span class="el-icon-document-copy"></span>
            </div>
            <!-- 二开：左下角重新询问（hover 显示） -->
            <div class="resendBtn" @click="resendMessage(item)" title="重新询问">
              <span class="el-icon-refresh-right"></span>
              重新询问
            </div>
            <div class="avatar">我</div>
          </div>
          <div class="chatItemInner" v-else-if="item.type === 'ai'">
            <div class="content" v-if="item.showRaw" v-html="escapeHtml(item.content_raw)"></div>
            <div class="content" v-else v-html="item.content"></div>
            <div
              class="rawToggleBtn"
              v-if="item.content_raw && hasMarkdown(item.content_raw)"
              @click="toggleRaw(item)"
            >
              {{ item.showRaw ? '显示解析' : '显示原文' }}
            </div>
            <!-- 二开：右上角一键复制 -->
            <div class="msgCopyBtn" @click="copyMessage(item)" title="复制">
              <span class="el-icon-document-copy"></span>
            </div>
            <div class="avatar">AI</div>
          </div>
        </div>
      </div>
      <div class="actionBar">
        <div class="actionBtns">
          <el-button
            class="actionBtn"
            :class="{ synced: syncedMarkdown }"
            size="mini"
            @click="syncDocumentToAI"
            :title="syncedMarkdown ? '点击取消同步' : '同步本文档内容给AI'"
          >
            <span class="el-icon-document-copy"></span>
            {{ syncedMarkdown ? '已同步' : '同步文档' }}
          </el-button>
          <el-button
            class="actionBtn"
            size="mini"
            @click="createNewConversation"
            title="新建会话"
          >
            <span class="el-icon-plus"></span>
            新建会话
          </el-button>
          <el-button
            class="actionBtn"
            size="mini"
            @click="openHistory"
            title="打开历史对话"
          >
            <span class="el-icon-time"></span>
            历史对话
          </el-button>
          <!-- 二开：切换模型按钮（显示当前模型名，点击向上展开模型列表） -->
          <el-dropdown
            trigger="click"
            placement="top"
            @command="switchModel"
            :disabled="!modelList || modelList.length === 0"
          >
            <el-button
              class="actionBtn modelSwitchBtn"
              size="mini"
              :title="modelList && modelList.length ? '切换模型' : '请先在AI配置中检测模型'"
            >
              <span class="el-icon-cpu"></span>
              <span class="modelSwitchName">{{ currentModelName || '未配置模型' }}</span>
              <span class="el-icon-arrow-up modelSwitchArrow"></span>
            </el-button>
            <el-dropdown-menu slot="dropdown" class="modelSwitchMenu">
              <el-dropdown-item
                v-for="m in modelList"
                :key="m"
                :command="m"
                :class="{ activeModel: m === currentModelName }"
              >
                <span class="el-icon-check" v-if="m === currentModelName"></span>
                {{ m }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </div>
      </div>
      <div class="chatInputBox">
        <div class="pastePreview" v-if="pasteImages.length > 0">
          <div
            class="pastePreviewItem"
            v-for="(img, index) in pasteImages"
            :key="index"
          >
            <img :src="img.dataUrl" />
            <span class="removeImg" @click="removeImage(index)">
              <span class="el-icon-close"></span>
            </span>
          </div>
        </div>
        <!-- 二开：引用节点预览区（灰色背景，类似文件引用样式） -->
        <div class="nodeRefPreview" v-if="referencedNodes.length > 0">
          <div
            class="nodeRefItem"
            v-for="(node, index) in referencedNodes"
            :key="index"
          >
            <span class="nodeRefIcon el-icon-share"></span>
            <span class="nodeRefText" :title="node.text">{{ node.text }}</span>
            <span class="removeNodeRef" @click="removeNodeRef(index)">
              <span class="el-icon-close"></span>
            </span>
          </div>
        </div>
        <textarea
          v-model="text"
          class="customScrollbar"
          :placeholder="$t('ai.chatInputPlaceholder')"
          @keydown="onKeydown"
          @paste="onPaste"
        ></textarea>
        <!-- 二开：输入提示移到输入框内（textarea 下方） -->
        <div class="inputHintInline">Enter 发送 · Shift+Enter 换行 · Ctrl+V 粘贴图片</div>
        <el-button class="btn" size="mini" @click="send" :loading="isCreating">
          {{ $t('ai.send') }}
          <span class="el-icon-position"></span>
        </el-button>
        <el-button
          class="stop"
          size="mini"
          type="warning"
          @click="stop"
          v-show="isCreating"
        >
          {{ $t('ai.stopGenerating') }}
        </el-button>
      </div>
    </div>
    <el-dialog
      title="历史对话"
      :visible.sync="historyDialogVisible"
      width="340px"
      append-to-body
      :custom-class="
        isDark ? 'aiHistoryDialog aiHistoryDialogDark' : 'aiHistoryDialog'
      "
    >
      <div class="historyClearBtn" v-if="conversationHistory.length > 0">
        <el-button
          size="mini"
          type="danger"
          plain
          @click="clearAllHistory"
        >
          <span class="el-icon-delete"></span>
          一键清空所有历史会话
        </el-button>
      </div>
      <div v-if="conversationHistory.length === 0" class="emptyHistory">
        暂无历史对话
      </div>
      <div v-else class="historyList customScrollbar">
        <div
          class="historyItem"
          v-for="conv in conversationHistory"
          :key="conv.id"
          @click="loadConversation(conv)"
        >
          <div class="historyInfo">
            <div class="historyPreview">
              {{ conv.preview || '空对话' }}
            </div>
            <div class="historyTime">{{ formatTime(conv.timestamp) }}</div>
          </div>
          <el-button
            class="deleteBtn"
            size="mini"
            type="text"
            @click.stop="deleteConversation(conv.id)"
          >
            <span class="el-icon-delete"></span>
          </el-button>
        </div>
      </div>
    </el-dialog>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { mapState, mapMutations } from 'vuex'
import { createUid } from 'simple-mind-map/src/utils'
import MarkdownIt from 'markdown-it'

let md = null

const CURRENT_CHAT_KEY = 'ZMIND_AI_CHAT_CURRENT'
const HISTORY_CHAT_KEY = 'ZMIND_AI_CHAT_HISTORY'

export default {
  components: {
    Sidebar
  },
  props: {
    mindMap: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      text: '',
      chatList: [],
      isCreating: false,
      historyDialogVisible: false,
      conversationHistory: [],
      syncedMarkdown: '',
      syncDocSent: false,
      pasteImages: [],
      // 二开：引用的节点列表（从右键"将节点添加到AI对话"添加）
      referencedNodes: []
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      aiConfig: state => state.aiConfig
    }),
    // 二开：可用模型列表（来自 AI 配置中检测到的模型）
    modelList() {
      return (this.aiConfig && this.aiConfig.modelList) || []
    },
    // 二开：当前模型名称
    currentModelName() {
      return (this.aiConfig && this.aiConfig.model) || ''
    }
  },
  watch: {
    activeSidebar(val) {
      if (val === 'ai') {
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
      }
    }
  },
  created() {
    this.restoreCurrentConversation()
    this.conversationHistory = this.getConversationHistory()
    // 二开：监听右键"将节点添加到AI对话"
    this.$bus.$on('add_nodes_to_ai_chat', this.onAddNodesToAiChat)
  },
  beforeDestroy() {
    this.$bus.$off('add_nodes_to_ai_chat', this.onAddNodesToAiChat)
  },
  methods: {
    ...mapMutations(['setLocalConfig']),

    // 二开：重新询问 —— 把对应消息重新发送给 AI（追加到对话末尾）
    resendMessage(item) {
      if (this.isCreating) {
        this.$message.warning('正在生成中，请稍后再试')
        return
      }
      const text = item.content_raw || item.content || ''
      if (!text && !(item.images && item.images.length > 0)) {
        this.$message.warning('该消息内容为空，无法重新询问')
        return
      }
      // 以该消息原文作为新输入发送（保留历史上下文）
      const historyUserMsgList = this.chatList
        .filter(m => m.type === 'user')
        .map(m => m.content_raw || m.content)
      const displayText = item.content || ''
      const images = item.images || []
      this.chatList.push({
        id: createUid(),
        type: 'user',
        content: displayText,
        content_raw: text,
        images: images.length > 0 ? images : undefined
      })
      this.chatList.push({
        id: createUid(),
        type: 'ai',
        content: ''
      })
      this.isCreating = true
      this.saveCurrentConversation()
      let currentMsg
      if (images.length > 0) {
        currentMsg = { text: text, images: images }
      } else {
        currentMsg = text
      }
      const textList = [...historyUserMsgList, currentMsg]
      this.$bus.$emit(
        'ai_chat',
        textList,
        res => {
          if (!md) {
            md = new MarkdownIt()
          }
          const lastMsg = this.chatList[this.chatList.length - 1]
          if (lastMsg) {
            lastMsg.content_raw = res
            lastMsg.content = md.render(res)
          }
          this.$refs.chatResBoxRef.scrollTop =
            this.$refs.chatResBoxRef.scrollHeight
          this.saveCurrentConversation()
        },
        () => {
          this.isCreating = false
          this.saveCurrentConversation()
        },
        error => {
          this.isCreating = false
          // 移除空的AI占位消息
          const lastMsg = this.chatList[this.chatList.length - 1]
          if (lastMsg && lastMsg.type === 'ai' && !lastMsg.content) {
            this.chatList.pop()
          }
          const errMsg = (error && error.message) || ''
          if (this.isImageUnsupportedError(errMsg)) {
            this.$message.error('该大模型可能不支持图片识别：' + errMsg)
          } else if (errMsg) {
            this.$message.error(errMsg)
          } else {
            this.$message.error(this.$t('ai.generationFailed'))
          }
          this.saveCurrentConversation()
        }
      )
      this.$nextTick(() => {
        if (this.$refs.chatResBoxRef) {
          this.$refs.chatResBoxRef.scrollTop =
            this.$refs.chatResBoxRef.scrollHeight
        }
      })
    },

    // 二开：快速切换模型
    switchModel(model) {
      if (!model || model === this.currentModelName) return
      this.setLocalConfig({ model })
      this.$message.success('已切换模型：' + model)
    },

    // 二开：一键复制消息内容（含图片时一并复制图片到剪贴板）
    async copyMessage(item) {
      const text = item.content_raw || item.content || ''
      const images = item.images || []
      // 无图片：复制纯文本
      if (images.length === 0 || !navigator.clipboard || !navigator.clipboard.write) {
        this.copyText(text, images.length)
        return
      }
      // 有图片：尝试用 ClipboardItem 写入文本 + 第一张图片（剪贴板一次只能写一张图片）
      try {
        const pngBlob = await this.dataUrlToPngBlob(images[0])
        const textBlob = new Blob([text], { type: 'text/plain' })
        const clipboardItem = new ClipboardItem({
          'text/plain': textBlob,
          'image/png': pngBlob
        })
        await navigator.clipboard.write([clipboardItem])
        const tip = images.length > 1
          ? `已复制（含1张图片，共${images.length}张）`
          : '已复制（含图片）'
        this.$message.success(tip)
      } catch (e) {
        // 降级：只复制文本
        this.copyText(text, images.length)
      }
    },

    // dataURL 转 PNG Blob（剪贴板 ClipboardItem 仅支持 image/png）
    dataUrlToPngBlob(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          canvas.toBlob(blob => {
            if (blob) resolve(blob)
            else reject(new Error('toBlob failed'))
          }, 'image/png')
        }
        img.onerror = reject
        img.src = dataUrl
      })
    },

    // 复制纯文本（带图片数量提示）
    copyText(text, imageCount) {
      if (!text && (!imageCount || imageCount === 0)) {
        this.$message.warning('消息内容为空')
        return
      }
      const onSuccess = () => {
        this.$message.success(imageCount > 0 ? `已复制文本（含${imageCount}张图片需手动保存）` : '已复制')
      }
      const fallback = () => {
        try {
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          onSuccess()
        } catch (e) {
          this.$message.error('复制失败')
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(fallback)
      } else {
        fallback()
      }
    },

    // 二开：右键"将节点添加到AI对话" → 提取节点纯文本，加入引用列表
    onAddNodesToAiChat(nodes) {
      if (!nodes || nodes.length === 0) return
      const getTextFromNode = (node) => {
        if (!node) return ''
        const rawText = node.getData('text') || ''
        // 去除 HTML 标签，保留纯文本
        return String(rawText).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      }
      nodes.forEach(node => {
        const text = getTextFromNode(node)
        if (text) {
          // 去重：避免重复添加同一节点
          if (!this.referencedNodes.some(n => n.text === text)) {
            this.referencedNodes.push({ text, uid: node.uid || '' })
          }
        }
      })
      this.$message.success(`已添加 ${nodes.length} 个节点到AI对话`)
    },

    // 移除某个引用节点
    removeNodeRef(index) {
      this.referencedNodes.splice(index, 1)
    },

    onKeydown(e) {
      if (e.keyCode === 13) {
        if (!e.shiftKey) {
          e.preventDefault()
          this.send()
        } else {
        }
      }
    },

    send() {
      if (this.isCreating) return
      const text = this.text.trim()
      const hasImages = this.pasteImages.length > 0
      const hasNodeRefs = this.referencedNodes.length > 0
      if (!text && !hasImages && !hasNodeRefs) {
        return
      }
      const images = this.pasteImages.map(img => img.dataUrl)
      // 二开：拼接引用节点文本到消息中
      let nodeRefsText = ''
      if (hasNodeRefs) {
        nodeRefsText = '以下是引用的节点内容：\n' + this.referencedNodes.map((n, i) => `[节点${i + 1}] ${n.text}`).join('\n')
      }
      this.text = ''
      this.pasteImages = []
      const sentNodeRefs = this.referencedNodes.slice()
      this.referencedNodes = []

      // 文档内容只在当前会话的第一条消息中发送，后续消息不再重复发送以节省token
      let fullText = text
      let displayText = text
      // 拼接引用节点
      if (nodeRefsText) {
        if (text) {
          fullText = nodeRefsText + '\n\n我的问题是：' + text
          displayText = text + '\n[引用节点 ' + sentNodeRefs.length + ' 个]'
        } else {
          fullText = nodeRefsText
          displayText = '[引用节点 ' + sentNodeRefs.length + ' 个]'
        }
      }
      if (this.syncedMarkdown && !this.syncDocSent) {
        if (text || nodeRefsText) {
          fullText =
            '以下是当前思维导图的文档内容：\n' +
            this.syncedMarkdown +
            '\n\n' + fullText
        } else {
          fullText =
            '以下是当前思维导图的文档内容：\n' + this.syncedMarkdown
          displayText = '[已同步文档内容]'
        }
        this.syncDocSent = true
      }

      const historyUserMsgList = this.chatList
        .filter(item => {
          return item.type === 'user'
        })
        .map(item => {
          return item.content_raw || item.content
        })
      this.chatList.push({
        id: createUid(),
        type: 'user',
        content: displayText,
        content_raw: fullText,
        images: images.length > 0 ? images : undefined
      })
      this.chatList.push({
        id: createUid(),
        type: 'ai',
        content: ''
      })
      this.isCreating = true
      this.saveCurrentConversation()

      // 当有图片时，当前消息使用对象格式；历史消息仍为字符串
      let currentMsg
      if (hasImages) {
        currentMsg = { text: fullText, images: images }
      } else {
        currentMsg = fullText
      }
      const textList = [...historyUserMsgList, currentMsg]
      // 二开：发送图片时提示用户确保模型支持视觉能力（部分 API 会静默忽略图片）
      if (hasImages) {
        this.$notify({
          title: '已发送图片',
          message: '请确保您的AI模型支持视觉/多模态能力（如图文识别模型）。部分纯文本模型会忽略图片内容。',
          type: 'warning',
          duration: 4000
        })
      }
      // 调试日志：输出实际发送的消息内容（包含图片 data URL 前 80 字符用于确认）
      console.log('[AI对话] 发送消息:', textList.map(m => {
        if (typeof m === 'string') return { role: 'user', text: m.substring(0, 80) + (m.length > 80 ? '...' : '') }
        return { role: 'user', text: m.text, images: m.images ? m.images.map(img => img.substring(0, 80) + '...') : [] }
      }))
      this.$bus.$emit(
        'ai_chat',
        textList,
        res => {
          if (!md) {
            md = new MarkdownIt()
          }
          const lastMsg = this.chatList[this.chatList.length - 1]
          if (lastMsg) {
            // res 是完整累积文本（非增量），直接赋值
            lastMsg.content_raw = res
            lastMsg.content = md.render(res)
          }
          this.$refs.chatResBoxRef.scrollTop =
            this.$refs.chatResBoxRef.scrollHeight
          // 流式过程中自动保存，避免意外退出丢失
          this.saveCurrentConversation()
        },
        () => {
          this.isCreating = false
          this.saveCurrentConversation()
        },
        error => {
          this.isCreating = false
          // 移除空的AI占位消息
          const lastMsg = this.chatList[this.chatList.length - 1]
          if (lastMsg && lastMsg.type === 'ai' && !lastMsg.content) {
            this.chatList.pop()
          }
          const errMsg = (error && error.message) || ''
          if (this.isImageUnsupportedError(errMsg)) {
            this.$message.error('该大模型可能不支持图片识别：' + errMsg)
          } else if (this.isImageDeserializationError(errMsg)) {
            this.$message.error('当前AI接口不支持发送图片，请更换支持视觉/多模态的模型，或仅发送文字消息')
          } else if (errMsg) {
            this.$message.error(errMsg)
          } else {
            this.$message.error(this.$t('ai.generationFailed'))
          }
          this.saveCurrentConversation()
        }
      )
    },

    stop() {
      this.$bus.$emit('ai_chat_stop')
      this.isCreating = false
    },

    clear() {
      this.chatList = []
      this.saveCurrentConversation()
    },

    modifyAiConfig() {
      this.$bus.$emit('showAiConfigDialog')
    },

    // 粘贴图片：监听 Ctrl+V，提取剪贴板中的图片
    onPaste(e) {
      const items = (e.clipboardData || window.clipboardData).items
      if (!items) return
      let hasImage = false
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type && item.type.startsWith('image/')) {
          hasImage = true
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue
          const reader = new FileReader()
          reader.onload = event => {
            // 压缩图片：缩放到最大 1024px，转为 JPEG 0.85 质量
            // 避免 base64 过大导致 API 拒绝或超时
            this.compressImage(event.target.result, 1024, 0.85).then(compressed => {
              this.pasteImages.push({
                dataUrl: compressed,
                name: blob.name || 'pasted_image.png'
              })
            }).catch(() => {
              // 压缩失败时直接用原图
              this.pasteImages.push({
                dataUrl: event.target.result,
                name: blob.name || 'pasted_image.png'
              })
            })
          }
          reader.readAsDataURL(blob)
        }
      }
    },

    // 压缩图片：通过 canvas 缩放并转为 JPEG
    // maxSize: 最大边长（px），quality: JPEG 质量 0-1
    compressImage(dataUrl, maxSize, quality) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          let { width, height } = img
          // 按比例缩放到 maxSize 以内
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = Math.round(height * maxSize / width)
              width = maxSize
            } else {
              width = Math.round(width * maxSize / height)
              height = maxSize
            }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          // 白色背景（JPEG 不支持透明）
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        }
        img.onerror = reject
        img.src = dataUrl
      })
    },

    // 删除待发送的图片
    removeImage(index) {
      this.pasteImages.splice(index, 1)
    },

    // 检测错误是否为模型不支持图片
    // 仅匹配明确表达"不支持图片/视觉/多模态"的语句，避免误判 image_url、multimodal、
    // content type、image too large 等正常报错为"不支持图片识别"
    isImageUnsupportedError(msg) {
      if (!msg) return false
      const patterns = [
        /does not support.*(image|vision|multimodal)/i,
        /not.*(support|allow).*(image|vision|multimodal)/i,
        /(image|vision|multimodal).*(not supported|unsupported|unavailable|not available)/i,
        /model.*(does not|doesn't|not).*(support|have).*(image|vision|multimodal)/i,
        /不支持.*(图片|图像|视觉|多模态)/i,
        /(图片|图像|视觉|多模态).*(不支持|无法|不能)/i,
        // 火山方舟等 API 特有：content.type 参数非法，取值范围只有 text
        /content\.type.*取值范围.*\[?['"]?text['"]?\]?/i,
        /content\.type.*非法.*取值范围/i,
        /取值范围.*\[?['"]?text['"]?\]?/i
      ]
      return patterns.some(p => p.test(msg))
    },

    // 检测是否为 image_url 反序列化错误（API不支持图片消息格式）
    isImageDeserializationError(msg) {
      if (!msg) return false
      const patterns = [
        /unknown variant.*image_url/i,
        /image_url.*expected.*text/i,
        /failed to deserialize.*image_url/i,
        /invalid.*content.*type.*image/i
      ]
      return patterns.some(p => p.test(msg))
    },

    // 检测文本是否包含 Markdown 格式
    hasMarkdown(text) {
      if (!text) return false
      return /(\*\*|__|##|###|####|`|```|\|.*\||^\s*[-*+]\s|^\s*\d+\.\s|^>\s|---|===)/m.test(text)
    },

    // 切换显示原文/解析
    toggleRaw(item) {
      this.$set(item, 'showRaw', !item.showRaw)
    },

    // HTML 转义（显示原文时用）
    escapeHtml(text) {
      if (!text) return ''
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
    },

    // 一键清空所有历史会话
    clearAllHistory() {
      this.$confirm(
        '确定清空所有历史对话吗？此操作不可撤销。',
        '清空历史对话',
        {
          confirmButtonText: '清空',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonClass: 'el-button--danger'
        }
      )
        .then(() => {
          localStorage.removeItem(HISTORY_CHAT_KEY)
          this.conversationHistory = []
          this.$message.success('已清空所有历史对话')
        })
        .catch(() => {})
    },

    // 同步文档内容：复制当前思维导图的 markdown 文本，发送时一并发送给 AI
    // 如果已同步，则取消同步
    syncDocumentToAI() {
      if (this.syncedMarkdown) {
        this.syncedMarkdown = ''
        this.syncDocSent = false
        this.$message.info('已取消同步文档')
        return
      }
      const outline = this.getMindMapOutline()
      if (!outline) {
        this.$message.warning('当前文档内容为空')
        return
      }
      this.syncedMarkdown = outline
      this.syncDocSent = false
      this.$message.success('已同步文档内容，发送消息时将一并发送给 AI')
    },

    // 递归遍历思维导图节点，获取 markdown 格式的大纲文本
    getMindMapOutline() {
      if (!this.mindMap || !this.mindMap.renderer || !this.mindMap.renderer.root) {
        return ''
      }
      const lines = []
      const walk = (node, depth) => {
        if (!node) return
        const rawText = node.getData('text') || ''
        // 去除 HTML 标签，保留纯文本
        const plainText = String(rawText)
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim()
        if (plainText) {
          if (depth === 0) {
            lines.push('# ' + plainText)
          } else {
            lines.push('  '.repeat(depth - 1) + '- ' + plainText)
          }
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            walk(child, depth + 1)
          })
        }
      }
      walk(this.mindMap.renderer.root, 0)
      return lines.join('\n')
    },

    // 新建会话
    createNewConversation() {
      if (this.isCreating) {
        this.$message.warning('正在生成中，请稍后再试')
        return
      }
      if (this.chatList.length > 0) {
        this.addToHistory()
      }
      this.chatList = []
      this.syncedMarkdown = ''
      this.syncDocSent = false
      this.saveCurrentConversation()
      this.$message.success('已创建新会话')
    },

    // 打开历史对话弹窗
    openHistory() {
      this.conversationHistory = this.getConversationHistory()
      this.historyDialogVisible = true
    },

    // 加载某条历史对话
    loadConversation(conv) {
      if (this.isCreating) {
        this.$message.warning('正在生成中，无法加载历史对话')
        return
      }
      this.chatList = (conv.messages || []).map(msg => ({
        id: createUid(),
        type: msg.type,
        content: msg.content,
        content_raw: msg.content_raw || '',
        showRaw: false
      }))
      this.saveCurrentConversation()
      this.historyDialogVisible = false
      this.$nextTick(() => {
        if (this.$refs.chatResBoxRef) {
          this.$refs.chatResBoxRef.scrollTop =
            this.$refs.chatResBoxRef.scrollHeight
        }
      })
    },

    // 删除某条历史对话
    deleteConversation(id) {
      const history = this.getConversationHistory().filter(item => {
        return item.id !== id
      })
      localStorage.setItem(HISTORY_CHAT_KEY, JSON.stringify(history))
      this.conversationHistory = history
    },

    // 将当前对话保存到历史记录
    addToHistory() {
      const firstUserMsg = this.chatList.find(msg => msg.type === 'user')
      let preview = ''
      if (firstUserMsg) {
        preview = (firstUserMsg.content || '').substring(0, 20)
      }
      const conversation = {
        id: createUid(),
        messages: this.chatList.map(msg => ({
          id: msg.id,
          type: msg.type,
          content: msg.content,
          content_raw: msg.content_raw || ''
        })),
        timestamp: Date.now(),
        preview: preview
      }
      const history = this.getConversationHistory()
      history.unshift(conversation)
      // 限制历史记录数量，最多保留 100 条
      if (history.length > 100) {
        history.length = 100
      }
      localStorage.setItem(HISTORY_CHAT_KEY, JSON.stringify(history))
      this.conversationHistory = history
    },

    // 从 localStorage 读取历史对话列表（仅保留近一个月）
    getConversationHistory() {
      try {
        const data = localStorage.getItem(HISTORY_CHAT_KEY)
        const list = data ? JSON.parse(data) : []
        if (!Array.isArray(list)) return []
        // 过滤掉超过一个月的历史
        const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        const filtered = list.filter(item => item.timestamp >= oneMonthAgo)
        // 如果有过期数据被过滤掉，更新 localStorage
        if (filtered.length !== list.length) {
          localStorage.setItem(HISTORY_CHAT_KEY, JSON.stringify(filtered))
        }
        return filtered
      } catch (e) {
        return []
      }
    },

    // 保存当前对话到 localStorage（用于刷新恢复）
    saveCurrentConversation() {
      try {
        localStorage.setItem(
          CURRENT_CHAT_KEY,
          JSON.stringify(this.chatList)
        )
      } catch (e) {
        // ignore
      }
    },

    // 从 localStorage 恢复上次对话
    restoreCurrentConversation() {
      try {
        const data = localStorage.getItem(CURRENT_CHAT_KEY)
        if (data) {
          const list = JSON.parse(data)
          if (Array.isArray(list) && list.length > 0) {
            this.chatList = list
          }
        }
      } catch (e) {
        // ignore
      }
    },

    // 格式化时间戳为友好显示
    formatTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      const now = new Date()
      const diff = now - date
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
      const month = date.getMonth() + 1
      const day = date.getDate()
      const hours = date.getHours()
      const minutes = date.getMinutes()
      const timeStr =
        (hours < 10 ? '0' + hours : hours) +
        ':' +
        (minutes < 10 ? '0' + minutes : minutes)
      return month + '月' + day + '日 ' + timeStr
    }
  }
}
</script>

<style lang="less" scoped>
.aiChatBox {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &.isDark {
    .chatHeader {
      border-bottom-color: hsla(0, 0%, 100%, 0.1);
    }

    .chatResBox {
      .chatItem {
        &.ai {
          border-color: #409eff;

          .chatItemInner {
            .avatar {
              border-color: #409eff;
              background-color: #262a2e;
            }
          }
        }

        &.user {
          border-color: #f56c6c;

          .chatItemInner {
            .avatar {
              border-color: #f56c6c;
              background-color: #262a2e;
            }
          }
        }

        .chatItemInner {
          .avatar {
            background-color: #262a2e;
          }

          // 二开：dark 模式下复制/重新询问按钮颜色
          .msgCopyBtn {
            color: hsla(0, 0%, 100%, 0.5);

            &:hover {
              color: #66b1ff;
              background-color: hsla(0, 0%, 100%, 0.08);
            }
          }

          .resendBtn {
            color: hsla(0, 0%, 100%, 0.5);

            &:hover {
              color: #f78989;
              background-color: hsla(0, 0%, 100%, 0.08);
            }
          }

          .rawToggleBtn {
            color: hsla(0, 0%, 100%, 0.5);

            &:hover {
              color: #66b1ff;
              background-color: hsla(0, 0%, 100%, 0.08);
            }
          }

          /deep/ .content {
            color: hsla(0, 0%, 100%, 0.85);

            a {
              color: #66b1ff;
            }

            blockquote {
              background-color: hsla(0, 0%, 100%, 0.05);
              border-left-color: #66b1ff;
              color: hsla(0, 0%, 100%, 0.6);
            }

            table {
              th {
                background-color: hsla(0, 0%, 100%, 0.08);
                border-color: hsla(0, 0%, 100%, 0.1);
              }

              td {
                border-color: hsla(0, 0%, 100%, 0.1);
              }

              tr:nth-child(even) {
                background-color: hsla(0, 0%, 100%, 0.03);
              }
            }

            hr {
              border-top-color: hsla(0, 0%, 100%, 0.1);
            }

            code {
              background-color: hsla(0, 0%, 100%, 0.1);
            }

            pre {
              background-color: hsla(0, 0%, 100%, 0.08);
            }
          }
        }
      }
    }

    .actionBar {
      border-top-color: hsla(0, 0%, 100%, 0.1);
      border-bottom-color: hsla(0, 0%, 100%, 0.1);
      background-color: transparent;

      .actionBtn {
        background-color: transparent;
        border-color: hsla(0, 0%, 100%, 0.15);
        color: hsla(0, 0%, 100%, 0.85);

        &:hover {
          background-color: hsla(0, 0%, 100%, 0.08);
          border-color: hsla(0, 0%, 100%, 0.25);
          color: #fff;
        }
      }
    }

    .chatInputBox {
      border-top-color: hsla(0, 0%, 100%, 0.1);

      textarea {
        background-color: transparent;
        color: #fff;

        &::placeholder {
          color: hsla(0, 0%, 100%, 0.35);
        }
      }

      // 二开：dark 模式输入提示文字颜色
      .inputHintInline {
        color: hsla(0, 0%, 100%, 0.35);
      }
    }
  }

  .chatHeader {
    height: 50px;
    flex-shrink: 0;
    border-bottom: 1px solid #e8e8e8;
    display: flex;
    align-items: center;
    padding: 0 12px;
  }

  .chatResBox {
    width: 100%;
    flex: 1;
    min-height: 0;
    padding: 0 12px;
    margin: 12px 0;
    overflow-y: auto;
    overflow-x: hidden;

    .chatItem {
      margin-bottom: 20px;
      border: 1px solid;
      position: relative;
      border-radius: 10px;

      &:last-of-type {
        margin-bottom: 0;
      }

      // 二开：hover 时显示复制/重新询问按钮
      &:hover {
        .msgCopyBtn,
        .resendBtn {
          opacity: 1;
        }
      }

      &.ai {
        border-color: #409eff;

        .chatItemInner {
          .avatar {
            border-color: #409eff;
            left: -8px;
            bottom: -8px;
            color: #409eff;
          }
        }
      }

      &.user {
        border-color: #f56c6c;

        .chatItemInner {
          .avatar {
            border-color: #f56c6c;
            right: -8px;
            bottom: -8px;
            color: #f56c6c;
          }
        }
      }

      .chatItemInner {
        width: 100%;
        padding: 12px;
        position: relative;

        .avatar {
          width: 22px;
          height: 22px;
          border: 1px solid;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: absolute;
          background-color: #fff;
          font-size: 10px;
          font-weight: 600;
          line-height: 1;
          z-index: 1;
        }

        .rawToggleBtn {
          position: absolute;
          right: 8px;
          bottom: 4px;
          font-size: 11px;
          color: #b0b0b0;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
          transition: all 0.2s;
          user-select: none;

          &:hover {
            color: #409eff;
            background-color: #ecf5ff;
          }
        }

        // 二开：右上角一键复制按钮（hover 显示）
        .msgCopyBtn {
          position: absolute;
          right: 6px;
          top: 4px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: #b0b0b0;
          cursor: pointer;
          border-radius: 4px;
          opacity: 0;
          transition: all 0.2s;
          z-index: 2;

          &:hover {
            color: #409eff;
            background-color: #ecf5ff;
          }
        }

        // 二开：左下角重新询问按钮（仅 user 消息，hover 显示）
        .resendBtn {
          position: absolute;
          left: 8px;
          bottom: 4px;
          display: flex;
          align-items: center;
          gap: 2px;
          font-size: 11px;
          color: #b0b0b0;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
          opacity: 0;
          transition: all 0.2s;
          user-select: none;
          z-index: 2;

          &:hover {
            color: #f56c6c;
            background-color: #fef0f0;
          }
        }

        /deep/ .content {
          width: 100%;
          overflow: hidden;
          color: #3f4a54;
          font-size: 14px;
          line-height: 1.5;

          .msgImages {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 8px;

            .msgImage {
              max-width: 120px;
              max-height: 120px;
              border-radius: 6px;
              object-fit: cover;
            }
          }

          p {
            margin-bottom: 12px;

            &:last-of-type {
              margin-bottom: 0;
            }
          }

          h1,
          h2,
          h3,
          h4,
          h5,
          h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
          }

          h1 { font-size: 1.5em; }
          h2 { font-size: 1.3em; }
          h3 { font-size: 1.2em; }
          h4 { font-size: 1.1em; }

          strong,
          b {
            font-weight: 700;
          }

          em,
          i {
            font-style: italic;
          }

          a {
            color: #409eff;
            text-decoration: none;

            &:hover {
              text-decoration: underline;
            }
          }

          ul,
          ol {
            margin-bottom: 12px;
            padding-left: 24px;

            li {
              margin-bottom: 4px;
            }
          }

          blockquote {
            margin-bottom: 12px;
            padding: 8px 16px;
            border-left: 4px solid #409eff;
            background-color: rgba(64, 158, 255, 0.05);
            color: #666;

            p:last-of-type {
              margin-bottom: 0;
            }
          }

          hr {
            border: none;
            border-top: 1px solid #e0e0e0;
            margin: 16px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            font-size: 13px;

            th,
            td {
              border: 1px solid #e0e0e0;
              padding: 8px 12px;
              text-align: left;
            }

            th {
              background-color: #f5f7fa;
              font-weight: 600;
            }

            tr:nth-child(even) {
              background-color: #fafafa;
            }
          }

          code {
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            white-space: break-spaces;
            background-color: rgba(175, 184, 193, 0.2);
            border-radius: 6px;
            font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas,
              Liberation Mono, monospace;
          }

          pre {
            padding: 12px;
            background-color: rgba(175, 184, 193, 0.2);
            border-radius: 8px;
            overflow-x: auto;

            code {
              background-color: transparent;
              padding: 0;
              overflow: hidden;
            }
          }
        }
      }
    }
  }

  .actionBar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-top: 1px solid #e8e8e8;
    border-bottom: 1px solid #e8e8e8;
    background-color: #fafafa;

    .actionBtns {
      display: flex;
      align-items: center;

      .actionBtn + .actionBtn {
        margin-left: 6px;
      }

      // 二开：切换模型下拉与前一个按钮的间距
      .el-dropdown {
        margin-left: 6px;
      }
    }

    .actionBtn {
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 12px;
      transition: all 0.2s;

      &:hover {
        background-color: #ecf5ff;
        border-color: #c6e2ff;
        color: #409eff;
      }

      &.synced {
        background-color: #f0f9eb;
        border-color: #b3e19d;
        color: #67c23a;
      }
    }

    // 二开：切换模型按钮（显示当前模型名，点击向上展开列表）
    .modelSwitchBtn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      max-width: 170px;

      .modelSwitchName {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 120px;
      }

      .modelSwitchArrow {
        font-size: 10px;
      }
    }
  }

  .chatInputBox {
    flex-shrink: 0;
    width: 100%;
    min-height: 150px;
    border-top: 1px solid #e8e8e8;
    position: relative;
    display: flex;
    flex-direction: column;

    .pastePreview {
      flex-shrink: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px 0;
    }

    .pastePreviewItem {
      position: relative;
      width: 60px;
      height: 60px;
      border-radius: 6px;
      overflow: visible;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 6px;
      }

      .removeImg {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background-color: #f56c6c;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 12px;
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 1;
      }

      &:hover .removeImg {
        opacity: 1;
      }
    }

    /* 二开：引用节点预览区（灰色背景，类似文件引用样式） */
    .nodeRefPreview {
      flex-shrink: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 12px 0;
      max-height: 100px;
      overflow-y: auto;
    }

    .nodeRefItem {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
      padding: 4px 8px;
      background-color: rgba(175, 184, 193, 0.2);
      border-radius: 6px;
      font-size: 12px;
      color: #586069;
      position: relative;

      .nodeRefIcon {
        font-size: 12px;
        color: #909090;
        flex-shrink: 0;
      }

      .nodeRefText {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 160px;
      }

      .removeNodeRef {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 10px;
        color: #b0b0b0;
        transition: all 0.2s;
        flex-shrink: 0;

        &:hover {
          background-color: #f56c6c;
          color: #fff;
        }
      }
    }

    textarea {
      width: 100%;
      flex: 1;
      min-height: 100px;
      outline: none;
      padding: 12px;
      border: none;
    }

    // 二开：输入提示移到输入框内（textarea 下方，右侧留出发送按钮空间）
    .inputHintInline {
      flex-shrink: 0;
      padding: 0 90px 6px 12px;
      font-size: 11px;
      color: #b0b0b0;
    }

    .btn {
      position: absolute;
      right: 12px;
      bottom: 12px;
    }

    .stop {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      top: -30px;
    }
  }
}
</style>

<style lang="less">
.aiHistoryDialog {
  border-radius: 12px;
  overflow: hidden;

  .el-dialog__header {
    padding: 16px 20px;
    border-bottom: 1px solid #f0f0f0;
  }

  .el-dialog__body {
    padding: 0;
  }

  .emptyHistory {
    text-align: center;
    padding: 40px 20px;
    color: #999;
    font-size: 14px;
  }

  .historyClearBtn {
    padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    justify-content: flex-end;
  }

  .historyList {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
  }

  .historyItem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: #f5f7fa;
    }

    .historyInfo {
      flex: 1;
      min-width: 0;
      overflow: hidden;

      .historyPreview {
        font-size: 13px;
        color: #3f4a54;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 4px;
      }

      .historyTime {
        font-size: 11px;
        color: #b0b0b0;
      }
    }

    .deleteBtn {
      flex-shrink: 0;
      padding: 4px;
      color: #c0c4cc;

      &:hover {
        color: #f56c6c;
      }
    }
  }

  &.aiHistoryDialogDark {
    background-color: #262a2e;

    .el-dialog__header {
      border-bottom-color: hsla(0, 0%, 100%, 0.1);

      .el-dialog__title {
        color: #fff;
      }
    }

    .emptyHistory {
      color: hsla(0, 0%, 100%, 0.4);
    }

    .historyItem {
      &:hover {
        background-color: hsla(0, 0%, 100%, 0.08);
      }

      .historyPreview {
        color: hsla(0, 0%, 100%, 0.85);
      }

      .historyTime {
        color: hsla(0, 0%, 100%, 0.4);
      }

      .deleteBtn {
        color: hsla(0, 0%, 100%, 0.4);

        &:hover {
          color: #f56c6c;
        }
      }
    }
  }
}

/* 二开：切换模型下拉菜单样式（非 scoped，因为 el-dropdown-menu append-to-body） */
.modelSwitchMenu {
  max-height: 300px;
  overflow-y: auto;

  .el-dropdown-menu__item {
    &.activeModel {
      color: #409eff;
      font-weight: 600;
    }

    .el-icon-check {
      margin-right: 4px;
    }
  }
}
</style>
