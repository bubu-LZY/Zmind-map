<template>
  <div
    class="editContainer"
    @dragenter.stop.prevent="onDragenter"
    @dragleave.stop.prevent="onDragleave"
    @dragover.stop.prevent
    @drop.stop.prevent="onDrop"
  >
    <div
      class="mindMapContainer"
      id="mindMapContainer"
      ref="mindMapContainer"
    ></div>
    <!-- 禅模式（演示模式）退出按钮 -->
    <div
      v-if="isZenMode"
      class="zenExitBtn"
      @click="exitZenMode"
      title="退出演示模式 (Esc)"
    >
      <span class="iconfont iconguanbi"></span> 退出演示模式
    </div>
    <Count :mindMap="mindMap" v-if="!isZenMode"></Count>
    <Navigator v-if="mindMap" :mindMap="mindMap"></Navigator>
    <NavigatorToolbar :mindMap="mindMap" v-if="!isZenMode"></NavigatorToolbar>
    <OutlineSidebar :mindMap="mindMap"></OutlineSidebar>
    <Style v-if="mindMap && !isZenMode" :mindMap="mindMap"></Style>
    <BaseStyle
      :data="mindMapData"
      :configData="mindMapConfig"
      :mindMap="mindMap"
    ></BaseStyle>
    <AssociativeLineStyle
      v-if="mindMap"
      :mindMap="mindMap"
    ></AssociativeLineStyle>
    <Theme v-if="mindMap" :data="mindMapData" :mindMap="mindMap"></Theme>
    <Structure :mindMap="mindMap"></Structure>
    <ShortcutKey></ShortcutKey>
    <Contextmenu v-if="mindMap" :mindMap="mindMap"></Contextmenu>
    <RichTextToolbar v-if="mindMap" :mindMap="mindMap"></RichTextToolbar>
    <NodeNoteContentShow
      v-if="mindMap"
      :mindMap="mindMap"
    ></NodeNoteContentShow>
    <NodeImgPreview v-if="mindMap" :mindMap="mindMap"></NodeImgPreview>
    <SidebarTrigger v-if="!isZenMode && !isReviewMode"></SidebarTrigger>
    <Search v-if="mindMap" :mindMap="mindMap"></Search>
    <NodeIconSidebar v-if="mindMap" :mindMap="mindMap"></NodeIconSidebar>
    <NodeIconToolbar v-if="mindMap" :mindMap="mindMap"></NodeIconToolbar>
    <OutlineEdit v-if="mindMap" :mindMap="mindMap"></OutlineEdit>
    <Scrollbar v-if="isShowScrollbar && mindMap" :mindMap="mindMap"></Scrollbar>
    <FormulaSidebar v-if="mindMap" :mindMap="mindMap"></FormulaSidebar>
    <NodeOuterFrame v-if="mindMap" :mindMap="mindMap"></NodeOuterFrame>
    <NodeTagStyle v-if="mindMap" :mindMap="mindMap"></NodeTagStyle>
    <Setting :configData="mindMapConfig" :mindMap="mindMap"></Setting>
    <NodeImgPlacementToolbar
      v-if="mindMap"
      :mindMap="mindMap"
    ></NodeImgPlacementToolbar>
    <NodeNoteSidebar v-if="mindMap" :mindMap="mindMap"></NodeNoteSidebar>
    <AiCreate v-if="mindMap && enableAi" :mindMap="mindMap"></AiCreate>
    <AiChat v-if="enableAi" :mindMap="mindMap"></AiChat>
    <ReviewMode v-if="mindMap" :mindMap="mindMap"></ReviewMode>
    <FileMentionPopup v-if="mindMap"></FileMentionPopup>
    <FilePreviewOverlay v-if="mindMap"></FilePreviewOverlay>
    <!-- 跳转后右上角"返回原文档"按钮 -->
    <div
      class="returnPrevDocBtn"
      v-if="navStack.length > 0"
      @click="returnToPreviousDoc"
      title="返回原文档"
    >
      <span class="el-icon-back"></span>
      <span class="returnText">返回原文档</span>
    </div>
    <div
      class="dragMask"
      v-if="showDragMask"
      @click="hideDragMask"
      @dragleave.stop.prevent="onDragleave"
      @dragover.stop.prevent
      @drop.stop.prevent="onDrop"
    >
      <div class="dragTip">{{ $t('edit.dragTip') }}</div>
    </div>
  </div>
</template>

<script>
import MindMap from 'simple-mind-map'
import MiniMap from 'simple-mind-map/src/plugins/MiniMap.js'
import Watermark from 'simple-mind-map/src/plugins/Watermark.js'
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js'
import ExportPDF from 'simple-mind-map/src/plugins/ExportPDF.js'
import ExportXMind from 'simple-mind-map/src/plugins/ExportXMind.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import RichText from 'simple-mind-map/src/plugins/RichText.js'
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js'
import TouchEvent from 'simple-mind-map/src/plugins/TouchEvent.js'
import NodeImgAdjust from 'simple-mind-map/src/plugins/NodeImgAdjust.js'
import SearchPlugin from 'simple-mind-map/src/plugins/Search.js'
import Painter from 'simple-mind-map/src/plugins/Painter.js'
import ScrollbarPlugin from 'simple-mind-map/src/plugins/Scrollbar.js'
import Formula from 'simple-mind-map/src/plugins/Formula.js'
import RainbowLines from 'simple-mind-map/src/plugins/RainbowLines.js'
import Demonstrate from 'simple-mind-map/src/plugins/Demonstrate.js'
import OuterFrame from 'simple-mind-map/src/plugins/OuterFrame.js'
import MindMapLayoutPro from 'simple-mind-map/src/plugins/MindMapLayoutPro.js'
import NodeBase64ImageStorage from 'simple-mind-map/src/plugins/NodeBase64ImageStorage.js'
import Themes from 'simple-mind-map-plugin-themes'
import { transformMarkdownTo } from 'simple-mind-map/src/parse/markdownTo'
import { createUid } from 'simple-mind-map/src/utils'
// 协同编辑插件
// import Cooperate from 'simple-mind-map/src/plugins/Cooperate.js'
import OutlineSidebar from './OutlineSidebar.vue'
import Style from './Style.vue'
import BaseStyle from './BaseStyle.vue'
import Theme from './Theme.vue'
import Structure from './Structure.vue'
import Count from './Count.vue'
import NavigatorToolbar from './NavigatorToolbar.vue'
import ShortcutKey from './ShortcutKey.vue'
import Contextmenu from './Contextmenu.vue'
import RichTextToolbar from './RichTextToolbar.vue'
import NodeNoteContentShow from './NodeNoteContentShow.vue'
import { getData, getConfig, storeData } from '@/api'
import Navigator from './Navigator.vue'
import NodeImgPreview from './NodeImgPreview.vue'
import SidebarTrigger from './SidebarTrigger.vue'
import { mapState } from 'vuex'
import icon from '@/config/icon'
import Vue from 'vue'
import Search from './Search.vue'
import NodeIconSidebar from './NodeIconSidebar.vue'
import NodeIconToolbar from './NodeIconToolbar.vue'
import OutlineEdit from './OutlineEdit.vue'
import { showLoading, hideLoading } from '@/utils/loading'
import handleClipboardText from '@/utils/handleClipboardText'
import {
  initCloze,
  destroyCloze,
  applyClozeStyles,
  toggleNodeCloze,
  toggleSelectionCloze,
  clozeWholeNode,
  resetClozeState,
  nodeHasCloze,
  applyClozeStateFromStorage
} from '@/utils/cloze'
import { initAiCloze } from '@/utils/aiCloze'
import { initAiRecite } from '@/utils/aiRecite'
import { addToReviewPlan, isInReviewPlan, removeFromReviewPlan, getReviewItemByNodeUid } from '@/utils/reviewPlan'
import { initReviewTriggerHandler, syncReviewConfigToMain } from '@/utils/reviewNotify'
import { getParentWithClass } from '@/utils'
import Scrollbar from './Scrollbar.vue'
import exampleData from 'simple-mind-map/example/exampleData'
import FormulaSidebar from './FormulaSidebar.vue'
import NodeOuterFrame from './NodeOuterFrame.vue'
import NodeTagStyle from './NodeTagStyle.vue'
import Setting from './Setting.vue'
import AssociativeLineStyle from './AssociativeLineStyle.vue'
import NodeImgPlacementToolbar from './NodeImgPlacementToolbar.vue'
import NodeNoteSidebar from './NodeNoteSidebar.vue'
import AiCreate from './AiCreate.vue'
import AiChat from './AiChat.vue'
import ReviewMode from './ReviewMode.vue'
import FileMentionPopup from './FileMentionPopup.vue'
import FilePreviewOverlay from './FilePreviewOverlay.vue'

// 注册插件
MindMap.usePlugin(MiniMap)
  .usePlugin(Watermark)
  .usePlugin(Drag)
  .usePlugin(KeyboardNavigation)
  .usePlugin(ExportPDF)
  .usePlugin(ExportXMind)
  .usePlugin(Export)
  .usePlugin(Select)
  .usePlugin(AssociativeLine)
  .usePlugin(NodeImgAdjust)
  .usePlugin(TouchEvent)
  .usePlugin(SearchPlugin)
  .usePlugin(Painter)
  .usePlugin(Formula)
  .usePlugin(RainbowLines)
  .usePlugin(Demonstrate)
  .usePlugin(OuterFrame)
  .usePlugin(MindMapLayoutPro)
  .usePlugin(NodeBase64ImageStorage)
// .usePlugin(Cooperate) // 协同插件

// 注册主题
Themes.init(MindMap)
// 扩展主题列表
if (typeof MoreThemes !== 'undefined') {
  MoreThemes.init(MindMap)
}

