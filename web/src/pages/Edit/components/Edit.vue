<template>
  <div
    class="editContainer"
    @dragenter.stop.prevent="onDragenter"
    @dragleave.stop.prevent
    @dragover.stop.prevent
    @drop.stop.prevent
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
    <div
      class="dragMask"
      v-if="showDragMask"
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
  applyClozeStyles,
  toggleNodeCloze,
  toggleSelectionCloze,
  clozeWholeNode,
  resetClozeState,
  nodeHasCloze,
  applyClozeStateFromStorage
} from '@/utils/cloze'
import { initAiCloze } from '@/utils/aiCloze'
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
    ReviewMode
  },
  data() {
    return {
      enableShowLoading: true,
      mindMap: null,
      mindMapData: null,
      mindMapConfig: {},
      prevImg: '',
      storeConfigTimer: null,
      showDragMask: false
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
    this.$bus.$off('review_plan_updated', this.syncToLanDebounced)
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('keydown', this.onZenEscKeydown)
    this.$bus.$off('showDownloadTip', this.showDownloadTip)
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
      storeData(this.mindMap.getData(true))
      this.syncToLanDebounced()
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

    // 处理添加到复习计划
    handleAddToReviewPlan(nodes) {
      if (!nodes || nodes.length === 0) return
      const filePath = this.$store.state.currentFilePath || ''
      const fileName = filePath ? filePath.split(/[\\/]/).pop() : ''
      let added = 0
      let skipped = 0
      nodes.forEach(node => {
        if (node.isRoot) {
          skipped++
          return
        }
        const uid = node.uid || node.getData('uid') || ''
        if (isInReviewPlan(uid)) {
          skipped++
          return
        }
        const nodeText = node.getData('text') || ''
        const parentText = node.parent ? (node.parent.getData('text') || '') : ''
        addToReviewPlan({
          nodeUid: uid,
          nodeText,
          parentText,
          filePath,
          fileName
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

      // 第二层：等 richText 初始化后，直接在编辑框元素上也绑定（确保不被 quill 内部拦截）
      this._styleKeyHandlerOnEditor = null
      // 延迟绑定：richText 可能还没初始化
      const bindToEditor = () => {
        const rt = this.mindMap.richText
        if (rt && rt.textEditNode && !this._styleKeyHandlerOnEditor) {
          this._styleKeyHandlerOnEditor = true
          rt.textEditNode.addEventListener('keydown', this.styleKeyHandler, true)
        } else if (!this._styleKeyHandlerBound) {
          this._styleKeyHandlerBound = true
          setTimeout(bindToEditor, 500)
        }
      }
      setTimeout(bindToEditor, 1000)
    },

    // 初始化挖空功能（二开功能）
    initClozeFeature() {
      initCloze(this.mindMap)
      initAiCloze(this.mindMap)
      // 渲染完成后应用挖空显示/隐藏样式
      this.mindMap.on('node_tree_render_end', applyClozeStyles)
      // 点击包含挖空内容的节点时切换显示/隐藏
      this.mindMap.on('node_click', node => {
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
      this.mindMap.keyCommand.addShortcut('Control+s', () => {
        this.manualSave()
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

    // 执行命令
    execCommand(...args) {
      this.mindMap.execCommand(...args)
    },

    // 导出
    async export(...args) {
      try {
        showLoading()
        await this.mindMap.export(...args)
        hideLoading()
      } catch (error) {
        console.log(error)
        hideLoading()
      }
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
    onDragenter() {
      if (!this.enableDragImport || this.isDragOutlineTreeNode) return
      this.showDragMask = true
    },

    onDragleave() {
      this.showDragMask = false
    },

    onDrop(e) {
      if (!this.enableDragImport) return
      this.showDragMask = false
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
</style>
