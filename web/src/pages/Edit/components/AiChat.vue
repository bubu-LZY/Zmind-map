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
            <div class="avatar">
              <span class="icon el-icon-user"></span>
            </div>
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
          </div>
          <div class="chatItemInner" v-else-if="item.type === 'ai'">
            <div class="avatar">
              <span class="icon iconfont iconAIshengcheng"></span>
            </div>
            <div class="content" v-html="item.content"></div>
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
        </div>
        <div class="inputHint">Enter 发送 · Shift+Enter 换行 · Ctrl+V 粘贴图片</div>
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
        <textarea
          v-model="text"
          class="customScrollbar"
          :placeholder="$t('ai.chatInputPlaceholder')"
          @keydown="onKeydown"
          @paste="onPaste"
        ></textarea>
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
import { mapState } from 'vuex'
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
      pasteImages: []
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    })
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
  },
  beforeDestroy() {},
  methods: {
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
      if (!text && !hasImages) {
        return
      }
      const images = this.pasteImages.map(img => img.dataUrl)
      this.text = ''
      this.pasteImages = []

      // 文档内容只在当前会话的第一条消息中发送，后续消息不再重复发送以节省token
      let fullText = text
      let displayText = text
      if (this.syncedMarkdown && !this.syncDocSent) {
        if (text) {
          fullText =
            '以下是当前思维导图的文档内容：\n' +
            this.syncedMarkdown +
            '\n\n我的问题是：' +
            text
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
      this.$bus.$emit(
        'ai_chat',
        textList,
        res => {
          if (!md) {
            md = new MarkdownIt()
          }
          const lastMsg = this.chatList[this.chatList.length - 1]
          if (lastMsg) {
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
          if (this.isImageUnsupportedError((error && error.message) || '')) {
            this.$message.error('该大模型不支持图片识别')
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
            this.pasteImages.push({
              dataUrl: event.target.result,
              name: blob.name || 'pasted_image.png'
            })
          }
          reader.readAsDataURL(blob)
        }
      }
    },

    // 删除待发送的图片
    removeImage(index) {
      this.pasteImages.splice(index, 1)
    },

    // 检测错误是否为模型不支持图片
    isImageUnsupportedError(msg) {
      if (!msg) return false
      const patterns = [
        /not.*(support|allow|available).*image/i,
        /image.*(not|unsupport|invalid|error)/i,
        /does not support.*image/i,
        /vision.*not/i,
        /multimodal/i,
        /image_url/i,
        /unsupported.*content.*type/i,
        /invalid.*content.*type/i,
        /不支持.*图/i,
        /图片.*不支持/i,
        /无法.*识别.*图/i,
        /content.*type.*not.*allow/i
      ]
      return patterns.some(p => p.test(msg))
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
        content: msg.content
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
          content: msg.content
        })),
        timestamp: Date.now(),
        preview: preview
      }
      const history = this.getConversationHistory()
      history.unshift(conversation)
      localStorage.setItem(HISTORY_CHAT_KEY, JSON.stringify(history))
      this.conversationHistory = history
    },

    // 从 localStorage 读取历史对话列表
    getConversationHistory() {
      try {
        const data = localStorage.getItem(HISTORY_CHAT_KEY)
        const list = data ? JSON.parse(data) : []
        return Array.isArray(list) ? list : []
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

          /deep/ .content {
            color: hsla(0, 0%, 100%, 0.85);
          }
        }
      }
    }

    .actionBar {
      border-top-color: hsla(0, 0%, 100%, 0.1);
      border-bottom-color: hsla(0, 0%, 100%, 0.1);
      background-color: transparent;

      .inputHint {
        color: hsla(0, 0%, 100%, 0.35);
      }

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

      &.ai {
        border-color: #409eff;

        .chatItemInner {
          .avatar {
            border-color: #409eff;
            left: -12px;
            top: -12px;

            .icon {
              color: #409eff;
            }
          }
        }
      }

      &.user {
        border-color: #f56c6c;

        .chatItemInner {
          .avatar {
            border-color: #f56c6c;
            right: -12px;
            top: -12px;

            .icon {
              color: #f56c6c;
            }
          }
        }
      }

      .chatItemInner {
        width: 100%;
        padding: 12px;

        .avatar {
          width: 30px;
          height: 30px;
          border: 1px solid;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: absolute;
          background-color: #fff;

          .icon {
            font-size: 18px;
            font-weight: bold;
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

    .inputHint {
      font-size: 11px;
      color: #b0b0b0;
      white-space: nowrap;
      flex-shrink: 0;
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

    textarea {
      width: 100%;
      flex: 1;
      min-height: 100px;
      outline: none;
      padding: 12px;
      border: none;
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
</style>
