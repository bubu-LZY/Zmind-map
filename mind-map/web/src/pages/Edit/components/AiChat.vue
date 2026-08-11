<template>
  <div
    class="aiChatPanel"
    :class="{ show: panelVisible, isDark: isDark }"
    :style="{ left: panelX + 'px', top: panelY + 'px', width: panelW + 'px', height: panelH + 'px', zIndex: panelZ }"
    @click.stop
  >
    <!-- 可拖拽标题栏 -->
    <div class="aiChatDragBar" @mousedown.prevent="startDrag">
      <span class="aiChatTitle">{{ $t('ai.chatTitle') }}</span>
      <span class="aiChatCloseBtn el-icon-close" @click="closePanel"></span>
    </div>
    <div class="aiChatBox" :class="{ isDark: isDark }">
      <div class="chatHeader">
        <el-button size="mini" @click="clear">
          <span class="el-icon-delete"></span>
          {{ $t('ai.clearRecords') }}
        </el-button>
        <el-button size="mini" @click="openMemoryManager" title="管理AI记忆">
          <span class="el-icon-cpu"></span>
          记忆
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
            <!-- 二开：思维导图模式操作按钮（插入子节点 / 替换节点 / 显示原文） -->
            <div class="mmActionRow" v-if="item.isMindMap && item.content_raw">
              <div class="mmActionBtn" v-if="!isCreating" @click="insertAsChild(item)" title="将思维导图插入为某节点的子节点（保留原子节点）">
                <span class="el-icon-bottom"></span> 插入子节点
              </div>
              <div class="mmActionBtn" v-if="!isCreating" @click="replaceNodeContent(item)" title="用思维导图替换某节点及其子节点">
                <span class="el-icon-refresh"></span> 替换节点
              </div>
              <div class="rawToggleBtn" @click="toggleRaw(item)">
                {{ item.showRaw ? '显示解析' : '显示原文' }}
              </div>
            </div>
            <!-- 非思维导图模式的显示原文按钮 -->
            <div
              class="rawToggleBtn"
              v-if="!item.isMindMap && item.content_raw && hasMarkdown(item.content_raw)"
              @click="toggleRaw(item)"
            >
              {{ item.showRaw ? '显示解析' : '显示原文' }}
            </div>
            <!-- 二开：智能内容导出按钮（根据内容类型自动显示可用的导出选项） -->
            <el-dropdown
              v-if="item.content_raw && item.content_raw.trim() && !item.isMindMap"
              trigger="click"
              placement="bottom-end"
              @command="cmd => handleExportAction(cmd, item)"
            >
              <div class="contentExportBtn" title="导出此回复内容">
                <span class="el-icon-download"></span>
                <span class="exportLabel">导出</span>
              </div>
              <el-dropdown-menu slot="dropdown" class="contentExportMenu">
                <el-dropdown-item
                  v-for="opt in getExportOptions(item)"
                  :key="opt.action"
                  :command="opt.action"
                >
                  <span :class="opt.icon"></span>
                  {{ opt.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
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
          <!-- 二开：思维导图生成模式开关 -->
          <el-button
            class="actionBtn"
            :class="{ synced: mindMapMode }"
            size="mini"
            @click="toggleMindMapMode"
            :title="mindMapMode ? '已开启思维导图生成，点击关闭' : '开启后AI按思维导图格式回复'"
          >
            <span class="el-icon-share"></span>
            {{ mindMapMode ? '导图已开' : '思维导图' }}
          </el-button>
          <!-- 二开：联网搜索开关（通过模型原生能力，无需额外API） -->
          <el-button
            class="actionBtn"
            :class="{ synced: webSearchEnabled }"
            size="mini"
            @click="webSearchEnabled = !webSearchEnabled"
            :title="webSearchEnabled ? '已开启联网搜索，点击关闭' : '开启后AI可联网搜索（需模型支持）'"
          >
            <span class="el-icon-aim"></span>
            {{ webSearchEnabled ? '搜索已开' : '联网搜索' }}
          </el-button>
          <!-- 二开：信任模式开关（开启后AI获得所有操作权限，无需逐次确认） -->
          <el-button
            class="actionBtn"
            :class="{ synced: trustModeEnabled }"
            size="mini"
            @click="toggleTrustMode"
            :title="trustModeEnabled ? '信任模式已开启，AI操作无需确认，点击关闭' : '开启后AI的所有操作无需逐次确认（查询/编辑/样式/导出）'"
          >
            <span class="el-icon-unlock"></span>
            {{ trustModeEnabled ? '信任已开' : '信任模式' }}
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
        <!-- 二开：底部工具行：深度思考 + 模型选择 + 发送 -->
        <div class="inputActionRow">
          <el-button
            class="actionBtn thinkToggleBtn"
            :class="{ active: chatThinking }"
            size="mini"
            @click="chatThinking = !chatThinking"
            :title="chatThinking ? '已开启深度思考，点击关闭' : '开启深度思考模式'"
          >
            <span class="el-icon-magic-stick"></span>
            {{ chatThinking ? '思考已开' : '深度思考' }}
          </el-button>
          <!-- 二开：模型选择按钮（与深度思考并列） -->
          <el-dropdown
            trigger="click"
            placement="top"
            @command="switchModel"
            @visible-change="onModelDropdownVisible"
            :disabled="!aiConfig || !aiConfig.api || !aiConfig.key"
          >
            <el-button
              class="actionBtn modelSwitchBtn"
              size="mini"
              :loading="modelDetecting"
              :title="modelList && modelList.length ? '切换模型' : '点击自动检测可用模型'"
            >
              <span class="el-icon-cpu"></span>
              <span class="modelSwitchName">{{ currentModelName || '选择模型' }}</span>
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
              <el-dropdown-item v-if="modelDetecting" disabled>
                <span class="el-icon-loading"></span> 检测模型中...
              </el-dropdown-item>
              <el-dropdown-item v-if="!modelDetecting && (!modelList || modelList.length === 0)" disabled>
                <span style="color:#999">未检测到模型，请检查AI配置</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
          <el-button class="btn sendBtn" size="mini" @click="send" :loading="isCreating || isToolExecuting">
            {{ $t('ai.send') }}
            <span class="el-icon-position"></span>
          </el-button>
          <el-button
            class="stop"
            size="mini"
            type="warning"
            @click="stop"
            v-show="isCreating || isToolExecuting"
          >
            {{ $t('ai.stopGenerating') }}
          </el-button>
        </div>
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
    <!-- 二开：AI工具调用权限对话框 -->
    <el-dialog
      title="AI请求操作思维导图"
      :visible.sync="aiToolPermissionVisible"
      width="420px"
      append-to-body
      :close-on-click-modal="false"
      :custom-class="isDark ? 'aiToolDialog aiToolDialogDark' : 'aiToolDialog'"
    >
      <div class="toolPermissionContent">
        <p class="toolPermissionTitle">AI想要执行以下操作：</p>
        <div class="toolCallList">
          <div class="toolCallItem" v-for="(tc, i) in pendingToolCalls" :key="i">
            <span class="toolCallIcon el-icon-search"></span>
            <span class="toolCallDesc">{{ tc.description }}</span>
          </div>
        </div>
        <p class="toolPermissionNote">授权后，AI可以在本次对话中查询和编辑思维导图内容。你可以随时新建会话来撤销授权。</p>
      </div>
      <div slot="footer" class="toolPermissionFooter">
        <el-button size="small" @click="denyToolPermission">拒绝</el-button>
        <el-button size="small" type="primary" @click="grantToolPermission">允许操作</el-button>
      </div>
    </el-dialog>
    <!-- 二开：记忆管理对话框 -->
    <el-dialog
      title="AI记忆管理"
      :visible.sync="memoryDialogVisible"
      width="460px"
      append-to-body
      :custom-class="isDark ? 'aiMemoryDialog aiMemoryDialogDark' : 'aiMemoryDialog'"
    >
      <div class="memoryManager">
        <div class="memoryAddRow">
          <el-input
            v-model="memoryNewText"
            size="small"
            placeholder="输入新的记忆内容，按回车添加"
            @keydown.enter.native="addMemory"
          ></el-input>
          <el-button size="small" type="primary" @click="addMemory" :disabled="!memoryNewText.trim()">
            <span class="el-icon-plus"></span>
          </el-button>
        </div>
        <div class="memoryList customScrollbar" v-if="memoryList.length > 0">
          <div
            class="memoryItem"
            v-for="(mem, index) in memoryList"
            :key="index"
          >
            <template v-if="memoryEditingIndex === index">
              <el-input
                v-model="memoryEditText"
                size="mini"
                ref="memoryEditInput"
                @keydown.enter.native="saveMemoryEdit(index)"
                @keydown.esc.native="cancelMemoryEdit"
              ></el-input>
              <el-button size="mini" type="success" @click="saveMemoryEdit(index)">
                <span class="el-icon-check"></span>
              </el-button>
              <el-button size="mini" @click="cancelMemoryEdit">
                <span class="el-icon-close"></span>
              </el-button>
            </template>
            <template v-else>
              <span class="memoryText">{{ mem.text }}</span>
              <span class="memoryTime">{{ formatMemoryTime(mem.timestamp) }}</span>
              <div class="memoryActions">
                <span class="memoryActionBtn el-icon-edit" @click="startMemoryEdit(index)" title="编辑"></span>
                <span class="memoryActionBtn el-icon-delete memoryDeleteBtn" @click="deleteMemory(index)" title="删除"></span>
              </div>
            </template>
          </div>
        </div>
        <div v-else class="memoryEmpty">
          暂无记忆内容
        </div>
      </div>
      <div slot="footer">
        <el-button size="small" @click="memoryDialogVisible = false">关闭</el-button>
        <el-button size="small" type="danger" plain @click="clearAllMemory" v-if="memoryList.length > 0">
          清空所有记忆
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import { createUid } from 'simple-mind-map/src/utils'
import { transformMarkdownTo } from 'simple-mind-map/src/parse/markdownTo'
import MarkdownIt from 'markdown-it'
import { getFs } from '@/utils/webFs'
import { smartClozeNodes } from '@/utils/aiCloze'

let md = null

const CURRENT_CHAT_KEY = 'ZMIND_AI_CHAT_CURRENT'
const HISTORY_CHAT_KEY = 'ZMIND_AI_CHAT_HISTORY'
// 支持的思维导图文件扩展名
const SUPPORT_FILE_EXT = /\.(smm|json|md)$/i

export default {
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
      referencedNodes: [],
      // 二开：模型自动检测中状态
      modelDetecting: false,
      // 二开：思维导图生成模式（AI按markdown格式回复并实时渲染为树）
      mindMapMode: false,
      // 二开：深度思考开关（本次对话是否启用深度思考）
      chatThinking: false,
      // 二开：AI工具调用 - 是否已授权AI查询文档（本次会话内有效）
      aiToolPermissionGranted: false,
      // 二开：AI工具调用 - 权限对话框
      aiToolPermissionVisible: false,
      // 二开：AI工具调用 - 待执行的工具调用列表
      pendingToolCalls: [],
      // 二开：AI工具调用 - 工具执行中的回调（权限批准后执行）
      pendingToolCallback: null,
      // 二开：AI工具调用 - 是否正在执行工具查询
      isToolExecuting: false,
      // 二开：联网搜索开关（通过模型原生能力）
      webSearchEnabled: false,
      // 二开：信任模式（开启后AI获得所有操作权限，无需逐次确认）
      trustModeEnabled: false,
      // 二开：独立面板状态
      panelVisible: false,
      panelX: 0,
      panelY: 0,
      panelW: 400,
      panelH: 600,
      panelZ: 1000,
      _dragging: false,
      // 二开：记忆管理
      memoryDialogVisible: false,
      memoryList: [],
      memoryEditingIndex: -1,
      memoryEditText: '',
      memoryNewText: ''
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      aiConfig: state => state.aiConfig,
      currentFilePath: state => state.currentFilePath
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
        this.openPanel()
      }
    }
  },
  created() {
    this.restoreCurrentConversation()
    this.conversationHistory = this.getConversationHistory()
    // 二开：监听右键"将节点添加到AI对话"
    this.$bus.$on('add_nodes_to_ai_chat', this.onAddNodesToAiChat)
    // 二开：安全看门狗 —— 检测并清除卡住的 loading 状态
    this._loadingWatchdog = setInterval(() => {
      if (this.isCreating || this.isToolExecuting) {
        const now = Date.now()
        if (!this._lastLoadingTime) {
          this._lastLoadingTime = now
        } else if (now - this._lastLoadingTime > 120000) {
          // 超过 120 秒仍未结束，强制清除
          console.warn('[AI对话] 检测到 loading 状态超时(120s)，强制清除')
          this.isCreating = false
          this.isToolExecuting = false
          // 清除消息中的 loading 提示
          if (!md) md = new MarkdownIt()
          this.chatList.forEach(msg => {
            if (msg.type === 'ai' && msg.content && msg.content.includes('toolExecutingHint')) {
              const cleanText = this.stripToolCalls(this.stripMemoryTags(msg.content_raw || ''))
              msg.content = cleanText ? md.render(cleanText) : ''
            }
          })
          this._lastLoadingTime = null
        }
      } else {
        this._lastLoadingTime = null
      }
    }, 5000)
  },
  beforeDestroy() {
    this.$bus.$off('add_nodes_to_ai_chat', this.onAddNodesToAiChat)
    if (this._loadingWatchdog) {
      clearInterval(this._loadingWatchdog)
      this._loadingWatchdog = null
    }
  },
  methods: {
    ...mapMutations(['setLocalConfig', 'setActiveSidebar']),

    // 二开：打开独立面板（居中显示）
    openPanel() {
      const winW = window.innerWidth
      const winH = window.innerHeight
      // 面板宽高（自适应），增宽以容纳更多按钮
      this.panelW = Math.min(480, winW - 40)
      this.panelH = Math.min(680, winH - 80)
      // 居中偏右
      this.panelX = winW - this.panelW - 20
      this.panelY = 60
      this.panelZ = 1000
      this.panelVisible = true
    },

    // 二开：关闭面板
    closePanel() {
      this.panelVisible = false
      this.setActiveSidebar(null)
    },

    // 二开：拖拽面板
    startDrag(e) {
      if (this._dragging) return
      this._dragging = true
      const startX = e.clientX
      const startY = e.clientY
      const origX = this.panelX
      const origY = this.panelY
      const onMove = (ev) => {
        let nx = origX + (ev.clientX - startX)
        let ny = origY + (ev.clientY - startY)
        // 限制在可视区域内
        nx = Math.max(0, Math.min(nx, window.innerWidth - 60))
        ny = Math.max(0, Math.min(ny, window.innerHeight - 40))
        this.panelX = nx
        this.panelY = ny
      }
      const onUp = () => {
        this._dragging = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },

    // 二开：重新询问 —— 把对应消息重新发送给 AI（追加到对话末尾）
    resendMessage(item) {
      if (this.isCreating || this.isToolExecuting) {
        this.$message.warning('AI正在处理中，请稍后再试')
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

    // 二开：下拉菜单展开时，如果没有模型列表则自动检测
    onModelDropdownVisible(visible) {
      if (visible && (!this.modelList || this.modelList.length === 0)) {
        this.fetchModelsForChat()
      }
    },

    // 二开：自动检测可用模型列表（在AI对话窗口直接调用，无需打开AI配置弹窗）
    async fetchModelsForChat() {
      if (!this.aiConfig || !this.aiConfig.api || !this.aiConfig.key) {
        this.$message.warning('请先配置AI接口地址和Key')
        return
      }
      // 已有模型列表则不重复检测
      if (this.modelList && this.modelList.length > 0) return
      this.modelDetecting = true
      try {
        let modelsUrl = this.aiConfig.api.replace(/\/+$/, '')
        if (modelsUrl.includes('/chat/completions')) {
          modelsUrl = modelsUrl.replace('/chat/completions', '/models')
        } else {
          const urlObj = new URL(modelsUrl)
          const pathParts = urlObj.pathname.split('/').filter(Boolean)
          if (pathParts.length > 0) {
            pathParts[pathParts.length - 1] = 'models'
            urlObj.pathname = '/' + pathParts.join('/')
            modelsUrl = urlObj.toString()
          }
        }
        const res = await fetch(modelsUrl, {
          method: 'GET',
          headers: { Authorization: 'Bearer ' + this.aiConfig.key }
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        let models = []
        if (data.data && Array.isArray(data.data)) {
          models = data.data.map(m => m.id).filter(Boolean)
        } else if (Array.isArray(data.models)) {
          models = data.models.map(m => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
        } else if (Array.isArray(data)) {
          models = data.map(m => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
        }
        models = models.sort()
        this.setLocalConfig({ modelList: models })
        if (models.length > 0) {
          this.$message.success(`检测到 ${models.length} 个可用模型`)
        } else {
          this.$message.warning('未检测到可用模型，请在AI配置中手动输入')
        }
      } catch (error) {
        this.$message.error('获取模型列表失败：' + (error.message || '未知错误'))
      } finally {
        this.modelDetecting = false
      }
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
    // 同时存储节点对象引用，用于后续构建层级关系和工具查询
    onAddNodesToAiChat(nodes) {
      if (!nodes || nodes.length === 0) return
      const getTextFromNode = (node) => {
        if (!node) return ''
        const rawText = node.getData('text') || ''
        return String(rawText).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      }
      let addedCount = 0
      nodes.forEach(node => {
        const text = getTextFromNode(node)
        if (text) {
          // 去重：避免重复添加同一节点（按 uid 去重，uid 为空时按 text 去重）
          const dup = this.referencedNodes.some(n =>
            (node.uid && n.uid === node.uid) || (!node.uid && n.text === text)
          )
          if (!dup) {
            this.referencedNodes.push({
              text,
              uid: node.uid || '',
              // 存储节点对象引用，用于构建层级关系和工具查询
              _node: node
            })
            addedCount++
          }
        }
      })
      // 检测是否存在上下级关系
      const hasHierarchy = this.detectNodeHierarchy(nodes)
      if (hasHierarchy) {
        this.$message.success(`已添加 ${addedCount} 个节点到AI对话（检测到层级关系，将自动包含）`)
      } else {
        this.$message.success(`已添加 ${addedCount} 个节点到AI对话`)
      }
    },

    // 二开：检测选中的节点之间是否存在上下级关系
    detectNodeHierarchy(nodes) {
      if (!nodes || nodes.length <= 1) return false
      const uidSet = new Set(nodes.map(n => n.uid).filter(Boolean))
      for (const node of nodes) {
        let parent = node.parent
        while (parent) {
          if (uidSet.has(parent.uid)) return true
          parent = parent.parent
        }
      }
      return false
    },

    // 二开：将引用的节点构建为带层级关系的文本
    buildReferencedNodesText() {
      if (this.referencedNodes.length === 0) return ''
      const getTextFromNode = (node) => {
        if (!node) return ''
        const rawText = node.getData('text') || ''
        return String(rawText).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      }

      // 收集所有引用节点的 uid
      const refUidSet = new Set()
      const refNodes = []
      this.referencedNodes.forEach(ref => {
        if (ref._node) {
          refUidSet.add(ref._node.uid)
          refNodes.push(ref._node)
        }
      })

      // 如果只有一个节点或没有节点引用，使用简单格式
      if (refNodes.length <= 1) {
        return this.referencedNodes.map((n, i) => `[节点${i + 1}] ${n.text}`).join('\n')
      }

      // 检测是否有层级关系
      const hasHierarchy = this.detectNodeHierarchy(refNodes)
      if (!hasHierarchy) {
        // 无层级关系，使用简单格式
        return this.referencedNodes.map((n, i) => `[节点${i + 1}] ${n.text}`).join('\n')
      }

      // 有层级关系：构建树形结构
      // 找出根节点（父节点不在选中集合中的节点）
      const roots = refNodes.filter(n => {
        let parent = n.parent
        while (parent) {
          if (refUidSet.has(parent.uid)) return false
          parent = parent.parent
        }
        return true
      })

      // 递归构建层级文本
      const buildTree = (node, depth) => {
        const text = getTextFromNode(node)
        if (!text) return ''
        const indent = depth === 0 ? '' : '  '.repeat(depth) + '- '
        let line = indent + text
        // 只包含在选中集合中的子节点
        const selectedChildren = (node.children || []).filter(child =>
          refUidSet.has(child.uid)
        )
        selectedChildren.forEach(child => {
          const childLine = buildTree(child, depth + 1)
          if (childLine) line += '\n' + childLine
        })
        return line
      }

      let result = '以下是引用的节点（含层级关系）：\n'
      roots.forEach((root, i) => {
        if (i > 0) result += '\n'
        result += buildTree(root, 0)
      })
      return result
    },

    // 移除某个引用节点
    removeNodeRef(index) {
      this.referencedNodes.splice(index, 1)
    },

    // ============ 二开：AI工具调用系统（基于提示词的伪工具调用，兼容所有模型） ============

    // 构建工具系统提示词（默认激活，只要配置了AI即可使用工具）
    buildToolSystemPrompt() {
      // 工具系统默认激活，无需任何前提条件
      return [
        '',
        '【思维导图智能体工具系统】',
        '你可以使用以下工具来查询、编辑思维导图节点，设置样式，管理复习计划，以及导出文档。所有操作都需要用户授权。',
        '',
        '重要工作流程：',
        '1. 先理解用户的问题，判断需要调用哪些工具',
        '2. 在回复中输出工具调用（格式见下方），工具调用必须独占一行',
        '3. 系统会执行工具并将结果返回给你',
        '4. 你必须根据工具返回的结果来回答用户的问题，不要在工具返回前就给出答案',
        '5. 如果工具返回的信息不足以回答，可以继续调用其他工具',
        '',
        '可用工具（在回复中独占一行输出，可同时调用多个）：',
        '',
        '=== 查询类工具 ===',
        '1. <<TOOL:query_hierarchy|node=节点文本>> - 查询指定节点的完整上下级层级关系（所有上游父节点到根节点 + 所有下游子节点）',
        '2. <<TOOL:query_parent|node=节点文本>> - 查询指定节点的直接父节点',
        '3. <<TOOL:query_children|node=节点文本>> - 查询指定节点的所有子节点',
        '4. <<TOOL:search_document|keyword=关键词>> - 在当前思维导图中搜索包含指定关键词的节点',
        '4b. <<TOOL:search_files|keyword=关键词>> - 在侧边目录树中搜索文件名包含关键词的文档，返回文件列表',
        '4c. <<TOOL:read_file|filename=文件名>> - 读取侧边目录树中指定文档的大纲内容（filename为文件名，支持模糊匹配）',
        '',
        '=== 编辑类工具（需要用户确认后执行）===',
        '5. <<TOOL:edit_node|node=节点文本|new_text=新内容>> - 修改指定节点的文本内容',
        '6. <<TOOL:insert_child|parent=父节点文本|text=子节点内容>> - 在指定节点下插入子节点',
        '7. <<TOOL:insert_sibling|target=目标节点文本|text=兄弟节点内容>> - 在指定节点旁插入兄弟节点',
        '8. <<TOOL:delete_node|node=节点文本>> - 删除指定节点',
        '',
        '=== 样式类工具（需要用户确认后执行）===',
        '9. <<TOOL:set_node_color|node=节点文本|color=颜色值>> - 设置节点背景颜色（color为十六进制如#FF5733或颜色名如red）',
        '10. <<TOOL:set_text_color|node=节点文本|color=颜色值>> - 设置节点文字颜色',
        '11. <<TOOL:set_node_bold|node=节点文本|bold=bold>> - 设置节点文字加粗（bold固定填bold，取消加粗填normal）',
        '12. <<TOOL:set_node_italic|node=节点文本|italic=italic>> - 设置节点文字斜体（italic填italic，取消填normal）',
        '13. <<TOOL:set_font_size|node=节点文本|size=数字>> - 设置节点文字大小（size为数字如14、16、20）',
        '14. <<TOOL:set_border|node=节点文本|color=颜色值|width=数字>> - 设置节点边框（color为颜色值，width为像素数字如2）',
        '15. <<TOOL:set_border_radius|node=节点文本|radius=数字>> - 设置节点圆角大小（radius为数字如5、10）',
        '16. <<TOOL:set_node_shape|node=节点文本|shape=形状>> - 设置节点形状（shape可选：rectangle矩形、roundedRectangle圆角矩形、ellipse椭圆、diamond菱形、triangle三角形）',
        '17. <<TOOL:set_line_color|node=节点文本|color=颜色值>> - 设置节点连线颜色',
        '18. <<TOOL:set_line_width|node=节点文本|width=数字>> - 设置节点连线粗细（width为数字如1、2、3）',
        '19. <<TOOL:set_node_style|node=节点文本|prop=属性名|value=属性值>> - 通用样式设置（prop为样式属性名如fillColor/color/fontSize/fontWeight/borderColor/borderWidth/borderRadius/shape/lineColor/lineWidth等，value为对应值）',
        '',
        '=== 关联线工具 ===',
        '20. <<TOOL:add_association|from=起始节点文本|to=目标节点文本|text=关联说明>> - 在两个节点之间添加关联线（text可选，为关联线上的文字说明）',
        '21. <<TOOL:remove_association|from=起始节点文本|to=目标节点文本>> - 移除两个节点之间的关联线',
        '',
        '=== 复习计划工具 ===',
        '22. <<TOOL:add_to_review|node=节点文本>> - 将指定节点添加到复习计划（按艾宾浩斯遗忘曲线安排复习时间）',
        '23. <<TOOL:enter_review_mode>> - 进入复习模式',
        '24. <<TOOL:exit_review_mode>> - 退出复习模式',
        '',
        '=== 飞书通知工具 ===',
        '25. <<TOOL:send_feishu_msg|content=消息内容>> - 通过Webhook向飞书发送消息通知（需预先配置Webhook地址）',
        '',
        '=== 导出类工具 ===',
        '26. <<TOOL:export_md|content=文档内容|filename=文件名>> - 导出为Markdown文档',
        '27. <<TOOL:export_ssm|content=markdown格式内容|filename=文件名>> - 导出为思维导图文件（内容需为markdown格式，# 为根节点，- 为子节点）',
        '28. <<TOOL:export_csv|content=CSV格式内容|filename=文件名>> - 导出为CSV表格文件',
        '',
        '=== 文件操作工具（需要用户确认后执行）===',
        '29. <<TOOL:new_file|name=文件名|parent_dir=父目录>> - 新建文件（name为文件名，parent_dir可选指定父目录）',
        '30. <<TOOL:rename_file|old_name=原文件名|new_name=新文件名>> - 重命名文件',
        '31. <<TOOL:delete_file|filename=文件名>> - 删除文件',
        '32. <<TOOL:move_file|filename=文件名|target_dir=目标目录>> - 移动文件到指定目录',
        '33. <<TOOL:new_folder|name=文件夹名|parent_dir=父目录>> - 新建文件夹',
        '34. <<TOOL:export_format|format=格式|filename=文件名>> - 导出指定格式（format可选：png/jpg/pdf/svg/json/smm/md/txt/xmind）',
        '35. <<TOOL:import_file|filename=文件名>> - 导入指定文件',
        '',
        '=== 节点高级操作工具（需要用户确认后执行）===',
        '36. <<TOOL:insert_image|node=节点文本|url=图片地址|width=宽度|height=高度>> - 在指定节点插入图片（width/height可选，如300、200）',
        '37. <<TOOL:add_hyperlink|node=节点文本|url=链接地址|title=链接标题>> - 为指定节点添加超链接（title可选）',
        '38. <<TOOL:add_note|node=节点文本|note=备注内容>> - 为指定节点添加备注',
        '39. <<TOOL:add_summary|node=节点文本|text=概要内容>> - 为指定节点添加概要',
        '40. <<TOOL:add_formula|node=节点文本|formula=公式内容>> - 为指定节点添加公式（LaTeX格式）',
        '41. <<TOOL:add_outer_frame|nodes=节点文本|text=外框文字>> - 为指定节点添加外框（nodes可为多个节点用逗号分隔，text可选）',
        '42. <<TOOL:set_outer_frame_color|nodes=节点文本|color=颜色值>> - 设置外框颜色',
        '43. <<TOOL:set_outer_frame_style|nodes=节点文本|color=颜色值|width=线条粗细|style=线条样式>> - 设置外框样式（style可选：solid实线/dashed虚线/dotted点线）',
        '',
        '=== AI挖空工具（需要用户确认后执行）===',
        '44. <<TOOL:ai_cloze|node=节点文本>> - 对指定节点及其子节点进行AI智能挖空（保守策略，保留上下文线索）',
        '45. <<TOOL:ai_cloze_aggressive|node=节点文本>> - 对指定节点及其子节点进行AI激进挖空（高强度记忆测试）',
        '',
        '=== 设置与主题工具 ===',
        '46. <<TOOL:toggle_rich_text>> - 切换富文本编辑开关',
        '47. <<TOOL:toggle_readonly>> - 切换只读/编辑模式',
        '48. <<TOOL:set_theme|theme=主题名>> - 切换主题（theme支持：dark深色/classic经典/gold金色/sea海洋/rose玫瑰/tech科技/green绿色/mini简约/sky天空/earth地球，支持中英文模糊匹配）',
        '49. <<TOOL:toggle_dark_mode>> - 切换暗黑/明亮模式',
        '',
        '=== 视图操作工具 ===',
        '50. <<TOOL:toggle_outline>> - 切换大纲模式',
        '51. <<TOOL:back_to_root>> - 回到根节点居中显示',
        '52. <<TOOL:search_nodes|keyword=关键词>> - 搜索节点并高亮显示',
        '53. <<TOOL:zoom_in>> - 放大视图',
        '54. <<TOOL:zoom_out>> - 缩小视图',
        '55. <<TOOL:zoom_reset>> - 重置缩放到100%',
        '56. <<TOOL:toggle_fullscreen>> - 切换全屏模式',
        '57. <<TOOL:expand_all>> - 展开所有节点',
        '58. <<TOOL:collapse_all>> - 收起所有节点',
        '59. <<TOOL:expand_to_level|level=层级数字>> - 展开到指定层级（level为1-10的数字）',
        '',
        '=== 节点标记工具（需要用户确认后执行）===',
        '60. <<TOOL:add_node_tag|node=节点文本|tag=标签内容>> - 为指定节点添加标签',
        '61. <<TOOL:add_node_icon|node=节点文本|icon=图标名>> - 为指定节点添加图标（icon可选：priority优先级/favorite收藏/flag旗帜/star星星等）',
        '',
        '记忆指令：',
        '请在每次回复的末尾，用以下格式总结本次对话的关键信息（用户不会看到此部分）：',
        '<<MEMORY>>用一句话概括的关键事实或用户偏好<</MEMORY>>',
        '',
        '使用规则：',
        '- 每个工具调用必须独占一行，格式严格为 <<TOOL:工具名|参数1=值1|参数2=值2>>',
        '- 可以在一条回复中同时调用多个工具（每行一个），系统会批量执行以提高效率',
        '- 工具调用后，系统会执行操作并将结果返回给你，你必须基于结果继续回复用户的问题',
        '- 如果引用的节点之间没有明确层级关系，建议主动调用 query_hierarchy 获取更完整上下文',
        '- 编辑和样式操作会弹出确认对话框，用户可以批准或拒绝',
        '- node 参数填写节点文本（支持模糊匹配），系统会自动查找对应节点',
        '- 颜色值支持十六进制（如#FF5733）或英文颜色名（如red、blue、green）',
        '- 导出工具的 content 参数可以包含多行内容（换行用 \\n 表示）',
        '- 当用户要求对某节点及其子节点进行操作时，先调用query_children获取所有子节点，再批量操作',
        ''
      ].join('\n')
    },

    // 从AI回复中提取工具调用（增强容错：支持多行参数、转义字符、容错解析）
    extractToolCalls(text) {
      if (!text) return []
      const calls = []
      // 匹配 <<TOOL:tool_name|param1=value1|param2=value2>>
      // 支持 content 参数中包含 | 字符（通过非贪婪匹配到最后一个 >> ）
      const regex = /<<TOOL:(\w+)\|([\s\S]*?)>>/g
      let match
      while ((match = regex.exec(text)) !== null) {
        const toolName = match[1].trim().toLowerCase()
        const paramsStr = match[2]
        const params = this.parseToolParams(paramsStr)
        calls.push({
          tool: toolName,
          params: params,
          raw: match[0],
          description: this.getToolDescription(toolName, params)
        })
      }
      return calls
    },

    // 解析工具参数（增强容错：处理转义的 \\n、处理参数值中包含 | 的情况）
    parseToolParams(paramsStr) {
      const params = {}
      if (!paramsStr) return params
      // 先还原转义的换行符 \\n -> \n
      let processed = paramsStr.replace(/\\n/g, '\n')
      // 按管道符分割，但需要处理值中可能包含的转义管道符
      const parts = []
      let current = ''
      let i = 0
      while (i < processed.length) {
        const ch = processed[i]
        if (ch === '\\' && processed[i + 1] === '|') {
          // 转义的管道符
          current += '|'
          i += 2
        } else if (ch === '|') {
          parts.push(current)
          current = ''
          i++
        } else {
          current += ch
          i++
        }
      }
      if (current) parts.push(current)
      // 解析每个 key=value 对
      parts.forEach(pair => {
        const idx = pair.indexOf('=')
        if (idx > 0) {
          const key = pair.substring(0, idx).trim()
          const value = pair.substring(idx + 1).trim()
          if (key) {
            params[key] = value
          }
        }
      })
      return params
    },

    // 获取工具调用的描述（用于权限对话框显示）
    getToolDescription(toolName, params) {
      const p = params || {}
      const descriptions = {
        query_hierarchy: `查询节点「${p.node || ''}」的完整上下级层级关系`,
        query_parent: `查询节点「${p.node || ''}」的父节点`,
        query_children: `查询节点「${p.node || ''}」的子节点`,
        search_document: `在文档中搜索「${p.keyword || ''}」`,
        search_files: `在目录树中搜索文件「${p.keyword || ''}」`,
        read_file: `读取文档「${p.filename || ''}」的大纲内容`,
        edit_node: `修改节点「${p.node || ''}」的内容为「${p.new_text || ''}」`,
        insert_child: `在节点「${p.parent || ''}」下插入子节点「${p.text || ''}」`,
        insert_sibling: `在节点「${p.target || ''}」旁插入兄弟节点「${p.text || ''}」`,
        delete_node: `删除节点「${p.node || ''}」`,
        set_node_color: `设置节点「${p.node || ''}」的背景颜色为「${p.color || ''}」`,
        set_text_color: `设置节点「${p.node || ''}」的文字颜色为「${p.color || ''}」`,
        set_node_bold: `设置节点「${p.node || ''}」文字${p.bold === 'normal' ? '取消加粗' : '加粗'}`,
        set_node_italic: `设置节点「${p.node || ''}」文字${p.italic === 'normal' ? '取消斜体' : '斜体'}`,
        set_font_size: `设置节点「${p.node || ''}」文字大小为「${p.size || ''}」`,
        set_border: `设置节点「${p.node || ''}」边框：颜色「${p.color || ''}」粗细「${p.width || ''}」`,
        set_border_radius: `设置节点「${p.node || ''}」圆角为「${p.radius || ''}」`,
        set_node_shape: `设置节点「${p.node || ''}」形状为「${p.shape || ''}」`,
        set_line_color: `设置节点「${p.node || ''}」的连线颜色为「${p.color || ''}」`,
        set_line_width: `设置节点「${p.node || ''}」的连线粗细为「${p.width || ''}」`,
        set_node_style: `设置节点「${p.node || ''}」的样式属性「${p.prop || ''}」为「${p.value || ''}」`,
        add_association: `在「${p.from || ''}」和「${p.to || ''}」之间添加关联线`,
        remove_association: `移除「${p.from || ''}」和「${p.to || ''}」之间的关联线`,
        add_to_review: `将节点「${p.node || ''}」添加到复习计划`,
        enter_review_mode: `进入复习模式`,
        exit_review_mode: `退出复习模式`,
        send_feishu_msg: `通过飞书Webhook发送消息`,
        export_md: `导出Markdown文档「${p.filename || 'export.md'}」`,
        export_ssm: `导出思维导图文件「${p.filename || 'export.ssm'}」`,
        export_csv: `导出CSV表格「${p.filename || 'export.csv'}」`,
        // 文件操作
        new_file: `新建文件「${p.name || ''}」`,
        rename_file: `将文件「${p.old_name || ''}」重命名为「${p.new_name || ''}」`,
        delete_file: `删除文件「${p.filename || ''}」`,
        move_file: `将文件「${p.filename || ''}」移动到「${p.target_dir || ''}」`,
        new_folder: `新建文件夹「${p.name || ''}」`,
        export_format: `导出为「${(p.format || 'smm').toUpperCase()}」格式`,
        import_file: `导入文件「${p.filename || ''}」`,
        // 节点高级操作
        insert_image: `为节点「${p.node || ''}」插入图片「${p.url || ''}」`,
        add_hyperlink: `为节点「${p.node || ''}」添加超链接「${p.url || ''}」`,
        add_note: `为节点「${p.node || ''}」添加备注`,
        add_summary: `为节点「${p.node || ''}」添加概要`,
        add_formula: `为节点「${p.node || ''}」添加公式`,
        add_outer_frame: `为节点「${p.nodes || ''}」添加外框`,
        set_outer_frame_color: `设置节点「${p.nodes || ''}」外框颜色为「${p.color || ''}」`,
        set_outer_frame_style: `设置节点「${p.nodes || ''}」外框样式`,
        // AI挖空
        ai_cloze: `对节点「${p.node || ''}」及其子节点进行AI智能挖空`,
        ai_cloze_aggressive: `对节点「${p.node || ''}」及其子节点进行AI激进挖空`,
        // 设置与主题
        toggle_rich_text: `切换富文本编辑开关`,
        toggle_readonly: `切换只读/编辑模式`,
        set_theme: `切换主题为「${p.theme || ''}」`,
        toggle_dark_mode: `切换暗黑/明亮模式`,
        // 视图操作
        toggle_outline: `切换大纲模式`,
        back_to_root: `回到根节点`,
        search_nodes: `搜索节点「${p.keyword || ''}」`,
        zoom_in: `放大视图`,
        zoom_out: `缩小视图`,
        zoom_reset: `重置缩放`,
        toggle_fullscreen: `切换全屏模式`,
        expand_all: `展开所有节点`,
        collapse_all: `收起所有节点`,
        expand_to_level: `展开到第${p.level || '2'}级`,
        // 节点标记
        add_node_tag: `为节点「${p.node || ''}」添加标签「${p.tag || ''}」`,
        add_node_icon: `为节点「${p.node || ''}」添加图标「${p.icon || ''}」`
      }
      return descriptions[toolName] || `执行工具：${toolName}`
    },

    // 判断工具调用是否包含编辑/样式操作（需要用户确认）
    hasEditToolCalls(toolCalls) {
      const editTools = [
        // 原有编辑工具
        'edit_node', 'insert_child', 'insert_sibling', 'delete_node',
        'set_node_color', 'set_text_color', 'set_node_bold', 'set_node_italic',
        'set_font_size', 'set_border', 'set_border_radius', 'set_node_shape',
        'set_line_color', 'set_line_width', 'set_node_style',
        'add_association', 'remove_association', 'add_to_review',
        // 文件操作（需确认）
        'new_file', 'rename_file', 'delete_file', 'move_file', 'new_folder',
        'import_file',
        // 节点高级操作（需确认）
        'insert_image', 'add_hyperlink', 'add_note', 'add_summary', 'add_formula',
        'add_outer_frame', 'set_outer_frame_color', 'set_outer_frame_style',
        // AI挖空（需确认）
        'ai_cloze', 'ai_cloze_aggressive',
        // 节点标记（需确认）
        'add_node_tag', 'add_node_icon'
      ]
      return toolCalls.some(tc => editTools.includes(tc.tool))
    },

    // 从文本中移除工具调用标记（支持多行参数）
    stripToolCalls(text) {
      if (!text) return ''
      return text.replace(/<<TOOL:\w+\|[\s\S]*?>>\n?/g, '').trim()
    },

    // 在思维导图中查找节点（支持模糊匹配文本）
    findNodeByText(text) {
      if (!text || !this.mindMap || !this.mindMap.renderer || !this.mindMap.renderer.root) {
        return null
      }
      const target = text.trim().toLowerCase()
      let found = null
      const walk = (node) => {
        if (found) return
        if (!node) return
        const rawText = node.getData('text') || ''
        const plainText = String(rawText).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
        // 精确匹配优先
        if (plainText === text.trim()) {
          found = node
          return
        }
        // 模糊匹配
        if (!found && plainText.toLowerCase().includes(target)) {
          found = node
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => walk(child))
        }
      }
      walk(this.mindMap.renderer.root)
      return found
    },

    // 获取节点的纯文本
    getNodePlainText(node) {
      if (!node) return ''
      const rawText = node.getData('text') || ''
      return String(rawText).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
    },

    // 工具：查询节点的完整上下级层级关系
    executeQueryHierarchy(nodeText) {
      const node = this.findNodeByText(nodeText)
      if (!node) return `未找到包含「${nodeText}」的节点`
      const lines = []
      // 上游：从根节点到当前节点的路径
      const ancestors = []
      let parent = node.parent
      while (parent) {
        ancestors.unshift(parent)
        parent = parent.parent
      }
      if (ancestors.length > 0) {
        lines.push('【上游路径（从根节点到目标节点）】')
        ancestors.forEach((n, i) => {
          lines.push('  '.repeat(i) + (i === 0 ? '' : '- ') + this.getNodePlainText(n))
        })
        lines.push('  '.repeat(ancestors.length) + '- ' + this.getNodePlainText(node) + ' ← 当前节点')
      } else {
        lines.push('【当前节点为根节点】')
        lines.push(this.getNodePlainText(node))
      }
      // 下游：所有子节点（递归）
      const descendants = []
      const walkDescendants = (n, depth) => {
        if (!n.children || n.children.length === 0) return
        n.children.forEach(child => {
          descendants.push('  '.repeat(depth) + '- ' + this.getNodePlainText(child))
          walkDescendants(child, depth + 1)
        })
      }
      walkDescendants(node, 1)
      if (descendants.length > 0) {
        lines.push('【下游子节点（全部层级）】')
        lines.push(...descendants)
      } else {
        lines.push('【下游子节点】无子节点')
      }
      return lines.join('\n')
    },

    // 工具：查询父节点
    executeQueryParent(nodeText) {
      const node = this.findNodeByText(nodeText)
      if (!node) return `未找到包含「${nodeText}」的节点`
      if (!node.parent) return `节点「${this.getNodePlainText(node)}」没有父节点（为根节点）`
      return `节点「${this.getNodePlainText(node)}」的父节点为：「${this.getNodePlainText(node.parent)}」`
    },

    // 工具：查询子节点
    executeQueryChildren(nodeText) {
      const node = this.findNodeByText(nodeText)
      if (!node) return `未找到包含「${nodeText}」的节点`
      if (!node.children || node.children.length === 0) {
        return `节点「${this.getNodePlainText(node)}」没有子节点`
      }
      const children = node.children.map(c => '- ' + this.getNodePlainText(c))
      return `节点「${this.getNodePlainText(node)}」的子节点：\n${children.join('\n')}`
    },

    // 工具：搜索文档
    executeSearchDocument(keyword) {
      if (!keyword || !this.mindMap || !this.mindMap.renderer || !this.mindMap.renderer.root) {
        return '未提供搜索关键词或文档为空'
      }
      const target = keyword.trim().toLowerCase()
      const results = []
      const walk = (node, depth) => {
        if (!node) return
        const text = this.getNodePlainText(node)
        if (text.toLowerCase().includes(target)) {
          results.push('  '.repeat(depth) + '- ' + text)
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => walk(child, depth + 1))
        }
      }
      walk(this.mindMap.renderer.root, 0)
      if (results.length === 0) {
        return `在文档中未找到包含「${keyword}」的节点`
      }
      return `搜索「${keyword}」找到 ${results.length} 个匹配节点：\n${results.join('\n')}`
    },

    // 工具：在侧边目录树中搜索文件
    async executeSearchFiles(keyword) {
      if (!keyword) return '未提供搜索关键词'
      try {
        const fs = getFs()
        if (!fs || !fs.listDir) return '当前环境不支持文件系统访问'
        // 从 localStorage 读取文件夹根目录
        const rootsStr = localStorage.getItem('ZMIND_FOLDER_ROOTS')
        if (!rootsStr) return '未配置文件夹根目录，无法搜索文件'
        const roots = JSON.parse(rootsStr)
        if (!Array.isArray(roots) || roots.length === 0) return '未配置文件夹根目录'
        const target = keyword.trim().toLowerCase()
        const results = []
        const scanDir = async (dirPath, depth) => {
          if (depth > 2) return // 限制扫描深度
          let items = []
          try {
            items = await fs.listDir(dirPath)
          } catch (e) {
            return
          }
          if (!Array.isArray(items)) return
          for (const item of items) {
            if (item.isDir) {
              await scanDir(item.path, depth + 1)
            } else if (SUPPORT_FILE_EXT.test(item.name) && item.name.toLowerCase().includes(target)) {
              results.push(`- ${item.name} (${item.path})`)
            }
          }
        }
        for (const root of roots) {
          await scanDir(root, 0)
        }
        if (results.length === 0) {
          return `在目录树中未找到文件名包含「${keyword}」的文档`
        }
        return `搜索到 ${results.length} 个匹配文档：\n${results.join('\n')}`
      } catch (e) {
        return `搜索文件出错：${e.message || e}`
      }
    },

    // 工具：读取侧边目录树中指定文档的大纲
    async executeReadFile(filename) {
      if (!filename) return '未提供文件名'
      try {
        const fs = getFs()
        if (!fs || !fs.listDir || !fs.readFile) return '当前环境不支持文件系统访问'
        const rootsStr = localStorage.getItem('ZMIND_FOLDER_ROOTS')
        if (!rootsStr) return '未配置文件夹根目录，无法读取文件'
        const roots = JSON.parse(rootsStr)
        const target = filename.trim().toLowerCase()
        let foundPath = null
        const scanDir = async (dirPath, depth) => {
          if (foundPath || depth > 2) return
          let items = []
          try {
            items = await fs.listDir(dirPath)
          } catch (e) {
            return
          }
          if (!Array.isArray(items)) return
          for (const item of items) {
            if (foundPath) return
            if (item.isDir) {
              await scanDir(item.path, depth + 1)
            } else if (SUPPORT_FILE_EXT.test(item.name) && item.name.toLowerCase().includes(target)) {
              foundPath = item.path
              return
            }
          }
        }
        for (const root of roots) {
          if (foundPath) break
          await scanDir(root, 0)
        }
        if (!foundPath) return `未找到文件名包含「${filename}」的文档`
        // 读取文件内容
        const content = await fs.readFile(foundPath)
        let rootData = null
        if (/\.md$/i.test(foundPath)) {
          // markdown 文件
          const mdModule = await import('simple-mind-map/src/parse/markdown.js')
          const list = mdModule.default.transformMarkdownToList(content)
          rootData = list.length === 1 ? list[0] : { data: { text: foundPath }, children: list }
        } else {
          // smm/json 文件
          const data = JSON.parse(content)
          rootData = data.root || data
        }
        if (!rootData) return `文件「${filename}」内容为空或解析失败`
        // 提取大纲文本
        const lines = []
        const walk = (node, depth) => {
          if (!node || !node.data) return
          const rawText = node.data.text || ''
          const plainText = String(rawText).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
          if (plainText) {
            if (depth === 0) {
              lines.push('# ' + plainText)
            } else {
              lines.push('  '.repeat(depth - 1) + '- ' + plainText)
            }
          }
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => walk(child, depth + 1))
          }
        }
        walk(rootData, 0)
        return `文档「${filename}」的大纲内容：\n${lines.join('\n')}`
      } catch (e) {
        return `读取文件出错：${e.message || e}`
      }
    },

    // 工具：修改节点内容
    executeEditNode(nodeText, newText) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const oldText = this.getNodePlainText(node)
      node.setText(newText)
      return { success: true, message: `已将节点「${oldText}」修改为「${newText}」` }
    },

    // 工具：插入子节点
    executeInsertChild(parentText, childText) {
      const parentNode = this.findNodeByText(parentText)
      if (!parentNode) return { success: false, message: `未找到包含「${parentText}」的节点` }
      this.mindMap.execCommand('INSERT_CHILD_NODE', false, parentNode, {
        text: childText,
        uid: createUid()
      })
      return { success: true, message: `已在节点「${this.getNodePlainText(parentNode)}」下插入子节点「${childText}」` }
    },

    // 工具：插入兄弟节点
    executeInsertSibling(targetText, siblingText) {
      const targetNode = this.findNodeByText(targetText)
      if (!targetNode) return { success: false, message: `未找到包含「${targetText}」的节点` }
      if (targetNode.isRoot) return { success: false, message: '根节点无法插入兄弟节点' }
      this.mindMap.execCommand('INSERT_NODE', false, targetNode, {
        text: siblingText,
        uid: createUid()
      })
      return { success: true, message: `已在节点「${this.getNodePlainText(targetNode)}」旁插入兄弟节点「${siblingText}」` }
    },

    // 工具：删除节点
    executeDeleteNode(nodeText) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      if (node.isRoot) return { success: false, message: '根节点无法删除' }
      const text = this.getNodePlainText(node)
      this.mindMap.execCommand('REMOVE_NODE', false, [node])
      return { success: true, message: `已删除节点「${text}」` }
    },

    // ============ 二开：样式类工具执行方法 ============

    // 颜色值标准化（支持颜色名转十六进制、校验格式）
    normalizeColor(color) {
      if (!color) return null
      const c = color.trim().toLowerCase()
      // 十六进制 #FFF 或 #FFFFFF
      if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(c)) return c
      // 常见颜色名映射
      const colorMap = {
        red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
        orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', black: '#000000',
        white: '#ffffff', gray: '#808080', grey: '#808080', brown: '#a52a2a',
        cyan: '#00ffff', magenta: '#ff00ff', lime: '#00ff00', teal: '#008080',
        navy: '#000080', maroon: '#800000', olive: '#808000', silver: '#c0c0c0',
        gold: '#ffd700', skyblue: '#87ceeb', coral: '#ff7f50', salmon: '#fa8072',
        tomato: '#ff6347', khaki: '#f0e68c', lavender: '#e6e6fa', tan: '#d2b48c',
        transparent: 'transparent', none: 'transparent'
      }
      if (colorMap[c]) return colorMap[c]
      // rgb/rgba 格式
      if (/^rgba?\(/.test(c)) return c
      // 无法识别，返回原值让 API 处理
      console.warn('[AI工具] 无法识别的颜色值:', color)
      return c
    },

    // 工具：设置节点背景颜色
    executeSetNodeColor(nodeText, color) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const normalized = this.normalizeColor(color)
      if (!normalized) return { success: false, message: `无效的颜色值：${color}` }
      node.setStyle('fillColor', normalized)
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的背景色设为「${normalized}」` }
    },

    // 工具：设置节点文字颜色
    executeSetTextColor(nodeText, color) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const normalized = this.normalizeColor(color)
      if (!normalized) return { success: false, message: `无效的颜色值：${color}` }
      node.setStyle('color', normalized)
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的文字颜色设为「${normalized}」` }
    },

    // 工具：设置节点文字加粗
    executeSetNodeBold(nodeText, bold) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const value = bold === 'normal' ? 'normal' : 'bold'
      node.setStyle('fontWeight', value)
      return { success: true, message: `已${value === 'bold' ? '加粗' : '取消加粗'}节点「${this.getNodePlainText(node)}」的文字` }
    },

    // 工具：设置节点文字斜体
    executeSetNodeItalic(nodeText, italic) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const value = italic === 'normal' ? 'normal' : 'italic'
      node.setStyle('fontStyle', value)
      return { success: true, message: `已${value === 'italic' ? '设置斜体' : '取消斜体'}节点「${this.getNodePlainText(node)}」的文字` }
    },

    // 工具：设置节点文字大小
    executeSetFontSize(nodeText, size) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const num = parseInt(size, 10)
      if (isNaN(num) || num < 8 || num > 100) return { success: false, message: `无效的字号：${size}（需为8-100的数字）` }
      node.setStyle('fontSize', num)
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的文字大小设为「${num}」` }
    },

    // 工具：设置节点边框
    executeSetBorder(nodeText, color, width) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const normalized = this.normalizeColor(color)
      if (!normalized) return { success: false, message: `无效的边框颜色：${color}` }
      const w = parseInt(width, 10)
      const borderWidth = isNaN(w) ? 1 : Math.max(0, Math.min(20, w))
      node.setStyles({
        borderColor: normalized,
        borderWidth: borderWidth
      })
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的边框设为：颜色「${normalized}」粗细「${borderWidth}px」` }
    },

    // 工具：设置节点圆角
    executeSetBorderRadius(nodeText, radius) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const r = parseInt(radius, 10)
      if (isNaN(r) || r < 0 || r > 100) return { success: false, message: `无效的圆角值：${radius}（需为0-100的数字）` }
      node.setStyle('borderRadius', r)
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的圆角设为「${r}」` }
    },

    // 工具：设置节点形状
    executeSetNodeShape(nodeText, shape) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const validShapes = ['rectangle', 'roundedRectangle', 'ellipse', 'diamond', 'triangle', 'star', 'parallelogram']
      const normalized = String(shape).trim().toLowerCase()
      // 中英文形状名映射
      const shapeMap = {
        '矩形': 'rectangle', 'rectangle': 'rectangle', 'rect': 'rectangle',
        '圆角矩形': 'roundedRectangle', 'roundedrectangle': 'roundedRectangle', 'rounded': 'roundedRectangle',
        '椭圆': 'ellipse', 'ellipse': 'ellipse', 'oval': 'ellipse', '圆': 'ellipse',
        '菱形': 'diamond', 'diamond': 'diamond',
        '三角形': 'triangle', 'triangle': 'triangle',
        '星形': 'star', 'star': 'star',
        '平行四边形': 'parallelogram', 'parallelogram': 'parallelogram'
      }
      const finalShape = shapeMap[normalized] || (validShapes.includes(normalized) ? normalized : null)
      if (!finalShape) return { success: false, message: `无效的形状：${shape}（可选：rectangle/roundedRectangle/ellipse/diamond/triangle/star）` }
      node.setStyle('shape', finalShape)
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的形状设为「${finalShape}」` }
    },

    // 工具：设置节点连线颜色
    executeSetLineColor(nodeText, color) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const normalized = this.normalizeColor(color)
      if (!normalized) return { success: false, message: `无效的颜色值：${color}` }
      node.setStyle('lineColor', normalized)
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的连线颜色设为「${normalized}」` }
    },

    // 工具：设置节点连线粗细
    executeSetLineWidth(nodeText, width) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      const w = parseInt(width, 10)
      if (isNaN(w) || w < 0 || w > 20) return { success: false, message: `无效的连线粗细：${width}（需为0-20的数字）` }
      node.setStyle('lineWidth', w)
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的连线粗细设为「${w}」` }
    },

    // 工具：通用样式设置
    executeSetNodeStyle(nodeText, prop, value) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      if (!prop) return { success: false, message: '未指定样式属性名（prop参数）' }
      // 合法样式属性白名单
      const validProps = [
        'fillColor', 'color', 'fontSize', 'fontWeight', 'fontStyle', 'fontFamily',
        'borderColor', 'borderWidth', 'borderRadius', 'borderDasharray',
        'shape', 'lineColor', 'lineWidth', 'lineDasharray',
        'textDecoration', 'paddingX', 'paddingY', 'textAlign'
      ]
      const normalizedProp = prop.trim()
      if (!validProps.includes(normalizedProp)) {
        return { success: false, message: `不支持的样式属性：「${prop}」。可用属性：${validProps.join(', ')}` }
      }
      // 数字类型属性转换
      const numericProps = ['fontSize', 'borderWidth', 'borderRadius', 'lineWidth', 'paddingX', 'paddingY']
      let finalValue = value
      if (numericProps.includes(normalizedProp)) {
        const num = parseInt(value, 10)
        if (isNaN(num)) return { success: false, message: `属性「${prop}」需要数字值，收到：「${value}」` }
        finalValue = num
      }
      // 颜色类型属性标准化
      const colorProps = ['fillColor', 'color', 'borderColor', 'lineColor']
      if (colorProps.includes(normalizedProp)) {
        finalValue = this.normalizeColor(value)
      }
      node.setStyle(normalizedProp, finalValue)
      return { success: true, message: `已将节点「${this.getNodePlainText(node)}」的「${normalizedProp}」设为「${finalValue}」` }
    },

    // 二开：关联线工具 - 添加关联线
    executeAddAssociation(fromText, toText, assocText) {
      if (!fromText || !toText) return { success: false, message: '需要指定起始节点和目标节点' }
      const fromNode = this.findNodeByText(fromText)
      const toNode = this.findNodeByText(toText)
      if (!fromNode) return { success: false, message: `未找到包含「${fromText}」的节点` }
      if (!toNode) return { success: false, message: `未找到包含「${toText}」的节点` }
      if (fromNode.uid === toNode.uid) return { success: false, message: '不能在同一个节点之间添加关联线' }
      try {
        // 使用 simple-mind-map 的关联线 API
        this.mindMap.associationLine.addAssociationLine(fromNode, toNode, assocText || '')
        this.mindMap.render()
        return { success: true, message: `已在「${this.getNodePlainText(fromNode)}」和「${this.getNodePlainText(toNode)}」之间添加关联线${assocText ? '（' + assocText + '）' : ''}` }
      } catch (e) {
        return { success: false, message: `添加关联线失败：${e.message || e}` }
      }
    },

    // 二开：关联线工具 - 移除关联线
    executeRemoveAssociation(fromText, toText) {
      if (!fromText || !toText) return { success: false, message: '需要指定起始节点和目标节点' }
      const fromNode = this.findNodeByText(fromText)
      const toNode = this.findNodeByText(toText)
      if (!fromNode) return { success: false, message: `未找到包含「${fromText}」的节点` }
      if (!toNode) return { success: false, message: `未找到包含「${toText}」的节点` }
      try {
        // 查找并移除关联线
        const associationLines = this.mindMap.associationLine.associationLineList || []
        const target = associationLines.find(line => {
          const fromMatch = line.fromNode && line.fromNode.uid === fromNode.uid
          const toMatch = line.toNode && line.toNode.uid === toNode.uid
          const reverseFrom = line.fromNode && line.fromNode.uid === toNode.uid
          const reverseTo = line.toNode && line.toNode.uid === fromNode.uid
          return (fromMatch && toMatch) || (reverseFrom && reverseTo)
        })
        if (target) {
          this.mindMap.associationLine.removeAssociationLine(target)
          this.mindMap.render()
          return { success: true, message: `已移除「${this.getNodePlainText(fromNode)}」和「${this.getNodePlainText(toNode)}」之间的关联线` }
        }
        return { success: false, message: `未找到「${this.getNodePlainText(fromNode)}」和「${this.getNodePlainText(toNode)}」之间的关联线` }
      } catch (e) {
        return { success: false, message: `移除关联线失败：${e.message || e}` }
      }
    },

    // 二开：添加节点到复习计划
    executeAddToReview(nodeText) {
      if (!nodeText) return { success: false, message: '未指定节点' }
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到包含「${nodeText}」的节点` }
      try {
        // 通过事件总线触发添加到复习计划
        this.$bus.$emit('add_to_review_plan', node)
        return { success: true, message: `已将节点「${this.getNodePlainText(node)}」添加到复习计划` }
      } catch (e) {
        return { success: false, message: `添加到复习计划失败：${e.message || e}` }
      }
    },

    // 二开：进入复习模式
    executeEnterReviewMode() {
      try {
        this.$bus.$emit('enter_review_mode')
        return { success: true, message: '已进入复习模式' }
      } catch (e) {
        return { success: false, message: `进入复习模式失败：${e.message || e}` }
      }
    },

    // 二开：退出复习模式
    executeExitReviewMode() {
      try {
        this.$bus.$emit('exit_review_mode')
        return { success: true, message: '已退出复习模式' }
      } catch (e) {
        return { success: false, message: `退出复习模式失败：${e.message || e}` }
      }
    },

    // 二开：通过Webhook向飞书发送消息
    async executeSendFeishuMsg(content) {
      if (!content) return { success: false, message: '消息内容不能为空' }
      try {
        // 从localStorage读取飞书Webhook配置
        const reviewSettings = localStorage.getItem('ZMIND_REVIEW_SETTINGS')
        let webhookUrl = ''
        if (reviewSettings) {
          const settings = JSON.parse(reviewSettings)
          webhookUrl = settings.webhookUrl || ''
        }
        if (!webhookUrl) {
          return { success: false, message: '未配置飞书Webhook地址，请在复习计划设置中配置' }
        }
        // 发送消息到飞书
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msg_type: 'text',
            content: { text: content }
          })
        })
        const result = await response.json()
        if (result.code !== undefined && result.code !== 0) {
          return { success: false, message: `飞书返回错误：${result.msg || '未知错误'}` }
        }
        return { success: true, message: `已通过飞书Webhook发送消息：${content.substring(0, 50)}${content.length > 50 ? '...' : ''}` }
      } catch (e) {
        return { success: false, message: `发送飞书消息失败：${e.message || e}` }
      }
    },

    // 批量执行工具调用（异步，支持文件系统工具）
    async executeToolCalls(toolCalls) {
      const results = []
      for (const tc of toolCalls) {
        let result = ''
        try {
          switch (tc.tool) {
            case 'query_hierarchy':
              result = this.executeQueryHierarchy(tc.params.node || '')
              break
            case 'query_parent':
              result = this.executeQueryParent(tc.params.node || '')
              break
            case 'query_children':
              result = this.executeQueryChildren(tc.params.node || '')
              break
            case 'search_document':
              result = this.executeSearchDocument(tc.params.keyword || '')
              break
            case 'search_files':
              result = await this.executeSearchFiles(tc.params.keyword || '')
              break
            case 'read_file':
              result = await this.executeReadFile(tc.params.filename || '')
              break
            case 'edit_node':
              result = this.executeEditNode(tc.params.node || '', tc.params.new_text || '')
              break
            case 'insert_child':
              result = this.executeInsertChild(tc.params.parent || '', tc.params.text || '')
              break
            case 'insert_sibling':
              result = this.executeInsertSibling(tc.params.target || '', tc.params.text || '')
              break
            case 'delete_node':
              result = this.executeDeleteNode(tc.params.node || '')
              break
            case 'set_node_color':
              result = this.executeSetNodeColor(tc.params.node || '', tc.params.color || '')
              break
            case 'set_text_color':
              result = this.executeSetTextColor(tc.params.node || '', tc.params.color || '')
              break
            case 'set_node_bold':
              result = this.executeSetNodeBold(tc.params.node || '', tc.params.bold || '')
              break
            case 'set_node_italic':
              result = this.executeSetNodeItalic(tc.params.node || '', tc.params.italic || '')
              break
            case 'set_font_size':
              result = this.executeSetFontSize(tc.params.node || '', tc.params.size || '')
              break
            case 'set_border':
              result = this.executeSetBorder(tc.params.node || '', tc.params.color || '', tc.params.width || '')
              break
            case 'set_border_radius':
              result = this.executeSetBorderRadius(tc.params.node || '', tc.params.radius || '')
              break
            case 'set_node_shape':
              result = this.executeSetNodeShape(tc.params.node || '', tc.params.shape || '')
              break
            case 'set_line_color':
              result = this.executeSetLineColor(tc.params.node || '', tc.params.color || '')
              break
            case 'set_line_width':
              result = this.executeSetLineWidth(tc.params.node || '', tc.params.width || '')
              break
            case 'set_node_style':
              result = this.executeSetNodeStyle(tc.params.node || '', tc.params.prop || '', tc.params.value || '')
              break
            case 'add_association':
              result = this.executeAddAssociation(tc.params.from || '', tc.params.to || '', tc.params.text || '')
              break
            case 'remove_association':
              result = this.executeRemoveAssociation(tc.params.from || '', tc.params.to || '')
              break
            case 'add_to_review':
              result = this.executeAddToReview(tc.params.node || '')
              break
            case 'enter_review_mode':
              result = this.executeEnterReviewMode()
              break
            case 'exit_review_mode':
              result = this.executeExitReviewMode()
              break
            case 'send_feishu_msg':
              result = await this.executeSendFeishuMsg(tc.params.content || '')
              break
            case 'export_md':
              result = this.executeExportMd(tc.params.content || '', tc.params.filename || '')
              break
            case 'export_ssm':
              result = this.executeExportSsm(tc.params.content || '', tc.params.filename || '')
              break
            case 'export_csv':
              result = this.executeExportCsv(tc.params.content || '', tc.params.filename || '')
              break
            // 二开：文件操作工具
            case 'new_file':
              result = await this.executeNewFile(tc.params.name || '', tc.params.parent_dir || '')
              break
            case 'rename_file':
              result = await this.executeRenameFile(tc.params.old_name || '', tc.params.new_name || '')
              break
            case 'delete_file':
              result = await this.executeDeleteFile(tc.params.filename || '')
              break
            case 'move_file':
              result = await this.executeMoveFile(tc.params.filename || '', tc.params.target_dir || '')
              break
            case 'new_folder':
              result = await this.executeNewFolder(tc.params.name || '', tc.params.parent_dir || '')
              break
            case 'export_format':
              result = await this.executeExportFormat(tc.params.format || 'smm', tc.params.filename || '')
              break
            case 'import_file':
              result = await this.executeImportFile(tc.params.filename || '')
              break
            // 二开：节点高级操作工具
            case 'insert_image':
              result = this.executeInsertImage(tc.params.node || '', tc.params.url || '', tc.params.width || '', tc.params.height || '')
              break
            case 'add_hyperlink':
              result = this.executeAddHyperlink(tc.params.node || '', tc.params.url || '', tc.params.title || '')
              break
            case 'add_note':
              result = this.executeAddNote(tc.params.node || '', tc.params.note || '')
              break
            case 'add_summary':
              result = this.executeAddSummary(tc.params.node || '', tc.params.text || '')
              break
            case 'add_formula':
              result = this.executeAddFormula(tc.params.node || '', tc.params.formula || '')
              break
            case 'add_outer_frame':
              result = this.executeAddOuterFrame(tc.params.nodes || '', tc.params.text || '')
              break
            case 'set_outer_frame_color':
              result = this.executeSetOuterFrameColor(tc.params.nodes || '', tc.params.color || '')
              break
            case 'set_outer_frame_style':
              result = this.executeSetOuterFrameStyle(tc.params.nodes || '', tc.params.color || '', tc.params.width || '', tc.params.style || '')
              break
            // 二开：AI挖空工具
            case 'ai_cloze':
              result = await this.executeAiCloze(tc.params.node || '', 'smart')
              break
            case 'ai_cloze_aggressive':
              result = await this.executeAiCloze(tc.params.node || '', 'aggressive')
              break
            // 二开：设置与主题工具
            case 'toggle_rich_text':
              result = this.executeToggleRichText()
              break
            case 'toggle_readonly':
              result = this.executeToggleReadonly()
              break
            case 'set_theme':
              result = this.executeSetTheme(tc.params.theme || '')
              break
            case 'toggle_dark_mode':
              result = this.executeToggleDarkMode()
              break
            // 二开：视图操作工具
            case 'toggle_outline':
              result = this.executeToggleOutline()
              break
            case 'back_to_root':
              result = this.executeBackToRoot()
              break
            case 'search_nodes':
              result = this.executeSearchNodes(tc.params.keyword || '')
              break
            case 'zoom_in':
              result = this.executeZoomIn()
              break
            case 'zoom_out':
              result = this.executeZoomOut()
              break
            case 'zoom_reset':
              result = this.executeZoomReset()
              break
            case 'toggle_fullscreen':
              result = this.executeToggleFullscreen()
              break
            case 'expand_all':
              result = this.executeExpandAll()
              break
            case 'collapse_all':
              result = this.executeCollapseAll()
              break
            case 'expand_to_level':
              result = this.executeExpandToLevel(tc.params.level || '2')
              break
            case 'add_node_tag':
              result = this.executeAddNodeTag(tc.params.node || '', tc.params.tag || '')
              break
            case 'add_node_icon':
              result = this.executeAddNodeIcon(tc.params.node || '', tc.params.icon || '')
              break
            default:
              result = { success: false, message: `未知工具：${tc.tool}` }
          }
        } catch (e) {
          result = { success: false, message: `工具执行出错：${e.message || e}` }
        }
        // 统一结果格式：字符串视为成功，对象取 message/success
        const isObj = typeof result === 'object' && result !== null
        results.push({
          tool: tc.tool,
          description: tc.description,
          result: isObj ? result.message : result,
          success: isObj ? result.success : true
        })
      }
      return results
    },

    // 将工具执行结果格式化为发送给AI的消息
    formatToolResults(results) {
      const lines = ['【工具查询/编辑结果】']
      results.forEach((r, i) => {
        lines.push(`[${i + 1}] ${r.description}`)
        lines.push(r.result)
        lines.push('')
      })
      lines.push('请基于以上工具结果继续回答用户的问题。')
      return lines.join('\n')
    },

    // 处理AI回复中的工具调用（主入口）
    handleToolCalls(aiResponseText, historyTextList, originalUserText, options) {
      const toolCalls = this.extractToolCalls(aiResponseText)
      if (toolCalls.length === 0) return false

      // 如果已授权，直接执行
      if (this.aiToolPermissionGranted) {
        this.executeToolCallsAndContinue(toolCalls, aiResponseText, historyTextList, originalUserText, options)
        return true
      }

      // 未授权：显示权限对话框
      this.pendingToolCalls = toolCalls
      this.pendingToolCallback = { aiResponseText, historyTextList, originalUserText, options }
      this.aiToolPermissionVisible = true
      return true
    },

    // 用户授权后执行工具调用（增加空值守卫，防止双击崩溃）
    grantToolPermission() {
      if (!this.pendingToolCallback) return
      this.aiToolPermissionGranted = true
      this.aiToolPermissionVisible = false
      const { aiResponseText, historyTextList, originalUserText, options } = this.pendingToolCallback
      const toolCalls = this.pendingToolCalls
      this.pendingToolCalls = []
      this.pendingToolCallback = null
      this.executeToolCallsAndContinue(toolCalls, aiResponseText, historyTextList, originalUserText, options, 0)
    },

    // 用户拒绝工具调用
    denyToolPermission() {
      this.aiToolPermissionVisible = false
      const lastMsg = this.chatList[this.chatList.length - 1]
      if (lastMsg && lastMsg.type === 'ai') {
        const stripped = this.stripToolCalls(this.stripMemoryTags(lastMsg.content_raw || ''))
        if (!md) md = new MarkdownIt()
        if (stripped) {
          lastMsg.content_raw = stripped + '\n\n（用户拒绝了操作请求，无法提供更多信息）'
          lastMsg.content = md.render(lastMsg.content_raw)
        } else {
          // AI 回复只有工具调用没有其他文本，移除空占位消息
          this.chatList.pop()
        }
      }
      this.pendingToolCalls = []
      this.pendingToolCallback = null
      this.saveCurrentConversation()
    },

    // 执行工具调用并继续AI对话（增加递归深度限制、标签剥离、记忆提取、中止支持）
    executeToolCallsAndContinue(toolCalls, aiResponseText, historyTextList, originalUserText, options, depth) {
      // 递归深度限制，防止无限循环
      const currentDepth = depth || 0
      if (currentDepth >= 5) {
        this.isToolExecuting = false
        this.$message.warning('工具调用已达最大轮次（5轮），已停止')
        return
      }
      // 中止检查
      if (this._toolExecutionAborted) {
        this.isToolExecuting = false
        return
      }

      this.isToolExecuting = true
      // 在当前AI消息上显示"正在调用相关工具..."
      const lastMsg = this.chatList[this.chatList.length - 1]
      if (lastMsg && lastMsg.type === 'ai') {
        if (!md) md = new MarkdownIt()
        const stripped = this.stripToolCalls(this.stripMemoryTags(aiResponseText))
        lastMsg.content_raw = stripped
        // 如果AI的初始回复有实际文字内容，保留显示但加上工具调用提示
        if (stripped.trim()) {
          lastMsg.content = md.render(stripped) +
            '<div class="toolExecutingHint"><span class="el-icon-loading"></span> AI正在调用相关工具...</div>'
        } else {
          // 如果AI只输出了工具调用没有其他文字，只显示工具调用提示
          lastMsg.content = '<div class="toolExecutingHint"><span class="el-icon-loading"></span> AI正在调用相关工具...</div>'
        }
        this.$refs.chatResBoxRef.scrollTop = this.$refs.chatResBoxRef.scrollHeight
      }

      // 使用 setTimeout 让UI先渲染
      setTimeout(async () => {
        // 中止检查
        if (this._toolExecutionAborted) {
          this.isToolExecuting = false
          // 清除旧消息的loading提示
          if (lastMsg && lastMsg.type === 'ai') {
            const cleanText = this.stripToolCalls(this.stripMemoryTags(lastMsg.content_raw || ''))
            if (!md) md = new MarkdownIt()
            lastMsg.content = cleanText ? md.render(cleanText) : ''
          }
          return
        }
        // 执行工具调用（异步）
        const results = await this.executeToolCalls(toolCalls)
        const toolResultsText = this.formatToolResults(results)

        // 清除旧消息的loading提示，保留AI的初始文字
        if (lastMsg && lastMsg.type === 'ai') {
          const cleanText = this.stripToolCalls(this.stripMemoryTags(lastMsg.content_raw || ''))
          if (!md) md = new MarkdownIt()
          lastMsg.content = cleanText ? md.render(cleanText) : ''
        }

        // 追加一条新的AI消息占位
        this.chatList.push({
          id: createUid(),
          type: 'ai',
          content: '<div class="toolExecutingHint"><span class="el-icon-loading"></span> AI正在结合工具返回的信息生成回复...</div>',
          content_raw: ''
        })
        this.isCreating = true
        this.saveCurrentConversation()

        // 构建新的消息列表：历史消息 + 工具结果
        // 明确指示AI：根据工具返回的信息回答用户的问题
        const toolResultWithInstruction = '以下是工具调用返回的信息：\n' + toolResultsText +
          '\n\n请根据以上工具返回的信息，回答用户的原始问题。如果工具信息足够回答，请直接给出准确、简洁的回答；如果信息不足，请说明还缺什么信息。' +
          (originalUserText ? '\n\n用户的原始问题是：' + originalUserText : '')

        const newTextList = [...historyTextList, toolResultWithInstruction]

        this.$nextTick(() => {
          if (this.$refs.chatResBoxRef) {
            this.$refs.chatResBoxRef.scrollTop = this.$refs.chatResBoxRef.scrollHeight
          }
        })

        // 发起新的AI请求
        this.$bus.$emit(
          'ai_chat',
          newTextList,
          res => {
            const currentMsg = this.chatList[this.chatList.length - 1]
            if (currentMsg) {
              currentMsg.content_raw = res
              if (!md) md = new MarkdownIt()
              // 流式过程中剥离工具调用和记忆标签
              const cleanRes = this.stripMemoryTags(this.stripToolCalls(res))
              currentMsg.content = md.render(cleanRes)
            }
            this.$refs.chatResBoxRef.scrollTop = this.$refs.chatResBoxRef.scrollHeight
            this.saveCurrentConversation()
          },
          res => {
            this.isCreating = false
            this.isToolExecuting = false
            // 中止检查
            if (this._toolExecutionAborted) return
            // 检查第二轮回复是否也有工具调用（递归处理）
            const currentMsg = this.chatList[this.chatList.length - 1]
            if (currentMsg && currentMsg.content_raw) {
              // 提取记忆
              this.extractMemory(currentMsg.content_raw)
              const secondToolCalls = this.extractToolCalls(currentMsg.content_raw)
              if (secondToolCalls.length > 0 && this.aiToolPermissionGranted) {
                // 递归处理第二轮工具调用（增加深度）
                const stripped = this.stripToolCalls(this.stripMemoryTags(currentMsg.content_raw))
                if (!md) md = new MarkdownIt()
                currentMsg.content_raw = stripped
                currentMsg.content = md.render(stripped)
                this.saveCurrentConversation()
                this.executeToolCallsAndContinue(secondToolCalls, stripped, newTextList, originalUserText, options, currentDepth + 1)
                return
              } else if (secondToolCalls.length > 0) {
                // 需要权限
                this.handleToolCalls(currentMsg.content_raw, newTextList, originalUserText, options)
                return
              }
            }
            // 正常结束：剥离记忆标签后渲染
            if (currentMsg) {
              if (currentMsg.content_raw) {
                const cleanRaw = this.stripMemoryTags(currentMsg.content_raw)
                currentMsg.content_raw = cleanRaw
                if (!md) md = new MarkdownIt()
                currentMsg.content = md.render(cleanRaw)
              } else {
                // AI返回空内容，移除占位消息或显示提示
                if (currentMsg.content && currentMsg.content.includes('toolExecutingHint')) {
                  this.chatList.pop()
                }
              }
            }
            this.saveCurrentConversation()
          },
          error => {
            this.isCreating = false
            this.isToolExecuting = false
            const currentMsg = this.chatList[this.chatList.length - 1]
            if (currentMsg && !currentMsg.content_raw) {
              this.chatList.pop()
            }
            const errMsg = (error && error.message) || ''
            if (errMsg) {
              this.$message.error('工具查询后AI回复失败：' + errMsg)
            } else {
              this.$message.error(this.$t('ai.generationFailed'))
            }
            this.saveCurrentConversation()
          },
          options || {}
        )
      }, 100)
    },

    // ============ 二开：记忆系统（按文件/文档隔离存储） ============

    // 获取当前文档的记忆存储 key（按文件路径隔离，无文件时用全局 key）
    getMemoryKey() {
      const filePath = this.currentFilePath
      if (filePath) {
        // 用文件路径的哈希值作为 key，避免路径中的特殊字符
        let hash = 0
        for (let i = 0; i < filePath.length; i++) {
          const char = filePath.charCodeAt(i)
          hash = ((hash << 5) - hash) + char
          hash = hash & hash
        }
        return 'ZMIND_AI_MEMORY_' + Math.abs(hash)
      }
      return 'ZMIND_AI_MEMORY'
    },

    // 加载记忆上下文（注入到消息前面）
    loadMemoryContext() {
      try {
        const key = this.getMemoryKey()
        const data = localStorage.getItem(key)
        if (!data) return ''
        const memories = JSON.parse(data)
        if (!Array.isArray(memories) || memories.length === 0) return ''
        // 过滤超过30天的过期记忆
        const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        const valid = memories.filter(m => m.timestamp >= oneMonthAgo)
        if (valid.length !== memories.length) {
          localStorage.setItem(key, JSON.stringify(valid))
        }
        if (valid.length === 0) return ''
        // 最多取最近20条记忆，避免token浪费
        const recent = valid.slice(-20)
        const memoryLines = recent.map((m, i) => `${i + 1}. ${m.text}`)
        return '【历史记忆】以下是之前对话中记录的关键信息：\n' + memoryLines.join('\n')
      } catch (e) {
        return ''
      }
    },

    // 从AI回复中提取记忆并存储
    extractMemory(content) {
      if (!content) return
      // 匹配 <<MEMORY>>内容<</MEMORY>>
      const regex = /<<MEMORY>>([\s\S]*?)<<\/MEMORY>>/g
      let match
      const newMemories = []
      while ((match = regex.exec(content)) !== null) {
        const text = match[1].trim()
        if (text) {
          newMemories.push({
            text: text,
            timestamp: Date.now()
          })
        }
      }
      if (newMemories.length === 0) return
      // 加载已有记忆（按当前文件隔离）
      const key = this.getMemoryKey()
      let existing = []
      try {
        const data = localStorage.getItem(key)
        if (data) existing = JSON.parse(data)
      } catch (e) {}
      // 合并并去重（简单文本去重）
      const existingTexts = new Set(existing.map(m => m.text))
      newMemories.forEach(m => {
        if (!existingTexts.has(m.text)) {
          existing.push(m)
        }
      })
      // 限制最多100条记忆
      if (existing.length > 100) {
        existing = existing.slice(-100)
      }
      localStorage.setItem(key, JSON.stringify(existing))
    },

    // 二开：打开记忆管理器
    openMemoryManager() {
      this.loadMemoryList()
      this.memoryDialogVisible = true
    },

    // 加载记忆列表
    loadMemoryList() {
      try {
        const key = this.getMemoryKey()
        const data = localStorage.getItem(key)
        if (data) {
          this.memoryList = JSON.parse(data)
        } else {
          this.memoryList = []
        }
      } catch (e) {
        this.memoryList = []
      }
    },

    // 添加记忆
    addMemory() {
      const text = this.memoryNewText.trim()
      if (!text) return
      this.memoryList.push({
        text: text,
        timestamp: Date.now()
      })
      this.saveMemoryList()
      this.memoryNewText = ''
    },

    // 开始编辑记忆
    startMemoryEdit(index) {
      this.memoryEditingIndex = index
      this.memoryEditText = this.memoryList[index].text
      this.$nextTick(() => {
        if (this.$refs.memoryEditInput && this.$refs.memoryEditInput[0]) {
          this.$refs.memoryEditInput[0].focus()
        }
      })
    },

    // 保存记忆编辑
    saveMemoryEdit(index) {
      const text = this.memoryEditText.trim()
      if (!text) {
        this.$message.warning('记忆内容不能为空')
        return
      }
      this.memoryList[index].text = text
      this.memoryList[index].timestamp = Date.now()
      this.saveMemoryList()
      this.cancelMemoryEdit()
    },

    // 取消记忆编辑
    cancelMemoryEdit() {
      this.memoryEditingIndex = -1
      this.memoryEditText = ''
    },

    // 删除记忆
    deleteMemory(index) {
      this.memoryList.splice(index, 1)
      this.saveMemoryList()
    },

    // 清空所有记忆
    clearAllMemory() {
      this.$confirm('确定要清空所有记忆吗？此操作不可恢复。', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.memoryList = []
        this.saveMemoryList()
        this.$message.success('已清空所有记忆')
      }).catch(() => {})
    },

    // 保存记忆列表到 localStorage
    saveMemoryList() {
      const key = this.getMemoryKey()
      localStorage.setItem(key, JSON.stringify(this.memoryList))
    },

    // 格式化记忆时间
    formatMemoryTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      const month = date.getMonth() + 1
      const day = date.getDate()
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${month}/${day} ${hours}:${minutes}`
    },

    // 从显示内容中剥离记忆标签
    stripMemoryTags(text) {
      if (!text) return ''
      return text.replace(/<<MEMORY>>[\s\S]*?<<\/MEMORY>>\n?/g, '').trim()
    },

    // 清空当前文档的记忆
    clearMemory() {
      const key = this.getMemoryKey()
      localStorage.removeItem(key)
      this.$message.success('已清空当前文档的AI记忆')
    },

    // ============ 二开：导出工具 ============

    // 工具：导出为Markdown文件
    executeExportMd(content, filename) {
      const name = (filename || 'export').replace(/\.md$/i, '') + '.md'
      this.saveFile(name, content)
      return { success: true, message: `已导出Markdown文件：${name}` }
    },

    // 工具：导出为思维导图文件（SSM）
    executeExportSsm(content, filename) {
      const name = (filename || 'export').replace(/\.ssm$/i, '') + '.ssm'
      // content 是 markdown 格式，需要转换为 SSM 格式
      let ssmContent = content
      try {
        const tree = transformMarkdownTo(content)
        if (tree) {
          ssmContent = JSON.stringify(tree, null, 2)
        }
      } catch (e) {
        // 转换失败，直接保存原始内容
      }
      this.saveFile(name, ssmContent)
      return { success: true, message: `已导出思维导图文件：${name}` }
    },

    // 工具：导出为CSV文件
    executeExportCsv(content, filename) {
      const name = (filename || 'export').replace(/\.csv$/i, '') + '.csv'
      this.saveFile(name, content)
      return { success: true, message: `已导出CSV表格文件：${name}` }
    },

    // 通用文件保存方法（通过 zmindFs 文件系统 API 或浏览器下载）
    async saveFile(filename, content) {
      try {
        const fs = getFs()
        // Electron 环境：通过 zmindFs 选择保存位置并写入文件
        if (fs && fs.getDesktopPath && fs.writeFile) {
          let saveDir = ''
          try {
            if (fs.selectFolder) {
              saveDir = await fs.selectFolder()
            } else {
              saveDir = await fs.getDesktopPath()
            }
          } catch (e) {
            saveDir = await fs.getDesktopPath()
          }
          if (saveDir) {
            const sep = saveDir.includes('\\') ? '\\' : '/'
            const filePath = saveDir.replace(/[\\/]+$/, '') + sep + filename
            await fs.writeFile(filePath, content)
            this.$message.success('文件已保存到：' + filePath)
            return
          }
        }
        // 降级：浏览器环境使用 Blob 下载
        this.browserDownload(filename, content)
      } catch (e) {
        // 最终降级：浏览器下载
        this.browserDownload(filename, content)
      }
    },

    // 浏览器下载文件
    browserDownload(filename, content) {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },

    // ============ 二开：文件操作工具 ============

    async executeNewFile(name, parentDir) {
      if (!name) return { success: false, message: '请提供文件名' }
      const fileName = name.endsWith('.smm') ? name : name + '.smm'
      this.$bus.$emit('zmind_create_file', { name: fileName, parentDir })
      return { success: true, message: `已创建新文件：${fileName}` }
    },

    async executeRenameFile(oldName, newName) {
      if (!oldName || !newName) return { success: false, message: '请提供原文件名和新文件名' }
      this.$bus.$emit('zmind_rename_file', { oldName, newName })
      return { success: true, message: `已将文件「${oldName}」重命名为「${newName}」` }
    },

    async executeDeleteFile(filename) {
      if (!filename) return { success: false, message: '请提供要删除的文件名' }
      this.$bus.$emit('zmind_delete_file', { filename })
      return { success: true, message: `已删除文件：${filename}` }
    },

    async executeMoveFile(filename, targetDir) {
      if (!filename || !targetDir) return { success: false, message: '请提供文件名和目标目录' }
      this.$bus.$emit('zmind_move_file', { filename, targetDir })
      return { success: true, message: `已将文件「${filename}」移动到「${targetDir}」` }
    },

    async executeNewFolder(name, parentDir) {
      if (!name) return { success: false, message: '请提供文件夹名' }
      this.$bus.$emit('zmind_create_folder', { name, parentDir })
      return { success: true, message: `已创建新文件夹：${name}` }
    },

    async executeExportFormat(format, filename) {
      const fmt = (format || 'smm').toLowerCase()
      const validFormats = ['png', 'jpg', 'pdf', 'svg', 'json', 'smm', 'md', 'txt', 'xmind']
      if (!validFormats.includes(fmt)) {
        return { success: false, message: `不支持的导出格式：${fmt}，支持：${validFormats.join(', ')}` }
      }
      try {
        const name = (filename || 'export').replace(/\.\w+$/, '')
        await this.mindMap.export(fmt, true, name)
        return { success: true, message: `已导出为 ${fmt.toUpperCase()} 格式：${name}` }
      } catch (e) {
        return { success: false, message: `导出失败：${e.message || e}` }
      }
    },

    async executeImportFile(filename) {
      if (!filename) return { success: false, message: '请提供要导入的文件名' }
      this.$bus.$emit('zmind_import_file', { filename })
      return { success: true, message: `正在导入文件：${filename}` }
    },

    // ============ 二开：节点高级操作工具 ============

    executeInsertImage(nodeText, url, width, height) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到节点「${nodeText}」` }
      const imageData = { url: url || '' }
      if (width) imageData.width = parseInt(width) || 100
      if (height) imageData.height = parseInt(height) || 100
      this.mindMap.execCommand('SET_NODE_IMAGE', node, imageData)
      return { success: true, message: `已为节点「${nodeText}」插入图片` }
    },

    executeAddHyperlink(nodeText, url, title) {
      if (!url) return { success: false, message: '请提供超链接URL' }
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到节点「${nodeText}」` }
      const linkData = { url, title: title || '' }
      this.mindMap.execCommand('SET_NODE_HYPERLINK', node, linkData)
      return { success: true, message: `已为节点「${nodeText}」添加超链接：${url}` }
    },

    executeAddNote(nodeText, note) {
      if (!note) return { success: false, message: '请提供备注内容' }
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到节点「${nodeText}」` }
      try {
        node.setNote(note)
        this.mindMap.render()
        return { success: true, message: `已为节点「${nodeText}」添加备注` }
      } catch (e) {
        this.mindMap.execCommand('SET_NODE_NOTE', node, note)
        return { success: true, message: `已为节点「${nodeText}」添加备注` }
      }
    },

    executeAddSummary(nodeText, text) {
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到节点「${nodeText}」` }
      this.mindMap.execCommand('ADD_GENERALIZATION')
      if (text) {
        const generalizationNodes = this.mindMap.renderer.root && this.mindMap.renderer.root.nodeData
        setTimeout(() => {
          const activeNodes = this.mindMap.renderer.activeNodeList || []
          const genNode = activeNodes[activeNodes.length - 1]
          if (genNode && genNode.isGeneralization) {
            genNode.setText(text)
            this.mindMap.render()
          }
        }, 100)
      }
      return { success: true, message: `已为节点「${nodeText}」添加概要` }
    },

    executeAddFormula(nodeText, formula) {
      if (!formula) return { success: false, message: '请提供公式内容' }
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到节点「${nodeText}」` }
      this.mindMap.renderer.activeNodeList = [node]
      try {
        this.mindMap.execCommand('INSERT_FORMULA', formula)
        return { success: true, message: `已为节点「${nodeText}」添加公式：${formula}` }
      } catch (e) {
        return { success: false, message: `添加公式失败：${e.message || e}` }
      }
    },

    executeAddOuterFrame(nodesText, text) {
      const nodeTexts = nodesText.split(',').map(s => s.trim()).filter(Boolean)
      const nodes = nodeTexts.map(t => this.findNodeByText(t)).filter(Boolean)
      if (nodes.length === 0) return { success: false, message: '未找到指定节点' }
      this.mindMap.renderer.activeNodeList = nodes
      try {
        this.$bus.$emit('addOuterFrame')
        return { success: true, message: `已为节点添加外框` }
      } catch (e) {
        return { success: false, message: `添加外框失败：${e.message || e}` }
      }
    },

    executeSetOuterFrameColor(nodesText, color) {
      if (!color) return { success: false, message: '请提供颜色值' }
      const normalizedColor = this.normalizeColor(color)
      this.$bus.$emit('setOuterFrameStyle', { strokeColor: normalizedColor })
      return { success: true, message: `已设置外框颜色为：${color}` }
    },

    executeSetOuterFrameStyle(nodesText, color, width, style) {
      const styleData = {}
      if (color) styleData.strokeColor = this.normalizeColor(color)
      if (width) styleData.strokeWidth = parseInt(width) || 1
      if (style) {
        const styleMap = { 'solid': 'solid', 'dashed': 'dash', 'dotted': 'dot', '实线': 'solid', '虚线': 'dash', '点线': 'dot' }
        styleData.strokeDasharray = styleMap[style.toLowerCase()] || style
      }
      if (Object.keys(styleData).length === 0) {
        return { success: false, message: '请提供至少一个样式参数（color/width/style）' }
      }
      this.$bus.$emit('setOuterFrameStyle', styleData)
      return { success: true, message: `已设置外框样式` }
    },

    // ============ 二开：AI挖空工具 ============

    async executeAiCloze(nodeText, mode) {
      if (!this.aiConfig || !this.aiConfig.api || !this.aiConfig.key) {
        return { success: false, message: 'AI未配置，请先设置API地址和密钥' }
      }
      if (!nodeText) return { success: false, message: '请提供要挖空的节点文本' }
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到节点「${nodeText}」` }
      // 收集该节点及其所有子节点
      const nodeList = []
      const walk = (n) => {
        nodeList.push(n)
        ;(n.children || []).forEach(walk)
      }
      walk(node)
      if (nodeList.length === 0) {
        return { success: false, message: '该节点没有可挖空的子节点' }
      }
      try {
        const count = await smartClozeNodes(this.aiConfig, nodeList)
        return { success: true, message: `已对节点「${nodeText}」及其子节点完成${mode === 'aggressive' ? '激进' : '智能'}挖空，共处理${nodeList.length}个节点` }
      } catch (e) {
        return { success: false, message: `AI挖空失败：${e.message || e}` }
      }
    },

    // ============ 二开：设置与主题工具 ============

    executeToggleRichText() {
      const current = this.$store.state.localConfig.openNodeRichText
      this.setLocalConfig({ openNodeRichText: !current })
      this.$bus.$emit('toggleOpenNodeRichText', !current)
      return { success: true, message: `富文本编辑已${!current ? '开启' : '关闭'}` }
    },

    executeToggleReadonly() {
      const current = this.$store.state.isReadonly
      this.mindMap.setMode(current ? 'edit' : 'readonly')
      return { success: true, message: `已切换为${current ? '编辑' : '只读'}模式` }
    },

    executeSetTheme(themeName) {
      if (!themeName) return { success: false, message: '请提供主题名称' }
      const availableThemes = this.mindMap.getThemes ? this.mindMap.getThemes() : {}
      // 模糊匹配主题名
      const themeKeys = Object.keys(availableThemes)
      let matched = themeKeys.find(k => k.toLowerCase() === themeName.toLowerCase())
      if (!matched) {
        matched = themeKeys.find(k => k.toLowerCase().includes(themeName.toLowerCase()))
      }
      if (!matched) {
        // 常见主题映射
        const themeMap = {
          'dark': 'dark', '深色': 'dark', '暗色': 'dark', '黑夜': 'dark',
          'classic': 'classic', '经典': 'classic',
          'gold': 'gold', '金色': 'gold',
          'sea': 'sea', '海洋': 'sea',
          'rose': 'rose', '玫瑰': 'rose',
          'tech': 'tech', '科技': 'tech', '科技蓝': 'tech',
          'green': 'green', '绿色': 'green',
          'mini': 'mini', '简约': 'mini',
          'sky': 'sky', '天空': 'sky',
          'earth': 'earth', '地球': 'earth'
        }
        matched = themeMap[themeName.toLowerCase()]
      }
      if (matched && availableThemes[matched]) {
        this.mindMap.setTheme(matched)
        return { success: true, message: `已切换主题为：${matched}` }
      }
      return { success: false, message: `未找到主题「${themeName}」，可用主题：${themeKeys.join(', ')}` }
    },

    executeToggleDarkMode() {
      const current = this.$store.state.localConfig.isDark
      this.setLocalConfig({ isDark: !current })
      return { success: true, message: `已切换为${!current ? '暗黑' : '明亮'}模式` }
    },

    // ============ 二开：视图操作工具 ============

    executeToggleOutline() {
      const current = this.$store.state.isOutlineEdit
      this.$store.commit('setIsOutlineEdit', !current)
      return { success: true, message: `已${!current ? '进入' : '退出'}大纲模式` }
    },

    executeBackToRoot() {
      this.mindMap.renderer.setRootNodeCenter()
      return { success: true, message: '已回到根节点' }
    },

    executeSearchNodes(keyword) {
      if (!keyword) return { success: false, message: '请提供搜索关键词' }
      this.$bus.$emit('show_search')
      setTimeout(() => {
        const searchInput = document.querySelector('.searchInput input') || document.querySelector('.search input')
        if (searchInput) {
          searchInput.value = keyword
          searchInput.dispatchEvent(new Event('input'))
        }
      }, 200)
      return { success: true, message: `已搜索：${keyword}（请在搜索面板查看结果）` }
    },

    executeZoomIn() {
      this.mindMap.view.enlarge()
      return { success: true, message: '已放大' }
    },

    executeZoomOut() {
      this.mindMap.view.narrow()
      return { success: true, message: '已缩小' }
    },

    executeZoomReset() {
      this.mindMap.view.reset()
      return { success: true, message: '已重置缩放' }
    },

    executeToggleFullscreen() {
      try {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen && document.documentElement.requestFullscreen()
          return { success: true, message: '已进入全屏模式' }
        } else {
          document.exitFullscreen && document.exitFullscreen()
          return { success: true, message: '已退出全屏模式' }
        }
      } catch (e) {
        return { success: false, message: `全屏切换失败：${e.message || e}` }
      }
    },

    executeExpandAll() {
      this.mindMap.execCommand('EXPAND_ALL')
      return { success: true, message: '已展开所有节点' }
    },

    executeCollapseAll() {
      this.mindMap.execCommand('UNEXPAND_ALL')
      return { success: true, message: '已收起所有节点' }
    },

    executeExpandToLevel(level) {
      const lv = parseInt(level) || 2
      this.mindMap.execCommand('UNEXPAND_TO_LEVEL', lv)
      return { success: true, message: `已展开到第${lv}级` }
    },

    executeAddNodeTag(nodeText, tag) {
      if (!tag) return { success: false, message: '请提供标签内容' }
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到节点「${nodeText}」` }
      const tagData = [{ text: tag }]
      this.mindMap.execCommand('SET_NODE_TAG', node, tagData)
      return { success: true, message: `已为节点「${nodeText}」添加标签：${tag}` }
    },

    executeAddNodeIcon(nodeText, icon) {
      if (!icon) return { success: false, message: '请提供图标名称' }
      const node = this.findNodeByText(nodeText)
      if (!node) return { success: false, message: `未找到节点「${nodeText}」` }
      const iconMap = { 'priority': 'priority_1', '优先级': 'priority_1', 'flag': 'flag_1', '旗帜': 'flag_1', 'star': 'star_1', '星星': 'star_1', 'smile': 'smile_1', '笑脸': 'smile_1' }
      const iconName = iconMap[icon.toLowerCase()] || icon
      const iconData = [iconName]
      this.mindMap.execCommand('SET_NODE_ICON', node, iconData)
      return { success: true, message: `已为节点「${nodeText}」添加图标：${icon}` }
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
      if (this.isCreating || this.isToolExecuting) {
        this.$message.warning('AI正在处理中，请稍后再试')
        return
      }
      // 重置工具执行中止标志
      this._toolExecutionAborted = false
      const text = this.text.trim()
      const hasImages = this.pasteImages.length > 0
      const hasNodeRefs = this.referencedNodes.length > 0
      if (!text && !hasImages && !hasNodeRefs) {
        return
      }
      const images = this.pasteImages.map(img => img.dataUrl)
      // 二开：拼接引用节点文本到消息中（自动检测层级关系）
      let nodeRefsText = ''
      if (hasNodeRefs) {
        nodeRefsText = this.buildReferencedNodesText()
      }
      // 二开：添加工具系统提示（默认激活）
      const toolPrompt = this.buildToolSystemPrompt()
      const hasTools = !!toolPrompt
      // 二开：加载记忆上下文
      const memoryText = this.loadMemoryContext()
      this.text = ''
      this.pasteImages = []
      const sentNodeRefs = this.referencedNodes.slice()
      this.referencedNodes = []

      // 文档内容只在当前会话的第一条消息中发送，后续消息不再重复发送以节省token
      let fullText = text
      let displayText = text
      // 拼接记忆上下文
      if (memoryText) {
        fullText = memoryText + '\n\n' + fullText
      }
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
      // 拼接工具系统提示
      if (toolPrompt) {
        fullText = fullText + toolPrompt
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

      // 二开：思维导图生成模式 - 在消息前加思维导图格式指令
      const useMindMap = this.mindMapMode
      if (useMindMap) {
        fullText =
          '请根据以下内容生成思维导图，使用 markdown 格式输出。格式要求：\n' +
          '1. 第一行以 # 开头作为根节点标题\n' +
          '2. 子节点使用 - 开头的缩进列表，每级缩进 2 个空格\n' +
          '3. 可以有任意层级\n' +
          '4. 只输出 markdown 内容，不要包含任何解释、代码块标记或额外文字\n\n' +
          '内容：' + fullText
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
        content: '',
        isMindMap: useMindMap,
        _lastRender: 0
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
          const lastMsg = this.chatList[this.chatList.length - 1]
          if (lastMsg) {
            // res 是完整累积文本（非增量），直接赋值
            lastMsg.content_raw = res
            if (lastMsg.isMindMap) {
              // 思维导图模式：节流渲染树预览（避免流式频繁解析卡顿）
              const now = Date.now()
              if (now - (lastMsg._lastRender || 0) > 400) {
                lastMsg._lastRender = now
                // 流式过程中剥离工具调用和记忆标签
                const cleanRes = this.stripMemoryTags(this.stripToolCalls(res))
                lastMsg.content = this.renderMindMapTree(cleanRes)
              }
            } else {
              if (!md) md = new MarkdownIt()
              // 流式过程中剥离工具调用和记忆标签
              const cleanRes = this.stripMemoryTags(this.stripToolCalls(res))
              lastMsg.content = md.render(cleanRes)
            }
          }
          this.$refs.chatResBoxRef.scrollTop =
            this.$refs.chatResBoxRef.scrollHeight
          // 流式过程中自动保存，避免意外退出丢失
          this.saveCurrentConversation()
        },
        () => {
          this.isCreating = false
          // 二开：安全清除工具执行状态（防止残留）
          if (!this._toolExecutionAborted) {
            this.isToolExecuting = false
          }
          // 最终渲染（确保思维导图树完整显示，剥离工具调用和记忆标签）
          const lastMsg = this.chatList[this.chatList.length - 1]
          if (lastMsg && lastMsg.isMindMap && lastMsg.content_raw) {
            const cleanRaw = this.stripMemoryTags(this.stripToolCalls(lastMsg.content_raw))
            lastMsg.content = this.renderMindMapTree(cleanRaw)
          } else if (lastMsg && !lastMsg.isMindMap && lastMsg.content_raw) {
            // 普通模式：最终渲染（剥离工具调用和记忆标签）
            if (!md) md = new MarkdownIt()
            const cleanRaw = this.stripMemoryTags(this.stripToolCalls(lastMsg.content_raw))
            lastMsg.content_raw = cleanRaw
            lastMsg.content = md.render(cleanRaw)
          }
          // 二开：提取记忆（从回复末尾的 <<MEMORY>> 标签中提取）
          if (lastMsg && lastMsg.content_raw) {
            this.extractMemory(lastMsg.content_raw)
          }
          // 二开：检查并处理工具调用（提示词模式，当有工具提示时检查）
          if (lastMsg && lastMsg.content_raw && hasTools) {
            const rawText = lastMsg.content_raw
            const toolCalls = this.extractToolCalls(rawText)
            if (toolCalls.length > 0) {
              // 处理工具调用（传入原始文本，handleToolCalls 内部会重新提取）
              const options = { enableThinking: this.chatThinking }
              this.handleToolCalls(rawText, textList, text, options)
              return
            }
          }
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
        },
        // 二开：深度思考模式开关 + 联网搜索开关
        { enableThinking: this.chatThinking, webSearch: this.webSearchEnabled }
      )
    },

    stop() {
      // 中止工具执行链
      this._toolExecutionAborted = true
      this.$bus.$emit('ai_chat_stop')
      this.isCreating = false
      this.isToolExecuting = false
      this._lastLoadingTime = null
      // 清除所有消息上的loading提示
      if (!md) md = new MarkdownIt()
      this.chatList.forEach(msg => {
        if (msg.type === 'ai' && msg.content && msg.content.includes('toolExecutingHint')) {
          const cleanText = this.stripToolCalls(this.stripMemoryTags(msg.content_raw || ''))
          msg.content = cleanText ? md.render(cleanText) : ''
        }
      })
      this.saveCurrentConversation()
    },

    // 二开：切换思维导图生成模式
    toggleMindMapMode() {
      this.mindMapMode = !this.mindMapMode
      if (this.mindMapMode) {
        this.$message.success('已开启思维导图生成模式，AI将按思维导图格式回复')
      } else {
        this.$message.info('已关闭思维导图生成模式')
      }
    },

    // 二开：切换信任模式（开启后AI操作无需逐次确认）
    toggleTrustMode() {
      this.trustModeEnabled = !this.trustModeEnabled
      if (this.trustModeEnabled) {
        this.aiToolPermissionGranted = true
        this.$message.success('已开启信任模式，AI的所有操作将无需逐次确认')
      } else {
        this.aiToolPermissionGranted = false
        this.$message.info('已关闭信任模式，AI操作将需要逐次确认')
      }
    },

    // 二开：将AI生成的思维导图插入为某节点的子节点
    insertAsChild(item) {
      if (!item.content_raw) return
      this.$bus.$emit('zmind_ai_mindmap_pick', {
        mode: 'insert',
        markdown: item.content_raw
      })
      this.$message.info('请点击要插入子节点的目标节点位置')
      // 关闭侧边栏以便点击画布节点
      this.$store.commit('setActiveSidebar', '')
    },

    // 二开：用AI生成的思维导图替换某节点及其子节点
    replaceNodeContent(item) {
      if (!item.content_raw) return
      this.$bus.$emit('zmind_ai_mindmap_pick', {
        mode: 'replace',
        markdown: item.content_raw
      })
      this.$message.info('请点击要替换的目标节点位置')
      this.$store.commit('setActiveSidebar', '')
    },

    // 二开：将AI返回的markdown渲染为思维导图树形HTML预览
    renderMindMapTree(markdown) {
      try {
        const clean = (markdown || '')
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<think>[\s\S]*/gi, '')
          .trim()
        if (!clean) return '<div class="mmEmpty">生成中...</div>'
        const tree = transformMarkdownTo(clean)
        if (!tree) return '<div class="mmEmpty">等待思维导图内容...</div>'
        return '<div class="mmTree">' + this.treeToHtml(tree, 0) + '</div>'
      } catch (e) {
        return '<div class="mmEmpty">解析中...</div>'
      }
    },

    // 递归将树数据转为HTML
    treeToHtml(node, depth) {
      if (!node || !node.data) return ''
      const rawText = node.data.text || ''
      const text = String(rawText)
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
      const rootCls = depth === 0 ? ' mmRoot' : ''
      let html =
        '<div class="mmNode' +
        rootCls +
        '"><span class="mmText">' +
        this.escapeHtml(text) +
        '</span>'
      if (node.children && node.children.length > 0) {
        html += '<div class="mmChildren">'
        node.children.forEach(child => {
          html += this.treeToHtml(child, depth + 1)
        })
        html += '</div>'
      }
      html += '</div>'
      return html
    },

    clear() {
      this.chatList = []
      // 重置工具调用状态
      this.aiToolPermissionVisible = false
      this.pendingToolCalls = []
      this.pendingToolCallback = null
      this.isToolExecuting = false
      this._toolExecutionAborted = false
      if (!this.trustModeEnabled) {
        this.aiToolPermissionGranted = false
      }
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

    // ============ 二开：智能内容类型检测 + 上下文导出 ============

    // 检测AI回复内容包含哪些可操作类型（表格/代码块/CSV/思维导图/Markdown）
    getContentTypes(item) {
      if (!item || !item.content_raw) return []
      const text = item.content_raw
      const types = []

      // 表格：markdown 表格语法 |---|---|
      if (/\|.*\|[\s\S]*?\n[\s|-]+\|/.test(text) || /^\|.+\|$/m.test(text)) {
        types.push('table')
      }

      // 代码块：```lang ... ```
      if (/```[\s\S]*?```/.test(text)) {
        // 提取代码语言
        const codeMatch = text.match(/```(\w*)\n[\s\S]*?```/)
        if (codeMatch && codeMatch[1]) {
          types.push('code_' + codeMatch[1].toLowerCase())
        } else {
          types.push('code')
        }
      }

      // CSV：连续多行以逗号分隔且有表头
      const lines = text.split('\n').filter(l => l.trim())
      let csvLineCount = 0
      lines.forEach(l => {
        if (/^[^,\n]+,([^,\n]+,){1,}[^,\n]*$/.test(l.trim())) csvLineCount++
      })
      if (csvLineCount >= 3) {
        types.push('csv')
      }

      // 思维导图：以 # 开头的 markdown 列表结构
      if (item.isMindMap || (/^#\s/m.test(text) && /^\s*-\s/m.test(text))) {
        types.push('mindmap')
      }

      // JSON 代码块
      if (/```json[\s\S]*?```/.test(text) || /^\{[\s\S]*\}$/.test(text.trim())) {
        types.push('json')
      }

      // 通用 Markdown（标题、列表、引用等）
      if (this.hasMarkdown(text)) {
        types.push('markdown')
      }

      return types
    },

    // 根据内容类型获取可用的导出选项
    getExportOptions(item) {
      const types = this.getContentTypes(item)
      const options = []

      if (types.includes('mindmap')) {
        options.push({ label: '导出思维导图', icon: 'el-icon-share', action: 'export_ssm_from_chat' })
      }
      if (types.includes('table') || types.includes('csv')) {
        options.push({ label: '导出CSV', icon: 'el-icon-s-grid', action: 'export_csv_from_chat' })
        options.push({ label: '导出Excel', icon: 'el-icon-document', action: 'export_excel_from_chat' })
      }
      if (types.includes('markdown') || types.includes('table') || types.includes('code')) {
        options.push({ label: '导出Markdown', icon: 'el-icon-document-copy', action: 'export_md_from_chat' })
      }
      if (types.includes('json')) {
        options.push({ label: '导出JSON', icon: 'el-icon-files', action: 'export_json_from_chat' })
      }
      // 任何内容都可以导出为纯文本
      options.push({ label: '导出纯文本', icon: 'el-icon-tickets', action: 'export_txt_from_chat' })

      return options
    },

    // 执行导出操作
    handleExportAction(action, item) {
      if (!item || !item.content_raw) return
      const content = item.content_raw

      switch (action) {
        case 'export_ssm_from_chat':
          this.exportChatAsSsm(content)
          break
        case 'export_csv_from_chat':
          this.exportChatAsCsv(content)
          break
        case 'export_excel_from_chat':
          this.exportChatAsExcel(content)
          break
        case 'export_md_from_chat':
          this.saveFile('AI回复_' + Date.now() + '.md', content)
          this.$message.success('已导出Markdown文件')
          break
        case 'export_json_from_chat':
          this.exportChatAsJson(content)
          break
        case 'export_txt_from_chat': {
          // 去除 markdown 格式符号，保留纯文本
          const plainText = content
            .replace(/```[\w]*\n?/g, '')
            .replace(/```/g, '')
            .replace(/#{1,6}\s/g, '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/\|/g, '\t')
          this.saveFile('AI回复_' + Date.now() + '.txt', plainText)
          this.$message.success('已导出纯文本文件')
          break
        }
      }
    },

    // 从聊天内容导出为思维导图文件
    exportChatAsSsm(content) {
      const name = 'AI思维导图_' + Date.now() + '.ssm'
      let ssmContent = content
      try {
        const tree = transformMarkdownTo(content)
        if (tree) {
          ssmContent = JSON.stringify(tree, null, 2)
        }
      } catch (e) {}
      this.saveFile(name, ssmContent)
      this.$message.success('已导出思维导图文件')
    },

    // 从聊天内容提取表格并导出为 CSV
    exportChatAsCsv(content) {
      // 尝试提取 markdown 表格
      const tableRegex = new RegExp('^\\|.+\\|[\\s\\S]*?\\n\\|[\\s:|-]+\\|[\\s\\S]*?(?=\\n\\n|\\n#|\\n' + '`'.repeat(3) + '|$)', 'm')
      const tableMatch = content.match(tableRegex)
      let csvContent = ''
      if (tableMatch) {
        csvContent = tableMatch[0]
          .split('\n')
          .filter(line => line.trim() && !/^\|[\s:|-]+$/.test(line.trim()))
          .map(line => {
            return line.trim()
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map(cell => {
                const c = cell.trim()
                // 包含逗号或引号的字段需要用双引号包裹
                if (c.includes(',') || c.includes('"') || c.includes('\n')) {
                  return '"' + c.replace(/"/g, '""') + '"'
                }
                return c
              })
              .join(',')
          })
          .join('\n')
      } else {
        // 如果已经是 CSV 格式
        csvContent = content
      }
      this.saveFile('AI表格_' + Date.now() + '.csv', '\ufeff' + csvContent)
      this.$message.success('已导出CSV文件')
    },

    // 从聊天内容提取表格并导出为 Excel（HTML 表格格式，Excel 可打开）
    exportChatAsExcel(content) {
      const tableRegex = new RegExp('^\\|.+\\|[\\s\\S]*?\\n\\|[\\s:|-]+\\|[\\s\\S]*?(?=\\n\\n|\\n#|\\n' + '`'.repeat(3) + '|$)', 'm')
      const tableMatch = content.match(tableRegex)
      let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table border="1">'
      if (tableMatch) {
        const rows = tableMatch[0]
          .split('\n')
          .filter(line => line.trim() && !/^\|[\s:|-]+$/.test(line.trim()))
        rows.forEach((line, idx) => {
          const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
          html += '<tr>'
          cells.forEach(cell => {
            const tag = idx === 0 ? 'th' : 'td'
            html += `<${tag} style="border:1px solid #ccc;padding:6px;">${cell}</${tag}>`
          })
          html += '</tr>'
        })
      } else {
        // 非 markdown 表格，按行分割
        content.split('\n').forEach(line => {
          if (!line.trim()) return
          const cells = line.split('\t')
          html += '<tr>'
          cells.forEach(cell => {
            html += `<td style="border:1px solid #ccc;padding:6px;">${cell.trim()}</td>`
          })
          html += '</tr>'
        })
      }
      html += '</table></body></html>'
      this.saveFile('AI表格_' + Date.now() + '.xls', html)
      this.$message.success('已导出Excel文件')
    },

    // 从聊天内容提取 JSON 并导出
    exportChatAsJson(content) {
      // 尝试从代码块中提取 JSON
      const jsonMatch = content.match(/```json\n?([\s\S]*?)```/) || content.match(/```\n?([\s\S]*?)```/)
      let jsonContent = content
      if (jsonMatch && jsonMatch[1]) {
        jsonContent = jsonMatch[1].trim()
        // 验证是否为有效 JSON
        try {
          JSON.parse(jsonContent)
        } catch (e) {
          // 不是有效 JSON，原样保存
        }
      } else {
        // 尝试直接解析
        try {
          JSON.parse(content.trim())
          jsonContent = content.trim()
        } catch (e) {}
      }
      this.saveFile('AI数据_' + Date.now() + '.json', jsonContent)
      this.$message.success('已导出JSON文件')
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
      // 重置工具调用权限（信任模式保持不变，由用户控制）
      if (!this.trustModeEnabled) {
        this.aiToolPermissionGranted = false
      }
      this.aiToolPermissionVisible = false
      this.pendingToolCalls = []
      this.pendingToolCallback = null
      this.isToolExecuting = false
      this._toolExecutionAborted = false
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
      // 重置工具调用状态（信任模式保持不变）
      if (!this.trustModeEnabled) {
        this.aiToolPermissionGranted = false
      }
      this.aiToolPermissionVisible = false
      this.pendingToolCalls = []
      this.pendingToolCallback = null
      this.isToolExecuting = false
      this._toolExecutionAborted = false
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
// 二开：独立可拖拽面板容器
.aiChatPanel {
  position: fixed;
  display: none;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  background-color: #fff;

  &.show {
    display: flex;
  }

  &.isDark {
    background-color: #262a2e;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }
}

// 二开：可拖拽标题栏
.aiChatDragBar {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: move;
  background-color: #f5f7fa;
  border-bottom: 1px solid #e8e8e8;
  user-select: none;

  .aiChatTitle {
    font-size: 12px;
    font-weight: 600;
    color: #333;
  }

  .aiChatCloseBtn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 16px;
    cursor: pointer;
    color: #999;
    transition: color 0.2s;

    &:hover {
      color: #f56c6c;
    }
  }

  .isDark & {
    background-color: #2f3439;
    border-bottom-color: hsla(0, 0%, 100%, 0.1);

    .aiChatTitle {
      color: #fff;
    }

    .aiChatCloseBtn {
      color: hsla(0, 0%, 100%, 0.5);

      &:hover {
        color: #f56c6c;
      }
    }
  }
}

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
    height: 34px;
    flex-shrink: 0;
    border-bottom: 1px solid #e8e8e8;
    display: flex;
    align-items: center;
    padding: 0 8px;

    .el-button {
      font-size: 11px;
      padding: 3px 6px;
    }
  }

  .chatResBox {
    width: 100%;
    flex: 1;
    min-height: 0;
    padding: 0 8px;
    margin: 6px 0;
    overflow-y: auto;
    overflow-x: hidden;

    .chatItem {
      margin-bottom: 8px;
      border: 1px solid;
      position: relative;
      border-radius: 6px;

      &:last-of-type {
        margin-bottom: 0;
      }

      // 二开：hover 时高亮复制/重新询问按钮
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
        padding: 6px 8px;
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

        // 二开：右上角一键复制按钮（半透明显示，hover 高亮）
        .msgCopyBtn {
          position: absolute;
          right: 6px;
          top: 4px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: #909399;
          cursor: pointer;
          border-radius: 4px;
          opacity: 0.45;
          transition: all 0.2s;
          z-index: 2;

          &:hover {
            color: #409eff;
            background-color: #ecf5ff;
            opacity: 1;
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
          word-break: break-word;
          color: #3f4a54;
          font-size: 12px;
          line-height: 1.5;

          .msgImages {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 6px;

            .msgImage {
              max-width: 100px;
              max-height: 100px;
              border-radius: 4px;
              object-fit: cover;
            }
          }

          p {
            margin-bottom: 8px;

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
    padding: 4px 8px;
    border-top: 1px solid #e8e8e8;
    border-bottom: 1px solid #e8e8e8;
    background-color: #fafafa;

    .actionBtns {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 3px;

      .actionBtn + .actionBtn {
        margin-left: 0;
      }

      .el-dropdown {
        margin-left: 0;
      }
    }

    .actionBtn {
      padding: 2px 5px;
      border-radius: 5px;
      font-size: 10px;
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
  }

  .chatInputBox {
    flex-shrink: 0;
    width: 100%;
    min-height: 100px;
    border-top: 1px solid #e8e8e8;
    position: relative;
    display: flex;
    flex-direction: column;

    .pastePreview {
      flex-shrink: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 10px 0;
    }

    .pastePreviewItem {
      position: relative;
      width: 50px;
      height: 50px;
      border-radius: 4px;
      overflow: visible;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 4px;
      }

      .removeImg {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: #f56c6c;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 10px;
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
      gap: 4px;
      padding: 6px 10px 0;
      max-height: 80px;
      overflow-y: auto;
    }

    .nodeRefItem {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      max-width: 100%;
      padding: 3px 6px;
      background-color: rgba(175, 184, 193, 0.2);
      border-radius: 4px;
      font-size: 11px;
      color: #586069;
      position: relative;

      .nodeRefIcon {
        font-size: 11px;
        color: #909090;
        flex-shrink: 0;
      }

      .nodeRefText {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 140px;
      }

      .removeNodeRef {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
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
      min-height: 60px;
      outline: none;
      padding: 6px 10px;
      border: none;
      font-size: 12px;
    }

    // 二开：输入提示
    .inputHintInline {
      flex-shrink: 0;
      padding: 0 10px 4px;
      font-size: 10px;
      color: #b0b0b0;
    }

    // 二开：底部工具行（深度思考 + 模型选择 + 发送）
    .inputActionRow {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px 6px;
      position: relative;

      .actionBtn {
        padding: 2px 5px;
        border-radius: 5px;
        font-size: 10px;
        transition: all 0.2s;

        &:hover {
          background-color: #ecf5ff;
          border-color: #c6e2ff;
          color: #409eff;
        }

        &.active {
          background-color: #f0f9eb;
          border-color: #b3e19d;
          color: #67c23a;
        }
      }

      .thinkToggleBtn.active {
        background-color: #ecf5ff;
        border-color: #c6e2ff;
        color: #409eff;
      }

      // 模型选择按钮
      .modelSwitchBtn {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        max-width: 130px;

        .modelSwitchName {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 80px;
          font-size: 10px;
        }

        .modelSwitchArrow {
          font-size: 10px;
        }
      }

      .sendBtn {
        margin-left: auto;
      }

      .stop {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        top: -28px;
      }
    }
  }
}

/* 二开：记忆管理对话框样式 */
.aiMemoryDialog {
  .memoryManager {
    .memoryAddRow {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;

      .el-input {
        flex: 1;
      }
    }

    .memoryList {
      max-height: 350px;
      overflow-y: auto;
    }

    .memoryItem {
      display: flex;
      align-items: center;
      padding: 6px 8px;
      border-bottom: 1px solid #f0f0f0;
      gap: 6px;
      transition: background-color 0.2s;

      &:hover {
        background-color: #f9f9fb;

        .memoryActions {
          opacity: 1;
        }
      }

      .memoryText {
        flex: 1;
        font-size: 13px;
        color: #333;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .memoryTime {
        font-size: 11px;
        color: #bbb;
        flex-shrink: 0;
      }

      .memoryActions {
        display: flex;
        gap: 6px;
        opacity: 0;
        transition: opacity 0.2s;
        flex-shrink: 0;

        .memoryActionBtn {
          cursor: pointer;
          font-size: 14px;
          color: #999;
          transition: color 0.2s;

          &:hover {
            color: #409eff;
          }

          &.memoryDeleteBtn:hover {
            color: #f56c6c;
          }
        }
      }
    }

    .memoryEmpty {
      text-align: center;
      padding: 30px 0;
      color: #999;
      font-size: 13px;
    }
  }
}

.aiMemoryDialogDark {
  .memoryManager {
    .memoryItem {
      border-bottom-color: hsla(0, 0%, 100%, 0.08);

      &:hover {
        background-color: hsla(0, 0%, 100%, 0.05);
      }

      .memoryText {
        color: hsla(0, 0%, 100%, 0.85);
      }

      .memoryTime {
        color: hsla(0, 0%, 100%, 0.3);
      }
    }

    .memoryEmpty {
      color: hsla(0, 0%, 100%, 0.4);
    }
  }
}
</style>

<style lang="less">
/* 二开：思维导图预览树（v-html 渲染，需放在非 scoped 样式中） */
.mmTree {
  font-size: 13px;
  line-height: 1.6;
}
.mmNode {
  padding: 2px 0 2px 4px;
  position: relative;
}
.mmNode.mmRoot {
  font-weight: bold;
  font-size: 14px;
  color: #0984e3;
  margin-bottom: 4px;
}
.mmNode.mmRoot .mmText {
  background: rgba(9, 132, 227, 0.1);
}
.mmChildren {
  margin-left: 14px;
  padding-left: 12px;
  border-left: 1.5px dashed #bbb;
}
.mmNode .mmText {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
}
.mmEmpty {
  color: #999;
  font-style: italic;
  padding: 8px 0;
}
/* 思维导图操作按钮行 */
.mmActionRow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.mmActionBtn {
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 4px;
  background: #f0f5ff;
  color: #0984e3;
  cursor: pointer;
  border: 1px solid #d6e4ff;
  user-select: none;
  transition: all 0.15s;
}
.mmActionBtn:hover {
  background: #0984e3;
  color: #fff;
  border-color: #0984e3;
}
/* 深度思考按钮激活态 */
.thinkToggleBtn.active {
  background: #6c5ce7 !important;
  color: #fff !important;
  border-color: #6c5ce7 !important;
}
/* 暗黑模式适配 */
.aiChatBox.isDark {
  .mmNode.mmRoot {
    color: #74b9ff;
  }
  .mmNode.mmRoot .mmText {
    background: rgba(116, 185, 255, 0.12);
  }
  .mmChildren {
    border-left-color: #555;
  }
  .mmActionBtn {
    background: #2d3a4a;
    color: #74b9ff;
    border-color: #3d4a5a;
  }
  .mmActionBtn:hover {
    background: #0984e3;
    color: #fff;
  }
  .mmEmpty {
    color: #777;
  }
}

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

/* ============ 二开：AI工具调用权限对话框 ============ */
.aiToolDialog {
  border-radius: 12px;
  overflow: hidden;

  .el-dialog__header {
    padding: 16px 20px;
    border-bottom: 1px solid #f0f0f0;
  }
  .el-dialog__body {
    padding: 16px 20px;
  }
}
.aiToolDialogDark {
  background-color: #262a2e;
  .el-dialog__header {
    border-bottom-color: hsla(0, 0%, 100%, 0.1);
    .el-dialog__title {
      color: #fff;
    }
  }
  .toolPermissionContent {
    .toolPermissionTitle {
      color: hsla(0, 0%, 100%, 0.85);
    }
    .toolPermissionNote {
      color: hsla(0, 0%, 100%, 0.4);
    }
    .toolCallItem {
      background-color: hsla(0, 0%, 100%, 0.05);
      .toolCallDesc {
        color: hsla(0, 0%, 100%, 0.75);
      }
      .toolCallIcon {
        color: #74b9ff;
      }
    }
  }
}
.toolPermissionContent {
  .toolPermissionTitle {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #3f4a54;
  }
  .toolCallList {
    margin-bottom: 12px;
  }
  .toolCallItem {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 6px;
    background-color: #f5f7fa;
    border-radius: 6px;
    font-size: 13px;
  }
  .toolCallIcon {
    font-size: 16px;
    color: #409eff;
    flex-shrink: 0;
  }
  .toolCallDesc {
    color: #3f4a54;
    flex: 1;
    min-width: 0;
    word-break: break-all;
  }
  .toolPermissionNote {
    font-size: 12px;
    color: #909399;
    line-height: 1.5;
    margin-top: 4px;
  }
}
.toolPermissionFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ============ 二开：工具执行中提示 ============ */
.toolExecutingHint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin-top: 8px;
  background-color: rgba(64, 158, 255, 0.08);
  border-radius: 6px;
  font-size: 13px;
  color: #409eff;
  animation: toolHintPulse 1.5s ease-in-out infinite;
}
@keyframes toolHintPulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

/* ============ 二开：智能内容导出按钮 ============ */
.contentExportBtn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #909399;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 4px;
  background-color: #f5f7fa;
  border: 1px solid #e4e7ed;
  transition: all 0.2s;
  user-select: none;
  margin-top: 6px;

  &:hover {
    color: #409eff;
    background-color: #ecf5ff;
    border-color: #c6e2ff;
  }

  .el-icon-download {
    font-size: 13px;
  }
}
/* 暗黑模式适配 */
.aiChatBox.isDark {
  .contentExportBtn {
    background-color: hsla(0, 0%, 100%, 0.05);
    border-color: hsla(0, 0%, 100%, 0.1);
    color: hsla(0, 0%, 100%, 0.5);

    &:hover {
      color: #66b1ff;
      background-color: hsla(0, 0%, 100%, 0.08);
      border-color: hsla(0, 0%, 100%, 0.2);
    }
  }
  .toolExecutingHint {
    background-color: rgba(102, 177, 255, 0.1);
    color: #74b9ff;
  }
}

/* ============ 二开：内容导出下拉菜单 ============ */
.contentExportMenu {
  .el-dropdown-menu__item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;

    [class^="el-icon-"] {
      font-size: 14px;
      color: #909399;
    }
    &:hover [class^="el-icon-"] {
      color: #409eff;
    }
  }
}

/* ============ 二开：引用节点预览区暗黑模式 ============ */
.aiChatBox.isDark {
  .nodeRefItem {
    background-color: hsla(0, 0%, 100%, 0.08);
    color: hsla(0, 0%, 100%, 0.6);

    .nodeRefIcon {
      color: hsla(0, 0%, 100%, 0.4);
    }
    .removeNodeRef {
      color: hsla(0, 0%, 100%, 0.4);
      &:hover {
        background-color: #f56c6c;
        color: #fff;
      }
    }
  }
}
</style>