export default {
  components: {
    OutlineSidebar,
    Style,
    BaseStyle,
    Theme,
    Structure,
    Count,
    NavigatorToolbar,
    ShortcutKey,
    Contextmenu,
    RichTextToolbar,
    NodeNoteContentShow,
    Navigator,
    NodeImgPreview,
    SidebarTrigger,
    Search,
    NodeIconSidebar,
    NodeIconToolbar,
    OutlineEdit,
    Scrollbar,
    FormulaSidebar,
    NodeOuterFrame,
    NodeTagStyle,
    Setting,
    AssociativeLineStyle,
    NodeImgPlacementToolbar,
    NodeNoteSidebar,
    AiCreate,
    AiChat,
    ReviewMode,
    FileMentionPopup,
    FilePreviewOverlay
  },
  data() {
    return {
      enableShowLoading: true,
      mindMap: null,
      mindMapData: null,
      mindMapConfig: {},
      prevImg: '',
      storeConfigTimer: null,
      showDragMask: false,
      dragCounter: 0,
      // 跳转导航历史栈：记录跳转前的文件路径，用于"返回原文档"
      navStack: [],
      // 是否正在返回（返回时不压栈）
      isReturning: false,
      // 二开：AI对话思维导图生成 - 节点选择模式
      aiMindMapPickMode: '', // '' | 'insert' | 'replace'
      aiMindMapPendingData: null // AI 生成的思维导图树数据
    }
  },
  computed: {
    ...mapState({
      isZenMode: state => state.localConfig.isZenMode,
      isReviewMode: state => state.isReviewMode,
      openNodeRichText: state => state.localConfig.openNodeRichText,
      isShowScrollbar: state => state.localConfig.isShowScrollbar,
      enableDragImport: state => state.localConfig.enableDragImport,
      useLeftKeySelectionRightKeyDrag: state =>
        state.localConfig.useLeftKeySelectionRightKeyDrag,
      extraTextOnExport: state => state.extraTextOnExport,
      isDragOutlineTreeNode: state => state.isDragOutlineTreeNode,
      enableAi: state => state.localConfig.enableAi,
      enableLanServer: state => state.localConfig.enableLanServer,
      lanServerPort: state => state.localConfig.lanServerPort,
      reviewForgotTime: state => state.localConfig.reviewForgotTime,
      reviewReminderTime: state => state.localConfig.reviewReminderTime,
      reviewWebhookUrl: state => state.localConfig.reviewWebhookUrl,
      reviewBackupDir: state => state.localConfig.reviewBackupDir
    })
  },
  watch: {
    openNodeRichText() {
      if (this.openNodeRichText) {
        this.addRichTextPlugin()
      } else {
        this.removeRichTextPlugin()
      }
    },
    isShowScrollbar() {
      if (this.isShowScrollbar) {
        this.addScrollbarPlugin()
      } else {
        this.removeScrollbarPlugin()
      }
    },
    reviewForgotTime() { syncReviewConfigToMain(this.$store.state.localConfig) },
    reviewReminderTime() { syncReviewConfigToMain(this.$store.state.localConfig) },
    reviewWebhookUrl() { syncReviewConfigToMain(this.$store.state.localConfig) },
    reviewBackupDir() { syncReviewConfigToMain(this.$store.state.localConfig) }
  },
  mounted() {
    showLoading()
    this.getData()
    this.init()
    this.$nextTick(() => this.syncLanServer())
    this.$nextTick(() => this.syncLocalStorageToMain())
    // 监听网页端同步过来的数据
    if (window.zmindLan && window.zmindLan.onWebSync) {
      window.zmindLan.onWebSync(this.handleWebSync.bind(this))
    }
    this.$bus.$on('execCommand', this.execCommand)
    this.$bus.$on('paddingChange', this.onPaddingChange)
    this.$bus.$on('export', this.export)
    this.$bus.$on('setData', this.setData)
    this.$bus.$on('lanSyncUpdate', this.lanSyncUpdate)
    this.$bus.$on('startTextEdit', this.handleStartTextEdit)
    this.$bus.$on('endTextEdit', this.handleEndTextEdit)
    this.$bus.$on('createAssociativeLine', this.handleCreateLineFromActiveNode)
    this.$bus.$on('startPainter', this.handleStartPainter)
    this.$bus.$on('node_tree_render_end', this.handleHideLoading)
    this.$bus.$on('showLoading', this.handleShowLoading)
    this.$bus.$on('localStorageExceeded', this.onLocalStorageExceeded)
    this.$bus.$on('lanFileStateChanged', this.syncToLanDebounced)
    this.$bus.$on('clozeStateChanged', this.syncToLanDebounced)
    this.$bus.$on('lanClozeStateChanged', this.onLanClozeStateChanged)
    this.$bus.$on('collapseStateChanged', this.syncToLanDebounced)
    this.$bus.$on('lanCollapseStateChanged', this.onLanCollapseStateChanged)
    this.$bus.$on('save_collapse_state', this.saveCollapseState)
    this.$bus.$on('add_to_review_plan', this.handleAddToReviewPlan)
    this.$bus.$on('review_plan_updated', this.syncToLanDebounced)
    // 二开：复习模式点击节点跳转（统一由 Edit.vue 处理文件加载+高亮+导航栈）
    this.$bus.$on('zmind_review_navigate', this.handleReviewNavigate)
    // 二开：一键刷新视图
    this.$bus.$on('zmind_refresh_view', this.refreshView)
    // 二开：AI对话思维导图生成 - 插入/替换节点选择模式
    this.$bus.$on('zmind_ai_mindmap_pick', this.onAiMindMapPick)
    // 二开：@ 文件引用功能
    this.mindMap && this.mindMap.on('show_file_mention', this.handleShowFileMention)
    this.mindMap && this.mindMap.on('file_link_click', this.handleFileLinkClick)
    this.mindMap && this.mindMap.on('node_link_click', this.handleNodeLinkClick)
    this.$bus.$on('file_mention_open_file', this.handleFileMentionOpenFile)
    window.addEventListener('resize', this.handleResize)
    window.addEventListener('keydown', this.onZenEscKeydown)
    this.$bus.$on('showDownloadTip', this.showDownloadTip)
    this.webTip()
    // 监听系统托盘菜单动作
    if (window.zmindTray && window.zmindTray.onTrayAction) {
      window.zmindTray.onTrayAction(this.handleTrayAction.bind(this))
    }
  },
  beforeDestroy() {
    if (this._lanSyncTimer) {
      clearTimeout(this._lanSyncTimer)
    }
    if (this.clozeKeyHandler) {
      document.removeEventListener('keydown', this.clozeKeyHandler, true)
    }
    if (this.styleKeyHandler) {
      document.removeEventListener('keydown', this.styleKeyHandler, true)
      const rt = this.mindMap && this.mindMap.richText
      if (rt && rt.textEditNode) {
        rt.textEditNode.removeEventListener('keydown', this.styleKeyHandler, true)
      }
    }
    this.$bus.$off('execCommand', this.execCommand)
    this.$bus.$off('paddingChange', this.onPaddingChange)
    this.$bus.$off('export', this.export)
    this.$bus.$off('setData', this.setData)
    this.$bus.$off('lanSyncUpdate', this.lanSyncUpdate)
    this.$bus.$off('startTextEdit', this.handleStartTextEdit)
    this.$bus.$off('endTextEdit', this.handleEndTextEdit)
    this.$bus.$off('createAssociativeLine', this.handleCreateLineFromActiveNode)
    this.$bus.$off('startPainter', this.handleStartPainter)
    this.$bus.$off('node_tree_render_end', this.handleHideLoading)
    this.$bus.$off('showLoading', this.handleShowLoading)
    this.$bus.$off('localStorageExceeded', this.onLocalStorageExceeded)
    this.$bus.$off('lanFileStateChanged', this.syncToLanDebounced)
    this.$bus.$off('clozeStateChanged', this.syncToLanDebounced)
    this.$bus.$off('lanClozeStateChanged', this.onLanClozeStateChanged)
    this.$bus.$off('collapseStateChanged', this.syncToLanDebounced)
    this.$bus.$off('lanCollapseStateChanged', this.onLanCollapseStateChanged)
    this.$bus.$off('save_collapse_state', this.saveCollapseState)
    this.$bus.$off('add_to_review_plan', this.handleAddToReviewPlan)
    // 二开：取消复习导航监听
    this.$bus.$off('zmind_review_navigate', this.handleReviewNavigate)
    this.$bus.$off('zmind_refresh_view', this.refreshView)
    this.$bus.$off('zmind_ai_mindmap_pick', this.onAiMindMapPick)
    this.$bus.$off('review_plan_updated', this.syncToLanDebounced)
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('keydown', this.onZenEscKeydown)
    this.$bus.$off('showDownloadTip', this.showDownloadTip)
    // 二开补漏：解绑 resetClozeState（与 this.setData 是两个独立监听）+ 清理 storeConfigTimer
    this.$bus.$off('setData', resetClozeState)
    if (this.storeConfigTimer) { clearTimeout(this.storeConfigTimer); this.storeConfigTimer = null }
    // 二开：销毁挖空观察器，避免 MutationObserver 泄漏
    destroyCloze()
    this.mindMap.destroy()
  },
  methods: {
    onLocalStorageExceeded() {
      this.$notify({
        type: 'warning',
        title: this.$t('edit.tip'),
        message: this.$t('edit.localStorageExceededTip'),
        duration: 0
      })
    },

    // 处理系统托盘菜单动作
    handleTrayAction(data) {
      if (!data || !data.action) return
      switch (data.action) {
        case 'reviewMode':
          this.$bus.$emit('enter_review_mode')
          break
        case 'aiChat':
          this.$store.commit('setActiveSidebar', 'ai')
          break
        case 'copyUrlCopied':
          if (data.url) {
            this.$message.success('已复制网页端访问地址：' + data.url)
          }
          break
      }
    },

    handleStartTextEdit() {
      this.mindMap.renderer.startTextEdit()
    },

    handleEndTextEdit() {
      this.mindMap.renderer.endTextEdit()
    },

    handleCreateLineFromActiveNode() {
      this.mindMap.associativeLine.createLineFromActiveNode()
    },

    handleStartPainter() {
      this.mindMap.painter.startPainter()
    },

    handleResize() {
      this.mindMap.resize()
    },

    // 显示loading
    handleShowLoading() {
      this.enableShowLoading = true
      showLoading()
    },

    // 渲染结束后关闭loading
    handleHideLoading() {
      if (this.enableShowLoading) {
        this.enableShowLoading = false
        hideLoading()
      }
    },

    // 获取思维导图数据，实际应该调接口获取
    getData() {
      this.mindMapData = getData()
      this.mindMapConfig = getConfig() || {}
    },

    // 存储数据当数据有变时
    bindSaveEvent() {
      this.$bus.$on('data_change', data => {
        storeData({ root: data })
        this.syncToLanDebounced()
      })
      this.$bus.$on('view_data_change', data => {
        clearTimeout(this.storeConfigTimer)
        this.storeConfigTimer = setTimeout(() => {
          storeData({
            view: data
          })
          this.syncToLanDebounced()
        }, 300)
      })
    },

    // 手动保存
    manualSave() {
      const ok = storeData(this.mindMap.getData(true))
      this.syncToLanDebounced()
      return ok
    },

    // 拦截节点删除：检查是否在复习计划中
    interceptNodeDeletion() {
      if (!this.mindMap || !this.mindMap.renderer) return
      const renderer = this.mindMap.renderer
      const self = this

      const wrapRemover = (originalFn) => {
        const bound = originalFn.bind(renderer)
        return function(appointNodes = []) {
          const list = appointNodes.length > 0 ? appointNodes : renderer.activeNodeList
          const reviewNodes = list.filter(node => !node.isRoot && node.uid && isInReviewPlan(node.uid))
          if (reviewNodes.length > 0) {
            self.$confirm(
              '这条节点被加入复习计划中，是否确认删除？删除会同步删除后续的复习计划。',
              '提示',
              {
                confirmButtonText: '确认删除',
                cancelButtonText: '取消删除',
                type: 'warning'
              }
            ).then(() => {
              reviewNodes.forEach(node => {
                removeFromReviewPlan(node.uid)
              })
              self.$bus.$emit('review_plan_updated')
              bound(appointNodes)
            }).catch(() => {})
            return
          }
          bound(appointNodes)
        }
      }

      renderer.removeNode = wrapRemover(renderer.removeNode)
      renderer.removeCurrentNode = wrapRemover(renderer.removeCurrentNode)
    },

    // 二开：@ 文件引用 / # 节点引用 - 显示搜索弹窗
    handleShowFileMention(data) {
      this.$bus.$emit('show_file_mention_popup', {
        pos: { x: data.x, y: data.y },
        mode: data.mode || 'file',
        callback: (item) => {
          const rt = this.mindMap.richText
          if (!rt || !rt.insertFileLink) return
          if (data.mode === 'node') {
            // # 节点引用：显示 "文件名:节点文本"，链接为 zmind-node:filePath:nodeUid
            const displayText = item.fileName + ':' + item.name
            const linkUrl = 'zmind-node:' + item.filePath + ':' + item.nodeUid
            rt.insertFileLink(displayText, linkUrl, data.index)
          } else {
            // @ 文件引用
            rt.insertFileLink(item.name, 'zmind-file:' + item.path, data.index)
          }
        }
      })
    },

    // 二开：@ 文件引用 - 点击文件链接显示悬浮窗预览（不切换文档）
    handleFileLinkClick(payload) {
      // 兼容旧调用方式（直接传字符串）
      const filePath = typeof payload === 'string' ? payload : (payload && payload.filePath)
      const pos = typeof payload === 'object' && payload ? payload.pos : null
      this.$bus.$emit('show_file_preview', { filePath, nodeUid: '', pos })
    },

    // 二开：# 节点引用 - 点击节点链接显示悬浮窗预览并高亮节点
    handleNodeLinkClick(data) {
      this.$bus.$emit('show_file_preview', { filePath: data.filePath, nodeUid: data.nodeUid, pos: data.pos })
    },

    // 二开：@ 文件引用 - 点击"去编辑"打开文件（复用 loadAndHighlightFile，自动压入导航栈，右上角出现返回按钮）
    handleFileMentionOpenFile(filePath) {
      this.$bus.$emit('hide_file_preview')
      this.loadAndHighlightFile(filePath, null)
    },

    // 二开：在主窗口加载引用的文件（并可选高亮节点），替代弹窗预览（弹窗新建 MindMap 实例不可靠）
    // 返回 true 表示加载成功，false 表示失败
    async loadAndHighlightFile(filePath, nodeUid) {
      if (!filePath) return false
      const fs = window.zmindFs
      if (!fs) {
        this.$message.warning('文件系统不可用')
        return false
      }
      // 记录跳转前的文件路径（仅在加载成功时压栈，避免失败重试导致重复压栈）
      const prevPath = this.$store.state.currentFilePath || ''
      try {
        const content = await fs.readFile(filePath)
        let data
        if (/\.md$/i.test(filePath)) {
          const markdown = await import('simple-mind-map/src/parse/markdown.js')
          const list = markdown.default.transformMarkdownToList(content)
          if (!list || list.length === 0) throw new Error('empty')
          data = list.length === 1 ? list[0] : { data: { text: '导入' }, children: list }
        } else {
          data = JSON.parse(content)
          if (!data.root) data = { root: data }
        }
        // 文件加载成功，压入导航栈（返回时不压栈）
        if (!this.isReturning && prevPath && prevPath !== filePath) {
          this.navStack.push(prevPath)
        }
        this.$bus.$emit('setData', data)
        this.$store.commit('setCurrentFilePath', filePath)
        // 通知大纲组件文件已加载，需重新展开所有树节点（el-tree default-expand-all 不会在数据变更时重新生效）
        this.$bus.$emit('zmind_file_loaded')
        if (nodeUid) {
          // 用 expandToNodeUid 展开父节点，回调中高亮（比固定 setTimeout 稳定）
          const doHighlight = () => {
            if (this.mindMap && this.mindMap.renderer && this.mindMap.renderer.expandToNodeUid) {
              this.mindMap.renderer.expandToNodeUid(nodeUid, () => {
                setTimeout(() => this.highlightReferencedNode(nodeUid), 200)
              })
            } else {
              setTimeout(() => this.highlightReferencedNode(nodeUid), 300)
            }
          }
          const onRender = () => {
            this.mindMap.off('node_tree_render_end', onRender)
            clearTimeout(fallback)
            doHighlight()
          }
          const fallback = setTimeout(() => {
            this.mindMap.off('node_tree_render_end', onRender)
            doHighlight()
          }, 2000)
          this.mindMap.on('node_tree_render_end', onRender)
        }
        return true
      } catch (e) {
        console.error(e)
        return false
      }
    },

    // 二开：返回上一个文档（从导航栈弹出）
    returnToPreviousDoc() {
      if (this.navStack.length === 0) return
      const prevPath = this.navStack.pop()
      this.isReturning = true
      this.loadAndHighlightFile(prevPath, null).then(() => {
        this.isReturning = false
      }).catch(() => {
        this.isReturning = false
      })
    },

    // 二开：复习模式点击节点 → 加载对应文档并高亮节点
    // 优先使用备份文件（确保 uid 一致），备份不存在时回退原文件
    async handleReviewNavigate(item) {
      const backupPath = item.backupFilePath || ''
      const originalPath = item.filePath || ''
      const nodeUid = item.nodeUid || ''
      const currentPath = this.$store.state.currentFilePath || ''
      // 判断目标文件是否为当前文件（优先比较原文件路径，保证看到最新内容）
      const targetPath = originalPath || backupPath
      if (!targetPath || targetPath === currentPath) {
        // 同文件，直接高亮
        this.highlightReferencedNode(nodeUid)
        return
      }
      // 跨文件，优先加载原文件（最新内容），失败再回退到备份文件
      if (originalPath) {
        const ok = await this.loadAndHighlightFile(originalPath, nodeUid)
        if (ok) return
        // 原文件不存在或加载失败，回退到备份文件
        this.$message.info('原文件不可用，尝试打开备份文件')
      }
      if (backupPath) {
        const ok = await this.loadAndHighlightFile(backupPath, nodeUid)
        if (!ok) {
          this.$message.error('无法加载复习文件，文件可能已被移动或删除')
        }
      } else {
        this.$message.warning('未找到对应文件')
      }
    },

    // 二开：高亮引用的节点（激活节点显示蓝框）
    // 简化流程：expandToNodeUid 展开父节点 → 回调中 findNode + moveNodeToCenter + doHighlightNode
    highlightReferencedNode(nodeUid) {
      if (!this.mindMap || !this.mindMap.renderer) return
      const findNode = (node, uid) => {
        if (!node) return null
        if (node.uid === uid) return node
        try { if (node.getData && node.getData('uid') === uid) return node } catch (e) {}
        if (node.children) {
          for (const child of node.children) {
            const found = findNode(child, uid)
            if (found) return found
          }
        }
        return null
      }
      const doHighlightNow = () => {
        const target = findNode(this.mindMap.renderer.root, nodeUid)
        if (!target) {
          console.log('[复习高亮] doHighlightNow: 未找到节点', nodeUid)
          this.$message.warning('未找到对应节点')
          return
        }
        console.log('[复习高亮] doHighlightNow: 找到节点，开始 moveNodeToCenter')
        try {
          this.mindMap.renderer.moveNodeToCenter(target)
        } catch (e) {
          console.log('[复习高亮] moveNodeToCenter 失败:', e)
        }
        // moveNodeToCenter 触发重渲染后激活节点
        const onRendered = () => {
          this.mindMap.off('node_tree_render_end', onRendered)
          clearTimeout(renderFallback)
          console.log('[复习高亮] node_tree_render_end 触发，调用 doHighlightNode')
          this.doHighlightNode(target, nodeUid)
        }
        const renderFallback = setTimeout(() => {
          this.mindMap.off('node_tree_render_end', onRendered)
          console.log('[复习高亮] 500ms fallback 触发，调用 doHighlightNode')
          this.doHighlightNode(target, nodeUid)
        }, 500)
        this.mindMap.on('node_tree_render_end', onRendered)
      }
      // 用库内置 expandToNodeUid 展开父节点链，回调中高亮
      if (this.mindMap.renderer.expandToNodeUid) {
        this.mindMap.renderer.expandToNodeUid(nodeUid, () => {
          setTimeout(doHighlightNow, 200)
        })
      } else {
        // 兜底：手动展开
        let node = findNode(this.mindMap.renderer.root, nodeUid)
        if (!node) {
          this.$message.warning('未找到对应节点')
          return
        }
        let parent = node.parent
        while (parent) {
          if (!parent.getData('expand')) parent.setData({ expand: true })
          parent = parent.parent
        }
        setTimeout(doHighlightNow, 300)
      }
    },

    // 高亮节点：通过 DOM 坐标在节点位置显示红色边框闪烁
    // 二开：非终末级节点（有子节点）时，红框框住该节点及其所有子节点的整体范围
    // node.group 是 SVG.js 对象，真实 DOM 元素是 node.group.node
    doHighlightNode(node, nodeUid) {
      if (!this.mindMap || !this.mindMap.renderer) return
      // 清除上一个高亮定时器
      if (this._refHighlightTimer) { clearTimeout(this._refHighlightTimer); this._refHighlightTimer = null }
      if (this._refBlinkTimer) { clearInterval(this._refBlinkTimer); this._refBlinkTimer = null }
      if (this._refHighlightBox && this._refHighlightBox.parentNode) {
        this._refHighlightBox.parentNode.removeChild(this._refHighlightBox)
        this._refHighlightBox = null
      }
      // 通过 uid 重新查找节点的辅助函数
      const findNodeByUid = (rootNode, uid) => {
        if (!rootNode || !uid) return null
        if (rootNode.uid === uid) return rootNode
        try { if (rootNode.getData && rootNode.getData('uid') === uid) return rootNode } catch (e) {}
        if (rootNode.children) {
          for (const child of rootNode.children) {
            const found = findNodeByUid(child, uid)
            if (found) return found
          }
        }
        return null
      }
      // 获取 fresh 节点（重渲染后旧引用可能失效）
      let activeNode = node
      if (nodeUid && this.mindMap.renderer.root) {
        const fresh = findNodeByUid(this.mindMap.renderer.root, nodeUid)
        if (fresh) {
          activeNode = fresh
        }
      }
      if (!activeNode) {
        console.log('[复习高亮] 未找到节点，nodeUid=', nodeUid)
        return
      }

      // 收集目标节点及其所有子节点的 DOM 元素
      const collectNodeEls = (n, els) => {
        if (n.group) {
          const domEl = n.group.node || n.group
          if (domEl && typeof domEl.getBoundingClientRect === 'function') {
            els.push(domEl)
          }
        }
        if (n.children && n.children.length > 0) {
          n.children.forEach(child => collectNodeEls(child, els))
        }
      }
      const nodeEls = []
      collectNodeEls(activeNode, nodeEls)

      // 计算所有节点的整体边界框
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      let hasValidRect = false
      nodeEls.forEach(el => {
        try {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) {
            minX = Math.min(minX, r.left)
            minY = Math.min(minY, r.top)
            maxX = Math.max(maxX, r.right)
            maxY = Math.max(maxY, r.bottom)
            hasValidRect = true
          }
        } catch (e) {}
      })

      let rect = null
      if (hasValidRect) {
        rect = { left: minX, top: minY, width: maxX - minX, height: maxY - minY }
      }

      // 如果获取不到坐标或坐标为0，尝试用 mindMap 容器中心位置
      if (!rect || rect.width === 0 || rect.height === 0) {
        console.log('[复习高亮] 节点坐标为空或0，使用容器中心兜底')
        try {
          const container = this.mindMap.el
          if (container) {
            const containerRect = container.getBoundingClientRect()
            rect = {
              left: containerRect.left + containerRect.width / 2 - 100,
              top: containerRect.top + containerRect.height / 2 - 30,
              width: 200, height: 60
            }
          }
        } catch (e) {}
      }

      // 最终兜底：屏幕中心
      if (!rect) {
        rect = {
          left: window.innerWidth / 2 - 100,
          top: window.innerHeight / 2 - 30,
          width: 200, height: 60
        }
      }

      console.log('[复习高亮] 创建红框（含子节点）:', rect.left, rect.top, rect.width, rect.height, '节点数:', nodeEls.length)
      // 创建红色边框闪烁层（覆盖在节点及其子节点的整体范围上）
      const box = document.createElement('div')
      box.style.cssText = 'position:fixed;left:' + (rect.left - 6) + 'px;top:' + (rect.top - 6) + 'px;width:' + (rect.width + 12) + 'px;height:' + (rect.height + 12) + 'px;border:3px solid #e74c3c;border-radius:8px;pointer-events:none;z-index:99999;box-shadow:0 0 15px rgba(231,76,60,0.5);opacity:1;'
      document.body.appendChild(box)
      this._refHighlightBox = box

      // 红色边框闪烁：透明度在 1 和 0.2 之间切换（闪 4 次，总时长约 2 秒）
      let count = 0
      this._refBlinkTimer = setInterval(() => {
        count++
        box.style.opacity = count % 2 === 0 ? '1' : '0.2'
        if (count >= 8) {
          clearInterval(this._refBlinkTimer)
          this._refBlinkTimer = null
          this._refHighlightTimer = setTimeout(() => {
            if (this._refHighlightBox && this._refHighlightBox.parentNode) {
              this._refHighlightBox.parentNode.removeChild(this._refHighlightBox)
              this._refHighlightBox = null
            }
          }, 200)
        }
      }, 200)
    },

    // 处理添加到复习计划
    // 二开：非终末级节点只添加本身，不递归添加子节点
    async handleAddToReviewPlan(nodes) {
      if (!nodes || nodes.length === 0) return
      const filePath = this.$store.state.currentFilePath || ''
      const fileName = filePath ? filePath.split(/[\\/]/).pop() : ''
      let added = 0
      let skipped = 0

      // 只收集用户选中的节点本身，不再递归子节点
      const allNodes = []
      const seenUids = new Set()
      nodes.forEach(node => {
        const uid = node.uid || node.getData('uid') || ''
        if (uid && !seenUids.has(uid)) {
          seenUids.add(uid)
          allNodes.push(node)
        }
      })

      // 先过滤出真正需要添加的节点
      const toAdd = allNodes.filter(node => {
        if (node.isRoot) {
          skipped++
          return false
        }
        const uid = node.uid || node.getData('uid') || ''
        if (isInReviewPlan(uid)) {
          skipped++
          return false
        }
        return true
      })

      if (toAdd.length === 0) {
        if (skipped > 0) this.$message.info('该节点已在复习计划中')
        return
      }

      // 备份当前文档到固定文件夹（确保跨文件复习时能找到对应节点）
      let backupFilePath = ''
      let backupFileName = ''
      try {
        const fsApi = window.zmindFs
        const zmindReview = window.zmindReview
        if (fsApi && zmindReview && zmindReview.getAppDataPath && filePath) {
          // 1. 先保存当前文件（确保 uid 已持久化到磁盘）
          const saveData = getData()
          await fsApi.writeFile(filePath, JSON.stringify(saveData))
          // 2. 获取备份目录
          const appDataPath = await zmindReview.getAppDataPath()
          const backupDir = appDataPath.replace(/[\\/]+$/, '') + '/review-backups'
          // 3. 复制到备份目录（backupFile 内部会 recursive mkdir 创建目录）
          const result = await zmindReview.backupFile(filePath, backupDir)
          if (result && result.success && result.path) {
            // 4. 重命名为唯一文件名，避免同一文件多次添加时覆盖旧备份
            const ts = Date.now()
            const extMatch = filePath.match(/(\.(smm|json|md))$/i)
            const ext = extMatch ? extMatch[1] : '.smm'
            const base = filePath.split(/[\\/]/).pop().replace(/\.(smm|json|md)$/i, '')
            const uniqueName = 'review_' + ts + '_' + base + ext
            const uniquePathStr = backupDir.replace(/[\\/]+$/, '') + '/' + uniqueName
            try {
              await fsApi.rename(result.path, uniquePathStr)
              backupFilePath = uniquePathStr
              backupFileName = uniqueName
            } catch (e) {
              // 重命名失败：重试一次带随机后缀的唯一名；仍失败则放弃备份
              // （复习跳转时会回退到原文件，uid 仍可匹配，避免同名覆盖导致 uid 错位）
              const rand = Math.random().toString(36).slice(2, 8)
              const uniqueName2 = 'review_' + ts + '_' + rand + '_' + base + ext
              const uniquePathStr2 = backupDir.replace(/[\\/]+$/, '') + '/' + uniqueName2
              try {
                await fsApi.rename(result.path, uniquePathStr2)
                backupFilePath = uniquePathStr2
                backupFileName = uniqueName2
              } catch (e2) {
                console.error('备份重命名失败，放弃备份', e2)
                backupFilePath = ''
                backupFileName = ''
              }
            }
          }
        }
      } catch (e) {
        console.error('备份复习文件失败', e)
      }

      toAdd.forEach(node => {
        const uid = node.uid || node.getData('uid') || ''
        const nodeText = node.getData('text') || ''
        const parentText = node.parent ? (node.parent.getData('text') || '') : ''
        addToReviewPlan({
          nodeUid: uid,
          nodeText,
          parentText,
          filePath,
          fileName,
          backupFilePath,
          backupFileName
        })
        added++
      })
      if (added > 0) {
        this.$message.success(`已添加 ${added} 个节点到复习计划`)
        this.$bus.$emit('review_plan_updated')
      } else if (skipped > 0) {
        this.$message.info('该节点已在复习计划中')
      }
    },

    // 给当前激活的节点设置样式（用于幕布对齐的文字颜色/高亮快捷键）
    // 编辑态下选中文字时用 quill 格式化选区；非编辑态时设置节点级样式
    setActiveNodesStyle(prop, value) {
      const rt = this.mindMap.richText
      // 编辑态：用 quill 格式化当前选区
      if (rt && rt.showTextEdit && rt.quill) {
        const quill = rt.quill
        let range = quill.getSelection(true)
        if (!range || range.length === 0) range = rt.range || null
        if (range && range.length > 0) {
          // 节点级 prop → quill 格式映射
          const quillFormat = prop === 'fillColor' ? 'background' : prop
          quill.formatText(range.index, range.length, quillFormat, value, 'user')
          quill.setSelection(range.index, range.length, 'user')
          return
        }
        return
      }
      // 非编辑态：设置节点级样式
      const list = this.mindMap.renderer.activeNodeList
      if (!list || list.length === 0) return
      list.forEach(node => {
        node.setStyle(prop, value)
      })
    },

    // 注册与幕布对齐的快捷键
    registerMubuShortcuts() {
      const kc = this.mindMap.keyCommand
      // 截屏/导出图片：Ctrl+Shift+A
      kc.addShortcut('Control+Shift+a', () => {
        this.$bus.$emit('showExport')
      })
      // 打开快捷键帮助：Ctrl+/
      kc.addShortcut('Control+/', () => {
        this.$store.commit('setActiveSidebar', 'shortcutKey')
      })
      // 嵌入链接：Ctrl+K
      kc.addShortcut('Control+k', () => {
        if (this.mindMap.renderer.activeNodeList.length > 0) {
          this.$bus.$emit('showNodeLink')
        }
      })
      // 进入演示模式：Ctrl+Alt+Shift+P
      kc.addShortcut('Control+Alt+Shift+p', () => {
        this.$bus.$emit('enter_demonstrate')
      })
      // 查看大纲：Ctrl+Alt+Shift+M
      kc.addShortcut('Control+Alt+Shift+m', () => {
        this.$store.commit('setActiveSidebar', 'outline')
      })
      // 注意：字体颜色(Alt+key)和高亮(Ctrl+Alt+key)快捷键不再通过 keyCommand 注册，
      // 因为 keyCommand.defaultEnableCheck 要求 e.target 直接拥有 editNodeClassList 中的类名，
      // 但编辑态下 keydown 的 target 通常是 <p>/<span>/文本节点，不是 .ql-editor 容器，
     // 导致检查失败、快捷键被静默忽略。已迁移到 styleKeyHandler（capture 阶段独立监听）。
    },

    // 编辑态样式快捷键（字体颜色 + 高亮背景）
    // 使用 capture 阶段监听，绕过 keyCommand.defaultEnableCheck 的目标元素限制
    // 编辑态：用 quill.formatText 格式化选区；非编辑态：设置节点级样式
    registerStyleShortcutHandler() {
      const fontColors = {
        d: '',       // 默认（清除颜色）
        r: '#ff4d4f', // 红色
        y: '#faad14', // 黄色
        g: '#52c41a', // 绿色
        b: '#1890ff', // 蓝色
        p: '#722ed1'  // 紫色
      }
      const highlightColors = {
        y: '#ffec3d', // 黄色
        r: '#ffa39e', // 红色
        h: '#bfbfbf', // 灰色
        g: '#b7eb8f', // 绿色
        b: '#91d5ff', // 蓝色
        p: '#ffadd2', // 粉色
        c: '#87e8de'  // 青色
      }
      // keyCode 备用映射（e.key 在某些 IME/键盘布局下可能不可靠）
      const fontKeyCodeMap = { 68: 'd', 82: 'r', 89: 'y', 71: 'g', 66: 'b', 80: 'p' }
      const hlKeyCodeMap = { 89: 'y', 82: 'r', 72: 'h', 71: 'g', 66: 'b', 80: 'p', 67: 'c' }

      // 核心处理函数：尝试对当前选区应用格式
      const applyFormat = (formatName, value) => {
        const rt = this.mindMap.richText
        if (!rt || !rt.quill) return false
        const quill = rt.quill
        // 多种方式获取选区
        let range = quill.getSelection(true)
        if (!range || range.length === 0) range = rt.range || null
        if (!range || range.length === 0) return false
        quill.formatText(range.index, range.length, formatName, value, 'user')
        quill.setSelection(range.index, range.length, 'user')
        return true
      }

      this.styleKeyHandler = e => {
        const rt = this.mindMap.richText
        const isEditing = rt && rt.showTextEdit && rt.quill

        // Alt + D/R/Y/G/B/P → 字体颜色
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          // 同时支持 e.key 和 e.keyCode 两种匹配方式
          const key = e.key.toLowerCase()
          const keyCodeKey = fontKeyCodeMap[e.keyCode]
          const matchKey = fontColors.hasOwnProperty(key) ? key : (keyCodeKey && fontColors.hasOwnProperty(keyCodeKey) ? keyCodeKey : null)
          if (matchKey) {
            e.preventDefault()
            e.stopPropagation()
            if (isEditing) {
              applyFormat('color', fontColors[matchKey])
            } else {
              this.setActiveNodesStyle('color', fontColors[matchKey])
            }
            return
          }
        }
        // Ctrl+Alt + Y/R/H/G/B/P/C → 高亮背景
        if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey) {
          const key = e.key.toLowerCase()
          const keyCodeKey = hlKeyCodeMap[e.keyCode]
          const matchKey = highlightColors.hasOwnProperty(key) ? key : (keyCodeKey && highlightColors.hasOwnProperty(keyCodeKey) ? keyCodeKey : null)
          if (matchKey) {
            e.preventDefault()
            e.stopPropagation()
            if (isEditing) {
              applyFormat('background', highlightColors[matchKey])
            } else {
              this.setActiveNodesStyle('fillColor', highlightColors[matchKey])
            }
            return
          }
        }
      }
      // 第一层：document capture 阶段（最先触发）
      document.addEventListener('keydown', this.styleKeyHandler, true)

      // 第二层：进入编辑态时在编辑框元素上也绑定（事件驱动，确保不被 quill 内部拦截）
      // richText 在 before_show_text_edit 事件后才创建 textEditNode，故在 nextTick 里绑定
      this._styleKeyHandlerOnEditor = null
      this._bindStyleKeyToEditor = () => {
        this.$nextTick(() => {
          const rt = this.mindMap && this.mindMap.richText
          if (rt && rt.textEditNode) {
            // addEventListener 同一函数+capture 幂等，重复绑定无副作用
            rt.textEditNode.addEventListener('keydown', this.styleKeyHandler, true)
            this._styleKeyHandlerOnEditor = true
          }
        })
      }
      this.mindMap.on('before_show_text_edit', this._bindStyleKeyToEditor)
    },

    // 初始化挖空功能（二开功能）
    initClozeFeature() {
      initCloze(this.mindMap)
      initAiCloze(this.mindMap)
      initAiRecite(this.mindMap)
      // 渲染完成后应用挖空显示/隐藏样式
      this.mindMap.on('node_tree_render_end', applyClozeStyles)
      // 点击包含挖空内容的节点时切换显示/隐藏
      this.mindMap.on('node_click', node => {
        // AI 思维导图插入/替换选择模式下不触发挖空切换
        if (this._aiMindMapPicking) return
        if (nodeHasCloze(node)) {
          toggleNodeCloze(node)
        }
      })
      // 文本编辑中 Ctrl+Enter 切换选区挖空；非编辑态 Ctrl+Enter 全节点挖空
      // 编辑态：用 quill 内建 code 格式包裹选区（即时生效）；
      // 非编辑态：把当前选中节点的全部文字包裹在 smm-cloze span 中（toggle 语义）。
      // 退出编辑时 RichText.hideEditText 的 clozeEncode 把 <code> 转为 <span class="smm-cloze"> 落盘。
      this.clozeKeyHandler = e => {
        if (
          (e.ctrlKey || e.metaKey) &&
          (e.key === 'Enter' || e.keyCode === 13) &&
          !e.shiftKey &&
          !e.altKey
        ) {
          const rt = this.mindMap.richText
          const isEditing = rt && rt.showTextEdit && rt.textEditNode && rt.textEditNode.style.display !== 'none'

          if (isEditing) {
            // ===== 编辑态：选区挖空 =====
            e.preventDefault()
            e.stopPropagation()
            const quill = rt.quill
            let selRange = quill && quill.getSelection(true)
            if (!selRange || selRange.length === 0) selRange = rt.range || null
            if (!selRange || selRange.length === 0) {
              this.$notify({
                title: '挖空',
                message: '请先选中要挖空的文字，再按 Ctrl+Enter',
                type: 'warning',
                duration: 3000
              })
              return
            }
            const result = toggleSelectionCloze()
            if (result === 'added') {
              this.$notify({ title: '挖空', message: '已标记挖空', type: 'success', duration: 2000 })
            } else if (result === 'removed') {
              this.$notify({ title: '挖空', message: '已取消挖空', type: 'success', duration: 2000 })
            }
          } else {
            // ===== 非编辑态：全节点挖空（拦截原 Control+Enter 居中根节点行为）=====
            e.preventDefault()
            e.stopPropagation()
            const result = clozeWholeNode()
            if (result === 'added') {
              this.$notify({ title: '挖空', message: '已将整节点内容标记为挖空', type: 'success', duration: 2000 })
            } else if (result === 'removed') {
              this.$notify({ title: '挖空', message: '已取消该节点的全部挖空', type: 'success', duration: 2000 })
            } else if (result === 'mixed') {
              this.$notify({ title: '挖空', message: '已处理选中的多个节点（部分挖空、部分取消）', type: 'success', duration: 2000 })
            } else {
              // 无活跃节点或根节点 → 不做任何事（也不居中根节点）
            }
          }
        }
      }
      document.addEventListener('keydown', this.clozeKeyHandler, true)
      // 挖空由 quill code 格式即时承载，RichText.hideEditText 保存时 clozeEncode 转 span
      // 加载新数据时重置挖空状态
      this.$bus.$on('setData', resetClozeState)
    },

    // 退出禅模式（演示模式）
    exitZenMode() {
      this.$store.commit('setLocalConfig', { isZenMode: false })
      // 退出全屏
      if (document.fullscreenElement) {
        document.exitFullscreen && document.exitFullscreen()
      }
    },

    // 禅模式下按 Esc 退出
    onZenEscKeydown(e) {
      if (this.isZenMode && e.keyCode === 27) {
        this.exitZenMode()
      }
    },

    // 保存节点折叠状态到 localStorage
    saveCollapseState() {
      if (!this.mindMap || !this.mindMap.renderer) return
      const state = {}
      const walk = node => {
        if (!node) return
        const isExpand = node.getData('expand') !== false
        if (!isExpand) {
          state[node.uid] = false
        }
        ;(node.children || []).forEach(walk)
      }
      walk(this.mindMap.renderer.root)
      try {
        localStorage.setItem('SIMPLE_MIND_MAP_COLLAPSE_STATE', JSON.stringify(state))
        this.$bus.$emit('collapseStateChanged')
      } catch (e) {}
    },

    // 从 localStorage 恢复节点折叠状态
    restoreCollapseState() {
      if (!this.mindMap || !this.mindMap.renderer) return
      try {
        const raw = localStorage.getItem('SIMPLE_MIND_MAP_COLLAPSE_STATE')
        if (!raw) return
        const state = JSON.parse(raw)
        const walk = node => {
          if (!node) return
          if (state[node.uid] === false) {
            node.setData({ expand: false })
          }
          ;(node.children || []).forEach(walk)
        }
        walk(this.mindMap.renderer.root)
      } catch (e) {}
    },

    // 初始化
    init() {
      let hasFileURL = this.hasFileURL()
      let { root, layout, theme, view } = this.mindMapData
      const config = this.mindMapConfig
      // 如果url中存在要打开的文件，那么思维导图数据、主题、布局都使用默认的
      if (hasFileURL) {
        root = {
          data: {
            text: this.$t('edit.root')
          },
          children: []
        }
        layout = exampleData.layout
        theme = exampleData.theme
        view = null
      }
      this.mindMap = new MindMap({
        el: this.$refs.mindMapContainer,
        data: root,
        fit: false,
        layout: layout,
        theme: theme.template,
        themeConfig: theme.config,
        viewData: view,
        nodeTextEditZIndex: 1000,
        nodeNoteTooltipZIndex: 1000,
        customNoteContentShow: {
          show: (content, left, top, node) => {
            this.$bus.$emit('showNoteContent', content, left, top, node)
          },
          hide: () => {
            // this.$bus.$emit('hideNoteContent')
          }
        },
        openRealtimeRenderOnNodeTextEdit: true,
        enableAutoEnterTextEditWhenKeydown: true,
        demonstrateConfig: {
          openBlankMode: false
        },
        ...(config || {}),
        createNewNodeBehavior: 'default',
        iconList: [...icon],
        useLeftKeySelectionRightKeyDrag: this.useLeftKeySelectionRightKeyDrag,
        customInnerElsAppendTo: null,
        customHandleClipboardText: handleClipboardText,
        defaultNodeImage: require('../../../assets/img/图片加载失败.svg'),
        initRootNodePosition: ['center', 'center'],
        handleIsSplitByWrapOnPasteCreateNewNode: () => {
          return this.$confirm(
            this.$t('edit.splitByWrap'),
            this.$t('edit.tip'),
            {
              confirmButtonText: this.$t('edit.yes'),
              cancelButtonText: this.$t('edit.no'),
              type: 'warning'
            }
          )
        },
        errorHandler: (code, err) => {
          console.error(err)
          switch (code) {
            case 'export_error':
              this.$message.error(this.$t('edit.exportError'))
              break
            default:
              break
          }
        },
        addContentToFooter: () => {
          const text = this.extraTextOnExport.trim()
          if (!text) return null
          const el = document.createElement('div')
          el.className = 'footer'
          el.innerHTML = text
          const cssText = `
            .footer {
              width: 100%;
              height: 30px;
              display: flex;
              justify-content: center;
              align-items: center;
              font-size: 12px;
              color: #979797;
            }
          `
          return {
            el,
            cssText,
            height: 30
          }
        },
        expandBtnNumHandler: num => {
          return num >= 100 ? '…' : num
        },
        beforeDeleteNodeImg: node => {
          return new Promise(resolve => {
            this.$confirm(
              this.$t('edit.deleteNodeImgTip'),
              this.$t('edit.tip'),
              {
                confirmButtonText: this.$t('edit.yes'),
                cancelButtonText: this.$t('edit.no'),
                type: 'warning'
              }
            )
              .then(() => {
                resolve(false)
              })
              .catch(() => {
                resolve(true)
              })
          })
        }
      })
      this.loadPlugins()
      // 二开：AI对话思维导图生成 - 节点选择模式（需早于挖空监听注册，先执行）
      this.mindMap.on('node_click', node => {
        if (this.aiMindMapPickMode) {
          this._aiMindMapPicking = true
          const mode = this.aiMindMapPickMode
          this.aiMindMapPickMode = ''
          this.removePickNodeCursor()
          this.applyAiMindMapToNode(node, mode)
          setTimeout(() => { this._aiMindMapPicking = false }, 300)
        }
      })
      this.mindMap.keyCommand.addShortcut('Control+s', () => {
        const ok = this.manualSave()
        if (ok) {
          this.$message.success('保存成功')
        } else {
          this.$message.error('保存失败，请重试')
        }
      })
      this.registerMubuShortcuts()
      this.registerStyleShortcutHandler()
      this.initClozeFeature()
      // 初始化节点折叠状态记忆
      this._collapseRestoreTimer = null
      this.mindMap.on('node_tree_render_end', () => {
        if (this._collapseRestoreTimer) clearTimeout(this._collapseRestoreTimer)
        this._collapseRestoreTimer = setTimeout(() => {
          this.restoreCollapseState()
        }, 200)
      })
      this.mindMap.on('expand_btn_click', () => {
        this.$bus.$emit('save_collapse_state')
      })
      // 转发事件
      ;[
        'node_active',
        'data_change',
        'view_data_change',
        'back_forward',
        'node_contextmenu',
        'node_click',
        'draw_click',
        'expand_btn_click',
        'svg_mousedown',
        'mouseup',
        'mode_change',
        'node_tree_render_end',
        'rich_text_selection_change',
        'transforming-dom-to-images',
        'generalization_node_contextmenu',
        'painter_start',
        'painter_end',
        'scrollbar_change',
        'scale',
        'translate',
        'node_attachmentClick',
        'node_attachmentContextmenu',
        'demonstrate_jump',
        'exit_demonstrate',
        'node_note_dblclick',
        'node_mousedown'
      ].forEach(event => {
        this.mindMap.on(event, (...args) => {
          this.$bus.$emit(event, ...args)
        })
      })
      this.bindSaveEvent()
      // 二开：Ctrl+C 复制纯文本
      // renderer.copy() 会先执行（设置内部剪贴板 + 系统剪贴板 HTML），此处覆盖系统剪贴板为纯文本
      // 内部剪贴板（beingCopyData）不受影响，Ctrl+V 粘贴节点仍正常
      this.mindMap.keyCommand.addShortcut('Control+c', () => {
        const activeNodes = this.mindMap.renderer.activeNodeList || []
        if (activeNodes.length === 0) return
        const text = activeNodes
          .map(n => {
            const raw = n.getData('text') || ''
            const div = document.createElement('div')
            div.innerHTML = raw
            return (div.textContent || div.innerText || '')
              .replace(/&nbsp;/g, ' ')
              .trim()
          })
          .filter(t => t)
          .join('\n')
        if (!text) return
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
          } else {
            const ta = document.createElement('textarea')
            ta.value = text
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            document.execCommand('copy')
            document.body.removeChild(ta)
          }
        } catch (e) {
          console.error('[Ctrl+C纯文本] 失败:', e)
        }
      })
      // 拦截节点删除：检查是否在复习计划中
      this.interceptNodeDeletion()
      // 初始化复习触发监听 + 同步配置到主进程
      initReviewTriggerHandler(this.mindMap, this.$store)
      syncReviewConfigToMain(this.$store.state.localConfig)
      // 如果应用被接管，那么抛出事件传递思维导图实例
      if (window.takeOverApp) {
        this.$bus.$emit('app_inited', this.mindMap)
      }
      // 解析url中的文件
      if (hasFileURL) {
        this.$bus.$emit('handle_file_url')
      }
      // api/index.js文件使用
      // 当正在编辑本地文件时通过该方法获取最新数据
      Vue.prototype.getCurrentData = () => {
        const fullData = this.mindMap.getData(true)
        return { ...fullData }
      }
      // 协同测试
      this.cooperateTest()
    },

    // 加载相关插件
    loadPlugins() {
      if (this.openNodeRichText) this.addRichTextPlugin()
      if (this.isShowScrollbar) this.addScrollbarPlugin()
    },

    // url中是否存在要打开的文件
    hasFileURL() {
      const fileURL = this.$route.query.fileURL
      if (!fileURL) return false
      return /\.(smm|json|xmind|md|xlsx)$/.test(fileURL)
    },

    // 动态设置思维导图数据
    setData(data) {
      this.handleShowLoading()
      try {
        let rootNodeData = null
        if (data.root) {
          this.mindMap.setFullData(data)
          rootNodeData = data.root
        } else {
          this.mindMap.setData(data)
          rootNodeData = data
        }
        this.mindMap.view.reset()
        this.manualSave()
        // 如果导入的是富文本内容，那么自动开启富文本模式
        if (rootNodeData.data.richText && !this.openNodeRichText) {
          this.$bus.$emit('toggleOpenNodeRichText', true)
          this.$notify.info({
            title: this.$t('edit.tip'),
            message: this.$t('edit.autoOpenNodeRichTextTip')
          })
        }
      } catch (error) {
        console.log(error)
        this.$message.error('不支持加载此文件或文件内容有误')
      } finally {
        this.handleHideLoading()
      }
    },

    // 局域网挖空状态同步：仅应用挖空样式，不重新渲染
    onLanClozeStateChanged() {
      applyClozeStateFromStorage()
      // 多次确保样式被应用（DOM 可能在异步更新中）
      requestAnimationFrame(applyClozeStateFromStorage)
      setTimeout(applyClozeStateFromStorage, 100)
    },

    // 局域网折叠状态同步：恢复折叠状态
    onLanCollapseStateChanged() {
      this.restoreCollapseState()
    },

    // 局域网同步更新：静默更新，不显示loading，不重置视图
    lanSyncUpdate(data) {
      if (!data || !this.mindMap) return
      try {
        // 先加载挖空状态（SSE 已更新 localStorage），re-render 时会使用最新状态
        applyClozeStateFromStorage()

        // 保存当前视图状态（缩放、平移），避免视图跳转
        let savedView = null
        try {
          savedView = this.mindMap.view.getTransformData()
        } catch (e) {}

        if (data.root) {
          this.mindMap.setFullData(data)
        } else {
          this.mindMap.setData(data)
        }

        // 恢复视图状态
        if (savedView) {
          try {
            this.mindMap.view.setTransformData(savedView)
          } catch (e) {}
        }

        // re-render 后再次应用挖空样式
        setTimeout(applyClozeStateFromStorage, 100)
      } catch (e) {
        console.error('lan sync update error', e)
      }
    },

    // 重新渲染
    reRender() {
      this.mindMap.reRender()
    },

    // 二开：一键刷新视图（修复显示异常）
    refreshView() {
      if (!this.mindMap) return
      try {
        this.mindMap.reRender()
        setTimeout(() => applyClozeStyles(), 100)
      } catch (e) {
        console.error('[刷新] 失败:', e)
      }
    },

    // 二开：AI对话思维导图生成 - 进入节点选择模式
    onAiMindMapPick({ mode, markdown }) {
      if (!this.mindMap) return
      // 去除推理模型 <think> 标签
      const cleanContent = (markdown || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .trim()
      let treeData = null
      try {
        treeData = transformMarkdownTo(cleanContent)
      } catch (e) {
        console.error('[AI思维导图] markdown 解析失败:', e)
      }
      if (!treeData) {
        this.$message.warning('AI 返回的内容无法解析为思维导图')
        return
      }
      this.addUidToTree(treeData)
      this.aiMindMapPendingData = treeData
      this.aiMindMapPickMode = mode
      document.body.classList.add('zmind-pick-node-cursor')
      this.showPickNodeTip(mode)
    },

    // 给树数据添加 uid
    addUidToTree(data) {
      const walk = node => {
        if (!node || !node.data) return
        if (!node.data.uid) {
          node.data.uid = createUid()
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach(walk)
        }
      }
      walk(data)
    },

    // 显示选择节点顶部提示
    showPickNodeTip(mode) {
      this.removePickNodeTip()
      const tip = document.createElement('div')
      tip.className = 'zmind-pick-node-tip'
      tip.id = 'zmindPickNodeTip'
      const modeText = mode === 'insert' ? '插入为子节点' : '替换节点内容'
      tip.innerHTML =
        '请点击要<strong>' +
        modeText +
        '</strong>的目标节点 &nbsp;&nbsp;<span style="opacity:0.7">按 Esc 取消</span>'
      document.body.appendChild(tip)
      this._pickNodeEscHandler = e => {
        if (e.keyCode === 27) this.cancelAiMindMapPick()
      }
      document.addEventListener('keydown', this._pickNodeEscHandler)
    },

    removePickNodeTip() {
      const tip = document.getElementById('zmindPickNodeTip')
      if (tip) tip.remove()
      if (this._pickNodeEscHandler) {
        document.removeEventListener('keydown', this._pickNodeEscHandler)
        this._pickNodeEscHandler = null
      }
    },

    removePickNodeCursor() {
      document.body.classList.remove('zmind-pick-node-cursor')
      this.removePickNodeTip()
    },

    cancelAiMindMapPick() {
      this.aiMindMapPickMode = ''
      this.aiMindMapPendingData = null
      this.removePickNodeCursor()
    },

    // 执行插入为子节点 / 替换节点
    applyAiMindMapToNode(node, mode) {
      if (!this.aiMindMapPendingData || !node) {
        this.cancelAiMindMapPick()
        return
      }
      const targetUid = node.getData('uid')
      if (!targetUid) {
        this.$message.warning('目标节点无效')
        this.cancelAiMindMapPick()
        return
      }
      // 保存历史（支持 Ctrl+Z 撤销）
      this.mindMap.command.originAddHistory()
      const fullData = this.mindMap.getData(true)
      const newTree = JSON.parse(JSON.stringify(this.aiMindMapPendingData))
      const aiChildren = newTree.children || []

      const walk = n => {
        if (!n || !n.data) return false
        if (n.data.uid === targetUid) {
          if (mode === 'insert') {
            // 插入为子节点：保留原子节点，追加 AI 树的 children
            if (!n.children) n.children = []
            n.children.push(...aiChildren)
          } else {
            // 替换节点：替换 data（保留原 uid）和 children
            n.data = { ...newTree.data, uid: n.data.uid }
            n.children = aiChildren
          }
          return true
        }
        if (n.children && n.children.length > 0) {
          for (const child of n.children) {
            if (walk(child)) return true
          }
        }
        return false
      }

      const root = fullData.root || fullData
      const found = walk(root)
      if (!found) {
        this.$message.warning('未找到目标节点，可能数据已变更')
        this.cancelAiMindMapPick()
        return
      }

      this.aiMindMapPendingData = null
      if (fullData.root) {
        this.mindMap.setFullData(fullData)
      } else {
        this.mindMap.setData(fullData)
      }
      this.mindMap.render()
      this.manualSave && this.manualSave()
      this.$message.success(mode === 'insert' ? '已插入为子节点' : '已替换节点内容')
    },

    // 执行命令
    execCommand(...args) {
      this.mindMap.execCommand(...args)
    },

    // 导出
    async export(...args) {
      try {
        showLoading()
        const type = args[0]
        // 二开：导出 PDF/PNG/SVG 时把备注以灰色小字显示在节点下方
        const isVisualExport = ['pdf', 'png', 'svg'].includes(type)
        let noteBackup = null
        if (isVisualExport) {
          noteBackup = this._appendNoteToNodesForExport()
          if (noteBackup.changed) {
            this.mindMap.reRender()
            // 等待渲染完成
            await new Promise(resolve => {
              let done = false
              const onEnd = () => {
                if (done) return
                done = true
                this.mindMap.off('node_tree_render_end', onEnd)
                resolve()
              }
              this.mindMap.on('node_tree_render_end', onEnd)
              setTimeout(resolve, 1000) // 兜底
            })
          }
        }
        await this.mindMap.export(...args)
        // 导出后恢复原节点文本
        if (noteBackup && noteBackup.changed) {
          this._restoreNodesTextAfterExport(noteBackup)
          this.mindMap.reRender()
        }
        hideLoading()
      } catch (error) {
        console.log(error)
        hideLoading()
      }
    },

    // 二开：导出前把备注追加到节点文本末尾（灰色小字）
    _appendNoteToNodesForExport() {
      const root = this.mindMap.renderer.root
      if (!root) return { changed: false, backup: {} }
      const backup = {}
      let changed = false
      const escapeHtml = s =>
        String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      const walk = node => {
        if (!node) return
        const note = node.getData('note')
        if (note && String(note).trim()) {
          const originalText = node.getData('text') || ''
          backup[node.uid] = originalText
          // 备注转纯文本
          const noteText = String(note)
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\n+/g, ' ')
            .trim()
          if (noteText) {
            const isRich = !!node.getData('richText')
            if (isRich) {
              // 富文本：追加灰色小字段落
              const noteHtml =
                '<p><span style="color:#aaa;font-size:10px;">' +
                escapeHtml(noteText) +
                '</span></p>'
              node.setText(originalText + noteHtml, true)
            } else {
              node.setText(originalText + '\n' + noteText, false)
            }
            changed = true
          }
        }
        ;(node.children || []).forEach(walk)
      }
      walk(root)
      return { changed, backup }
    },

    // 二开：导出后恢复节点原文本
    _restoreNodesTextAfterExport(noteBackup) {
      const backup = noteBackup.backup || {}
      const root = this.mindMap.renderer.root
      if (!root) return
      const walk = node => {
        if (!node) return
        if (backup[node.uid] !== undefined) {
          const isRich = !!node.getData('richText')
          node.setText(backup[node.uid], isRich)
        }
        ;(node.children || []).forEach(walk)
      }
      walk(root)
    },

    // 修改导出内边距
    onPaddingChange(data) {
      this.mindMap.updateConfig(data)
    },

    // 加载节点富文本编辑插件
    addRichTextPlugin() {
      if (!this.mindMap) return
      this.mindMap.addPlugin(RichText)
    },

    // 移除节点富文本编辑插件
    removeRichTextPlugin() {
      this.mindMap.removePlugin(RichText)
    },

    // 加载滚动条插件
    addScrollbarPlugin() {
      if (!this.mindMap) return
      this.mindMap.addPlugin(ScrollbarPlugin)
    },

    // 移除滚动条插件
    removeScrollbarPlugin() {
      this.mindMap.removePlugin(ScrollbarPlugin)
    },

    // 协同测试
    cooperateTest() {
      if (this.mindMap.cooperate && this.$route.query.userName) {
        this.mindMap.cooperate.setProvider(null, {
          roomName: 'demo-room',
          signalingList: ['ws://localhost:4444']
        })
        this.mindMap.cooperate.setUserInfo({
          id: Math.random(),
          name: this.$route.query.userName,
          color: ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399'][
            Math.floor(Math.random() * 5)
          ],
          avatar:
            Math.random() > 0.5
              ? 'https://img0.baidu.com/it/u=4270674549,2416627993&fm=253&app=138&size=w931&n=0&f=JPEG&fmt=auto?sec=1696006800&t=4d32871d14a7224a4591d0c3c7a97311'
              : ''
        })
      }
    },

    // 拖拽文件到页面导入
    // 使用计数器避免父子元素间 dragenter/dragleave 抖动导致遮罩误关/卡死
    onDragenter() {
      if (!this.enableDragImport || this.isDragOutlineTreeNode) return
      this.dragCounter++
      this.showDragMask = true
    },

    onDragleave() {
      this.dragCounter = Math.max(0, this.dragCounter - 1)
      if (this.dragCounter === 0) {
        this.showDragMask = false
      }
    },

    // 兜底关闭：点击遮罩可关闭（防止 dragleave/drop 未触发时遮罩卡死）
    hideDragMask() {
      this.dragCounter = 0
      this.showDragMask = false
    },

    onDrop(e) {
      if (!this.enableDragImport) {
        this.hideDragMask()
        return
      }
      this.hideDragMask()
      const dt = e.dataTransfer
      const file = dt.files && dt.files[0]
      if (!file) return
      this.$bus.$emit('importFile', file)
    },

    // 网页版试用提示
    webTip() {
      const storageKey = 'webUseTip'
      const data = localStorage.getItem(storageKey)
      if (data) {
        return
      }
      this.showDownloadTip(
        '重要提示',
        '网页版仅供试用，请下载客户端获得完整体验~'
      )
      localStorage.setItem(storageKey, 1)
    },

    showDownloadTip(title, desc) {
      const h = this.$createElement
      this.$msgbox({
        title,
        message: h('div', null, [
          h(
            'p',
            {
              style: {
                marginBottom: '12px'
              }
            },
            desc
          ),
          h('div', null, [
            h(
              'a',
              {
                attrs: {
                  href:
                    'https://sxmind.cn/',
                  target: '_blank'
                },
                style: {
                  color: '#409eff',
                  marginRight: '12px'
                }
              },
              '详细了解：https://sxmind.cn/'
            )
          ])
        ]),
        showCancelButton: false,
        showConfirmButton: false
      })
    },

    // 同步局域网服务器状态（启动/停止/重启）
    async syncLanServer() {
      if (!window.zmindLan) return
      if (this.enableLanServer) {
        const result = await window.zmindLan.start(this.lanServerPort || 8080)
        if (result.success) {
          this.$notify({
            title: '局域网访问',
            message: `已开启局域网访问：http://${result.ip}:${result.port}`,
            type: 'success',
            duration: 5000
          })
        } else {
          this.$notify({
            title: '局域网访问',
            message: `启动失败：${result.error || '端口可能被占用'}`,
            type: 'error',
            duration: 5000
          })
        }
      } else {
        await window.zmindLan.stop()
      }
    },

    // 将桌面端 localStorage 同步到主进程，供局域网访问注入
    syncLocalStorageToMain() {
      if (!window.zmindLan || !window.zmindLan.syncLocalStorage) return
      const keys = [
        'SIMPLE_MIND_MAP_DATA',
        'SIMPLE_MIND_MAP_CONFIG',
        'SIMPLE_MIND_MAP_LANG',
        'SIMPLE_MIND_MAP_LOCAL_CONFIG',
        'SIMPLE_MIND_MAP_CLOZE_STATE',
        'SIMPLE_MIND_MAP_COLLAPSE_STATE',
        'ZMIND_RECENT_FILES',
        'ZMIND_FOLDER_ROOTS',
        'ZMIND_REVIEW_PLAN'
      ]
      const data = {}
      keys.forEach(k => {
        const v = localStorage.getItem(k)
        if (v !== null) data[k] = v
      })
      window.zmindLan.syncLocalStorage(data)
    },

    // 事件驱动的防抖同步：数据变化后 300ms 内合并发送
    syncToLanDebounced() {
      // 防止循环：收到网页端同步后 1.5 秒内的数据变化不回传
      if (this._lastWebSyncTime && Date.now() - this._lastWebSyncTime < 1500) {
        return
      }
      if (this._lanSyncTimer) clearTimeout(this._lanSyncTimer)
      this._lanSyncTimer = setTimeout(() => {
        this.syncLocalStorageToMain()
      }, 300)
    },

    // 处理网页端同步过来的数据
    handleWebSync(data) {
      if (!data) return
      // 设置时间戳，防止数据回传造成循环
      this._lastWebSyncTime = Date.now()
      const keys = [
        'SIMPLE_MIND_MAP_DATA',
        'SIMPLE_MIND_MAP_CONFIG',
        'SIMPLE_MIND_MAP_LANG',
        'SIMPLE_MIND_MAP_LOCAL_CONFIG',
        'SIMPLE_MIND_MAP_CLOZE_STATE',
        'SIMPLE_MIND_MAP_COLLAPSE_STATE',
        'ZMIND_RECENT_FILES',
        'ZMIND_FOLDER_ROOTS',
        'ZMIND_REVIEW_PLAN'
      ]
      let dataChanged = false
      let clozeStateChanged = false
      let fileStateChanged = false
      let collapseStateChanged = false
      // 标记来源于同步写入，避免注入脚本的 setItem 拦截器把数据回传造成循环
      try { window._fromSSE = true } catch (e) {}
      keys.forEach(k => {
        if (data[k] !== undefined) {
          const current = localStorage.getItem(k)
          if (current !== data[k]) {
            localStorage.setItem(k, data[k])
            if (k === 'SIMPLE_MIND_MAP_DATA') dataChanged = true
            if (k === 'SIMPLE_MIND_MAP_CLOZE_STATE') clozeStateChanged = true
            if (k === 'SIMPLE_MIND_MAP_COLLAPSE_STATE') collapseStateChanged = true
            if (k === 'ZMIND_RECENT_FILES' || k === 'ZMIND_FOLDER_ROOTS') fileStateChanged = true
            if (k === 'ZMIND_REVIEW_PLAN') this.$bus.$emit('review_plan_updated')
          }
        }
      })
      // 还原标志（延迟一点，确保拦截器的防抖窗口内不会触发回传）
      setTimeout(() => { try { window._fromSSE = false } catch (e) {} }, 600)
      if (dataChanged && this.mindMap) {
        try {
          const mindMapData = JSON.parse(data.SIMPLE_MIND_MAP_DATA)
          // 先加载挖空状态，再更新数据（re-render 时 applyClozeStyles 会使用最新状态）
          if (clozeStateChanged) {
            applyClozeStateFromStorage()
          }
          // 静默更新：保存/恢复视图，不显示loading，不重置视图
          let savedView = null
          try {
            savedView = this.mindMap.view.getTransformData()
          } catch (e) {}
          if (mindMapData.root) {
            this.mindMap.setFullData(mindMapData)
          } else {
            this.mindMap.setData(mindMapData)
          }
          if (savedView) {
            try {
              this.mindMap.view.setTransformData(savedView)
            } catch (e) {}
          }
          if (clozeStateChanged) {
            setTimeout(applyClozeStateFromStorage, 100)
          }
        } catch (e) {
          console.error('web sync data parse error', e)
        }
      } else if (clozeStateChanged) {
        applyClozeStateFromStorage()
      }
      // 通知文件侧边栏刷新最近文件和目录树
      if (fileStateChanged) {
        this.$bus.$emit('lanSyncFileState')
      }
      // 通知折叠状态变化
      if (collapseStateChanged) {
        this.$bus.$emit('lanCollapseStateChanged')
      }
    }
  }
}
</script>

<style lang="less" scoped>
.editContainer {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;

  .dragMask {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3999;

    .dragTip {
      pointer-events: none;
      font-weight: bold;
    }
  }

  .mindMapContainer {
    position: absolute;
    left: 0px;
    top: 0px;
    width: 100%;
    height: 100%;
  }
}
</style>

<style>
/* 二开：AI思维导图节点选择模式 - 蓝色鼠标样式 */
body.zmind-pick-node-cursor,
body.zmind-pick-node-cursor * {
  cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="9" fill="none" stroke="%230984e3" stroke-width="2.5"/><circle cx="14" cy="14" r="2.5" fill="%230984e3"/></svg>') 14 14, crosshair !important;
}
/* 节点选择顶部提示 */
.zmind-pick-node-tip {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #0984e3;
  color: #fff;
  padding: 8px 20px;
  border-radius: 22px;
  font-size: 13px;
  z-index: 99999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
}
.zmind-pick-node-tip strong {
  color: #ffeaa7;
}

/* 挖空功能全局样式（二开） */
/* 防止 foreignObject 裁剪挖空下划线 */
foreignObject {
  overflow: visible !important;
}
/* 节点渲染中的挖空样式：用 background-image 做紫色下划线 */
/* background-image 在 SVG foreignObject 中最可靠，border-bottom 和 text-decoration 不可靠 */
.smm-cloze {
  background-image: linear-gradient(#8e44ad, #8e44ad) !important;
  background-position: 0 100% !important;
  background-size: 100% 2px !important;
  background-repeat: no-repeat !important;
  padding-bottom: 2px !important;
  border-bottom: 2px solid #8e44ad !important;
}
/* 隐藏态：文字完全透明（挖空），加粗下划线 */
.smm-cloze.smm-cloze-hidden {
  color: transparent !important;
  background-color: transparent !important;
  background-image: linear-gradient(#8e44ad, #8e44ad) !important;
  background-position: 0 100% !important;
  background-size: 100% 3px !important;
  background-repeat: no-repeat !important;
  border-bottom: 3px solid #8e44ad !important;
  padding-bottom: 2px !important;
}
.smm-cloze.smm-cloze-hidden * {
  color: transparent !important;
}
/* 确保 foreignObject 内的挖空样式也生效 */
foreignObject .smm-cloze {
  background-image: linear-gradient(#8e44ad, #8e44ad) !important;
  background-position: 0 100% !important;
  background-size: 100% 2px !important;
  background-repeat: no-repeat !important;
  padding-bottom: 2px !important;
  border-bottom: 2px solid #8e44ad !important;
}
foreignObject .smm-cloze.smm-cloze-hidden {
  color: transparent !important;
  background-image: linear-gradient(#8e44ad, #8e44ad) !important;
  background-position: 0 100% !important;
  background-size: 100% 3px !important;
  background-repeat: no-repeat !important;
  border-bottom: 3px solid #8e44ad !important;
  padding-bottom: 2px !important;
}
/* 富文本编辑器中的挖空样式（使用 code 格式作为载体） */
.ql-editor code {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: rgba(142, 68, 173, 0.08);
  padding: 0 1px;
  border-bottom: 2px solid #8e44ad;
  border-radius: 0;
}

/* 禅模式（演示模式）退出按钮 */
.zenExitBtn {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 3000;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.zenExitBtn:hover {
  background: rgba(0, 0, 0, 0.75);
}

/* 跳转后右上角"返回原文档"按钮 — 红色矩形圆角，与顶部工具栏水平对齐 */
.returnPrevDocBtn {
  position: fixed;
  top: 10px;
  right: 20px;
  z-index: 2900;
  height: 34px;
  padding: 0 14px;
  background: #e74c3c;
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 5px;
  box-shadow: 0 2px 8px rgba(231, 76, 60, 0.4);
  transition: background 0.2s, box-shadow 0.2s;
}
.returnPrevDocBtn:hover {
  background: #c0392b;
  box-shadow: 0 4px 12px rgba(231, 76, 60, 0.5);
}
.returnPrevDocBtn .returnText {
  white-space: nowrap;
}
</style>
