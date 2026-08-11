<template>
  <div class="toolbarContainer" :class="{ isDark: isDark }">
    <div class="toolbar" ref="toolbarRef">
      <!-- 节点操作 -->
      <div class="toolbarBlock">
        <ToolbarNodeBtnList :list="horizontalList"></ToolbarNodeBtnList>
        <!-- 更多 -->
        <el-popover
          v-model="popoverShow"
          placement="bottom-end"
          width="120"
          trigger="hover"
          v-if="showMoreBtn"
          :style="{ marginLeft: horizontalList.length > 0 ? '20px' : 0 }"
        >
          <ToolbarNodeBtnList
            dir="v"
            :list="verticalList"
            @click.native="popoverShow = false"
          ></ToolbarNodeBtnList>
          <div slot="reference" class="toolbarBtn">
            <span class="icon el-icon-more"></span>
            <span class="text">{{ $t('toolbar.more') }}</span>
          </div>
        </el-popover>
      </div>
      <!-- 挖空功能 -->
      <div class="toolbarBlock">
        <!-- AI 智能挖空 -->
        <el-tooltip
          effect="dark"
          content="AI智能挖空：保留上下文线索，适合复习记忆"
          placement="bottom"
        >
          <div
            class="toolbarBtn"
            :class="{ disabled: aiClozeLoading }"
            @click="doSmartCloze"
          >
            <span class="icon el-icon-magic-stick" :style="{ color: aiClozeLoading ? '' : '#8e44ad' }"></span>
            <span class="text">{{ aiClozeLoading && aiClozeMode === 'smart' ? '挖空中...' : 'AI智能挖空' }}</span>
          </div>
        </el-tooltip>
        <!-- 清除挖空 -->
        <el-tooltip
          effect="dark"
          content="清除所有挖空标记"
          placement="bottom"
        >
          <div class="toolbarBtn" @click="doClearCloze">
            <span class="icon el-icon-brush"></span>
            <span class="text">清除挖空</span>
          </div>
        </el-tooltip>
        <!-- 挖空版本管理 -->
        <el-popover
          placement="bottom"
          width="280"
          trigger="click"
          v-model="versionPopoverVisible"
        >
          <div class="clozeVersionPanel">
            <div class="clozeVersionHeader">
              <span>挖空版本</span>
              <el-button
                type="primary"
                size="mini"
                icon="el-icon-plus"
                @click="openSaveVersionDialog"
                :disabled="!hasClozeContent"
              >保存当前</el-button>
            </div>
            <div class="clozeVersionTip" v-if="!hasClozeContent">
              当前无挖空内容，请先进行智能挖空或手动挖空
            </div>
            <div class="clozeVersionList" v-if="clozeVersions.length > 0">
              <div
                class="clozeVersionItem"
                v-for="ver in clozeVersions"
                :key="ver.id"
              >
                <div class="clozeVersionInfo">
                  <div class="clozeVersionName">{{ ver.name }}</div>
                  <div class="clozeVersionTime">{{ formatVersionTime(ver.timestamp) }}</div>
                </div>
                <div class="clozeVersionActions">
                  <el-button type="text" size="mini" @click="loadVersion(ver.id)">加载</el-button>
                  <el-button type="text" size="mini" class="dangerBtn" @click="removeVersion(ver.id)">删除</el-button>
                </div>
              </div>
            </div>
            <div class="clozeVersionEmpty" v-else-if="hasClozeContent">
              暂无保存的版本
            </div>
          </div>
          <div slot="reference" class="toolbarBtn">
            <span class="icon el-icon-files"></span>
            <span class="text">挖空版本</span>
          </div>
        </el-popover>
        <!-- 显示/隐藏挖空 -->
        <el-tooltip
          effect="dark"
          :content="clozeHidden ? '显示所有挖空内容' : '隐藏所有挖空内容'"
          placement="bottom"
        >
          <div class="toolbarBtn" @click="toggleCloze">
            <span
              class="icon el-icon-view"
              :style="{ color: clozeHidden ? '#8e44ad' : '' }"
            ></span>
            <span class="text">{{ clozeHidden ? '显示挖空' : '隐藏挖空' }}</span>
          </div>
        </el-tooltip>
      </div>
      <!-- 复习模式 -->
      <div class="toolbarBlock">
        <el-tooltip
          effect="dark"
          :content="isReviewMode ? '退出复习模式' : '进入复习模式'"
          placement="bottom"
        >
          <div
            class="toolbarBtn"
            :class="{ activeReview: isReviewMode }"
            @click="toggleReviewMode"
          >
            <span
              class="icon el-icon-reading"
              :style="{ color: isReviewMode ? '#e6a23c' : '' }"
            ></span>
            <span class="text">{{ isReviewMode ? '退出复习' : '进入复习' }}</span>
          </div>
        </el-tooltip>
      </div>
      <!-- 一键刷新 -->
      <div class="toolbarBlock">
        <el-tooltip
          effect="dark"
          content="一键刷新视图（修复显示异常）"
          placement="bottom"
        >
          <div class="toolbarBtn" @click="refreshView">
            <span class="icon el-icon-refresh-right"></span>
            <span class="text">刷新</span>
          </div>
        </el-tooltip>
      </div>
      <!-- 保存挖空版本弹窗 -->
      <el-dialog
        title="保存挖空版本"
        :visible.sync="saveVersionDialogVisible"
        width="360px"
        append-to-body
      >
        <el-input
          v-model="versionNameInput"
          placeholder="请输入版本名称"
          maxlength="30"
          show-word-limit
          @keyup.enter.native="confirmSaveVersion"
        ></el-input>
        <div slot="footer">
          <el-button @click="saveVersionDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmSaveVersion">保存</el-button>
        </div>
      </el-dialog>
      <!-- AI 挖空加载遮罩 -->
      <div class="aiClozeMask" v-if="aiClozeLoading">
        <div class="aiClozeLoadingBox">
          <i class="el-icon-loading"></i>
          <span>AI 正在分析思维导图并{{ aiClozeMode === 'recite' ? '进行背诵改写' : '进行智能挖空' }}...</span>
          <el-button
            type="warning"
            size="small"
            class="aiClozeStopBtn"
            @click="stopAiTask"
          >停止</el-button>
        </div>
      </div>
    </div>
    <NodeImage></NodeImage>
    <NodeHyperlink></NodeHyperlink>
    <NodeIcon></NodeIcon>
    <NodeNote></NodeNote>
    <NodeTag></NodeTag>
    <Export></Export>
    <Import ref="ImportRef"></Import>
  </div>
</template>

<script>
import NodeImage from './NodeImage.vue'
import NodeHyperlink from './NodeHyperlink.vue'
import NodeIcon from './NodeIcon.vue'
import NodeNote from './NodeNote.vue'
import NodeTag from './NodeTag.vue'
import Export from './Export.vue'
import Import from './Import.vue'
import { mapState } from 'vuex'
import { Notification } from 'element-ui'
import exampleData from 'simple-mind-map/example/exampleData'
import { getData } from '../../../api'
import ToolbarNodeBtnList from './ToolbarNodeBtnList.vue'
import { throttle, isMobile } from 'simple-mind-map/src/utils/index'
import { toggleAllCloze, isClozeHiddenAll } from '@/utils/cloze'
import {
  initAiCloze,
  setClozeFilePath,
  smartCloze,
  smartClozeNodes,
  clearAllCloze,
  getClozeVersions,
  saveClozeVersion,
  loadClozeVersion,
  deleteClozeVersion,
  getCurrentClozeState,
  stopAiCloze
} from '@/utils/aiCloze'
import { reciteRewriteNodes, stopAiRecite } from '@/utils/aiRecite'

// 工具栏
let fileHandle = null
const defaultBtnList = [
  'back',
  'forward',
  'painter',
  'siblingNode',
  'childNode',
  'deleteNode',
  'image',
  'icon',
  'link',
  'note',
  'tag',
  'summary',
  'associativeLine',
  'formula',
  // 'attachment',
  'outerFrame',
  'annotation',
  'ai'
]

export default {
  components: {
    NodeImage,
    NodeHyperlink,
    NodeIcon,
    NodeNote,
    NodeTag,
    Export,
    Import,
    ToolbarNodeBtnList
  },
  data() {
    return {
      isMobile: isMobile(),
      horizontalList: [],
      verticalList: [],
      showMoreBtn: true,
      popoverShow: false,
      fileTreeProps: {
        label: 'name',
        children: 'children',
        isLeaf: 'leaf'
      },
      fileTreeVisible: false,
      rootDirName: '',
      fileTreeExpand: true,
      waitingWriteToLocalFile: false,
      clozeHidden: isClozeHiddenAll(),
      aiClozeLoading: false,
      aiClozeMode: '',
      clozeVersions: [],
      versionPopoverVisible: false,
      saveVersionDialogVisible: false,
      versionNameInput: '',
      hasClozeContent: false
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      isHandleLocalFile: state => state.isHandleLocalFile,
      openNodeRichText: state => state.localConfig.openNodeRichText,
      enableAi: state => state.localConfig.enableAi,
      aiConfig: state => state.aiConfig,
      isReviewMode: state => state.isReviewMode,
      currentFilePath: state => state.currentFilePath
    }),

    btnLit() {
      let res = [...defaultBtnList]
      if (!this.openNodeRichText) {
        res = res.filter(item => {
          return item !== 'formula'
        })
      }
      if (!this.enableAi) {
        res = res.filter(item => {
          return item !== 'ai'
        })
      }
      return res
    }
  },
  watch: {
    isHandleLocalFile(val) {
      if (!val) {
        Notification.closeAll()
      }
    },
    btnLit: {
      deep: true,
      handler() {
        this.computeToolbarShow()
      }
    },
    // 文件切换时刷新挖空版本列表（只显示当前文件的版本）
    currentFilePath() {
      this.clozeVersions = getClozeVersions(this.currentFilePath || '')
      setClozeFilePath(this.currentFilePath || '')
    }
  },
  created() {
    this.$bus.$on('write_local_file', this.onWriteLocalFile)
  },
  mounted() {
    this.computeToolbarShow()
    this.computeToolbarShowThrottle = throttle(this.computeToolbarShow, 300)
    window.addEventListener('resize', this.computeToolbarShowThrottle)
    this.$bus.$on('lang_change', this.computeToolbarShowThrottle)
    window.addEventListener('beforeunload', this.onUnload)
    this.$bus.$on('node_note_dblclick', this.onNodeNoteDblclick)
    // 挖空版本管理初始化（只显示当前文件的版本）
    this.clozeVersions = getClozeVersions(this.currentFilePath || '')
    setClozeFilePath(this.currentFilePath || '')
    this.$bus.$on('setData', this.onDataChange)
    this.$bus.$on('node_tree_render_end', this.onRenderEnd)
    this.$bus.$on('ai_smart_cloze_nodes', this.onSmartClozeNodes)
    this.$bus.$on('ai_recite_rewrite_nodes', this.onReciteRewriteNodes)
    this.$bus.$on('cloze_auto_saved', this.onClozeAutoSaved)
  },
  beforeDestroy() {
    this.$bus.$off('write_local_file', this.onWriteLocalFile)
    window.removeEventListener('resize', this.computeToolbarShowThrottle)
    this.$bus.$off('lang_change', this.computeToolbarShowThrottle)
    window.removeEventListener('beforeunload', this.onUnload)
    this.$bus.$off('node_note_dblclick', this.onNodeNoteDblclick)
    this.$bus.$off('setData', this.onDataChange)
    this.$bus.$off('node_tree_render_end', this.onRenderEnd)
    this.$bus.$off('ai_smart_cloze_nodes', this.onSmartClozeNodes)
    this.$bus.$off('ai_recite_rewrite_nodes', this.onReciteRewriteNodes)
    this.$bus.$off('cloze_auto_saved', this.onClozeAutoSaved)
  },
  methods: {
    // 切换复习模式
    toggleReviewMode() {
      if (this.isReviewMode) {
        this.$bus.$emit('exit_review_mode')
      } else {
        this.$bus.$emit('enter_review_mode')
      }
    },

    // 一键刷新视图
    refreshView() {
      this.$bus.$emit('zmind_refresh_view')
      this.$message.success('已刷新视图')
    },

    // 计算工具按钮如何显示
    computeToolbarShow() {
      if (!this.$refs.toolbarRef) return
      const windowWidth = window.innerWidth - 40
      const all = [...this.btnLit]
      let index = 1
      const loopCheck = () => {
        if (index > all.length) return done()
        this.horizontalList = all.slice(0, index)
        this.$nextTick(() => {
          const width = this.$refs.toolbarRef.getBoundingClientRect().width
          if (width < windowWidth) {
            index++
            loopCheck()
          } else if (index > 0 && width > windowWidth) {
            index--
            this.horizontalList = all.slice(0, index)
            done()
          }
        })
      }
      const done = () => {
        this.verticalList = all.slice(index)
        this.showMoreBtn = this.verticalList.length > 0
      }
      loopCheck()
    },

    // 监听本地文件读写
    onWriteLocalFile(content) {
      clearTimeout(this.timer)
      if (fileHandle && this.isHandleLocalFile) {
        this.waitingWriteToLocalFile = true
      }
      this.timer = setTimeout(() => {
        this.writeLocalFile(content)
      }, 1000)
    },

    onUnload(e) {
      if (this.waitingWriteToLocalFile) {
        const msg = '存在未保存的数据'
        e.returnValue = msg
        return msg
      }
    },

    // 加载本地文件树
    async loadFileTreeNode(node, resolve) {
      try {
        let dirHandle
        if (node.level === 0) {
          dirHandle = await window.showDirectoryPicker()
          this.rootDirName = dirHandle.name
        } else {
          dirHandle = node.data.handle
        }
        const dirList = []
        const fileList = []
        for await (const [key, value] of dirHandle.entries()) {
          const isFile = value.kind === 'file'
          if (isFile && !/\.(smm|xmind|md|json)$/.test(value.name)) {
            continue
          }
          const enableEdit = isFile && /\.smm$/.test(value.name)
          const data = {
            id: key,
            name: value.name,
            type: value.kind,
            handle: value,
            leaf: isFile,
            enableEdit
          }
          if (isFile) {
            fileList.push(data)
          } else {
            dirList.push(data)
          }
        }
        resolve([...dirList, ...fileList])
      } catch (error) {
        console.log(error)
        this.fileTreeVisible = false
        resolve([])
        if (error.toString().includes('aborted')) {
          return
        }
        this.$message.warning(this.$t('toolbar.notSupportTip'))
      }
    },

    // 扫描本地文件夹
    // 一键显示/隐藏所有挖空内容（二开功能）
    toggleCloze() {
      this.clozeHidden = toggleAllCloze()
    },

    // AI 智能挖空
    async doSmartCloze() {
      if (this.aiClozeLoading) return
      // 检查 AI 配置
      if (!(this.aiConfig.api && this.aiConfig.key && this.aiConfig.model)) {
        this.$bus.$emit('showAiConfigDialog')
        this.$message.warning('请先配置 AI 接口')
        return
      }
      this.aiClozeLoading = true
      this.aiClozeMode = 'smart'
      try {
        const count = await smartCloze(this.aiConfig)
        this.$notify({
          title: '智能挖空',
          message: `AI 已完成智能挖空，共挖空 ${count} 个节点`,
          type: 'success',
          duration: 3000
        })
        this.refreshClozeContent()
      } catch (error) {
        console.error(error)
        this.$notify({
          title: '智能挖空失败',
          message: error.message || '请检查 AI 配置或网络后重试',
          type: 'error',
          duration: 5000
        })
      } finally {
        this.aiClozeLoading = false
        this.aiClozeMode = ''
      }
    },

    // 右键智能挖空指定节点
    async onSmartClozeNodes(nodes) {
      if (this.aiClozeLoading) return
      // 检查 AI 配置
      if (!(this.aiConfig.api && this.aiConfig.key && this.aiConfig.model)) {
        this.$bus.$emit('showAiConfigDialog')
        this.$message.warning('请先配置 AI 接口')
        return
      }
      this.aiClozeLoading = true
      this.aiClozeMode = 'smart'
      try {
        const count = await smartClozeNodes(this.aiConfig, nodes)
        this.$notify({
          title: '智能挖空',
          message: `AI 已完成挖空，共处理 ${count} 个节点`,
          type: 'success',
          duration: 3000
        })
        this.refreshClozeContent()
      } catch (error) {
        console.error(error)
        this.$notify({
          title: '智能挖空失败',
          message: error.message || '请检查 AI 配置或网络后重试',
          type: 'error',
          duration: 5000
        })
      } finally {
        this.aiClozeLoading = false
        this.aiClozeMode = ''
      }
    },

    // 停止当前 AI 任务（智能挖空 / 背诵改写）
    stopAiTask() {
      if (this.aiClozeMode === 'recite') {
        stopAiRecite()
      } else {
        stopAiCloze()
      }
      this.aiClozeLoading = false
      this.aiClozeMode = ''
      this.$message.info('已停止 AI 任务')
    },

    // 右键 AI 背诵改写指定节点
    async onReciteRewriteNodes(nodes) {
      if (this.aiClozeLoading) return
      // 检查 AI 配置
      if (!(this.aiConfig.api && this.aiConfig.key && this.aiConfig.model)) {
        this.$bus.$emit('showAiConfigDialog')
        this.$message.warning('请先配置 AI 接口')
        return
      }
      this.aiClozeLoading = true
      this.aiClozeMode = 'recite'
      try {
        const count = await reciteRewriteNodes(this.aiConfig, nodes)
        this.$notify({
          title: '背诵改写',
          message: `AI 已完成改写，共处理 ${count} 个节点`,
          type: 'success',
          duration: 3000
        })
      } catch (error) {
        console.error(error)
        this.$notify({
          title: '背诵改写失败',
          message: error.message || '请检查 AI 配置或网络后重试',
          type: 'error',
          duration: 5000
        })
      } finally {
        this.aiClozeLoading = false
        this.aiClozeMode = ''
      }
    },

    // 清除所有挖空
    doClearCloze() {
      const count = clearAllCloze()
      if (count > 0) {
        this.$message.success(`已清除 ${count} 个节点的挖空标记`)
      } else {
        this.$message.info('当前没有挖空内容')
      }
      this.refreshClozeContent()
    },

    // 检查当前是否有挖空内容
    refreshClozeContent() {
      const state = getCurrentClozeState()
      this.hasClozeContent = Object.keys(state).length > 0
    },

    // 打开保存版本弹窗
    openSaveVersionDialog() {
      this.versionNameInput = ''
      this.saveVersionDialogVisible = true
    },

    // 确认保存版本
    confirmSaveVersion() {
      const name = this.versionNameInput.trim()
      if (!name) {
        this.$message.warning('请输入版本名称')
        return
      }
      const version = saveClozeVersion(name, this.currentFilePath || '')
      this.clozeVersions = getClozeVersions(this.currentFilePath || '')
      this.saveVersionDialogVisible = false
      this.$message.success(`已保存挖空版本「${version.name}」`)
    },

    // 加载版本
    loadVersion(versionId) {
      const success = loadClozeVersion(versionId)
      if (success) {
        this.$message.success('已加载挖空版本')
        this.versionPopoverVisible = false
        this.refreshClozeContent()
      } else {
        this.$message.error('加载失败，版本数据可能已过期')
      }
    },

    // 删除版本
    removeVersion(versionId) {
      this.$confirm('确认删除此挖空版本？', '提示', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.clozeVersions = deleteClozeVersion(versionId).filter(v => v.filePath === (this.currentFilePath || ''))
        this.$message.success('已删除')
      }).catch(() => {})
    },

    // AI挖空自动保存版本后的回调
    onClozeAutoSaved(version) {
      this.clozeVersions = getClozeVersions(this.currentFilePath || '')
      this.refreshClozeContent()
      this.$notify({
        title: '挖空版本已自动保存',
        message: `本次挖空内容已自动保存为「${version.name}」，可在挖空版本中查看或恢复`,
        type: 'success',
        duration: 5000
      })
    },

    // 格式化版本时间
    formatVersionTime(timestamp) {
      if (!timestamp) return ''
      const d = new Date(timestamp)
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },

    // 数据变更时刷新挖空状态
    onDataChange() {
      this.$nextTick(() => {
        setTimeout(() => this.refreshClozeContent(), 200)
      })
    },

    // 渲染结束后刷新挖空状态（节流）
    onRenderEnd() {
      if (this._clozeRefreshTimer) return
      this._clozeRefreshTimer = setTimeout(() => {
        this.refreshClozeContent()
        this._clozeRefreshTimer = null
      }, 500)
    },

    openDirectory() {
      this.fileTreeVisible = false
      this.fileTreeExpand = true
      this.rootDirName = ''
      this.$nextTick(() => {
        this.fileTreeVisible = true
      })
    },

    // 编辑指定文件
    editLocalFile(data) {
      if (data.handle) {
        fileHandle = data.handle
        this.readFile()
      }
    },

    // 导入指定文件
    async importLocalFile(data) {
      try {
        const file = await data.handle.getFile()
        this.$refs.ImportRef.onChange({
          raw: file,
          name: file.name
        })
        this.$refs.ImportRef.confirm()
      } catch (error) {
        console.log(error)
      }
    },

    // 打开本地文件
    async openLocalFile() {
      try {
        let [_fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: '',
              accept: {
                'application/json': ['.smm']
              }
            }
          ],
          excludeAcceptAllOption: true,
          multiple: false
        })
        if (!_fileHandle) {
          return
        }
        fileHandle = _fileHandle
        if (fileHandle.kind === 'directory') {
          this.$message.warning(this.$t('toolbar.selectFileTip'))
          return
        }
        this.readFile()
      } catch (error) {
        console.log(error)
        if (error.toString().includes('aborted')) {
          return
        }
        this.$message.warning(this.$t('toolbar.notSupportTip'))
      }
    },

    // 读取本地文件
    async readFile() {
      let file = await fileHandle.getFile()
      let fileReader = new FileReader()
      fileReader.onload = async () => {
        this.$store.commit('setIsHandleLocalFile', true)
        this.setData(fileReader.result)
        Notification.closeAll()
        Notification({
          title: this.$t('toolbar.tip'),
          message: `${this.$t('toolbar.editingLocalFileTipFront')}${
            file.name
          }${this.$t('toolbar.editingLocalFileTipEnd')}`,
          duration: 0,
          showClose: true
        })
      }
      fileReader.readAsText(file)
    },

    // 渲染读取的数据
    setData(str) {
      try {
        let data = JSON.parse(str)
        if (typeof data !== 'object') {
          throw new Error(this.$t('toolbar.fileContentError'))
        }
        if (data.root) {
          this.isFullDataFile = true
        } else {
          this.isFullDataFile = false
          data = {
            ...exampleData,
            root: data
          }
        }
        this.$bus.$emit('setData', data)
      } catch (error) {
        console.log(error)
        this.$message.error(this.$t('toolbar.fileOpenFailed'))
      }
    },

    // 写入本地文件
    async writeLocalFile(content) {
      if (!fileHandle || !this.isHandleLocalFile) {
        this.waitingWriteToLocalFile = false
        return
      }
      if (!this.isFullDataFile) {
        content = content.root
      }
      let string = JSON.stringify(content)
      const writable = await fileHandle.createWritable()
      await writable.write(string)
      await writable.close()
      this.waitingWriteToLocalFile = false
    },

    // 创建本地文件
    async createNewLocalFile() {
      await this.createLocalFile(exampleData)
    },

    // 另存为
    async saveLocalFile() {
      let data = getData()
      await this.createLocalFile(data)
    },

    // 创建本地文件
    async createLocalFile(content) {
      try {
        let _fileHandle = await window.showSaveFilePicker({
          types: [
            {
              description: '',
              accept: { 'application/json': ['.smm'] }
            }
          ],
          suggestedName: this.$t('toolbar.defaultFileName')
        })
        if (!_fileHandle) {
          return
        }
        const loading = this.$loading({
          lock: true,
          text: this.$t('toolbar.creatingTip'),
          spinner: 'el-icon-loading',
          background: 'rgba(0, 0, 0, 0.7)'
        })
        fileHandle = _fileHandle
        this.$store.commit('setIsHandleLocalFile', true)
        this.isFullDataFile = true
        await this.writeLocalFile(content)
        await this.readFile()
        loading.close()
      } catch (error) {
        console.log(error)
        if (error.toString().includes('aborted')) {
          return
        }
        this.$message.warning(this.$t('toolbar.notSupportTip'))
      }
    },

    onNodeNoteDblclick(node, e) {
      e.stopPropagation()
      this.$bus.$emit('showNodeNote', node)
    }
  }
}
</script>

<style lang="less" scoped>
.toolbarContainer {
  &.isDark {
    .toolbar {
      color: hsla(0, 0%, 100%, 0.9);
      .toolbarBlock {
        background-color: #262a2e;

        .fileTreeBox {
          background-color: #262a2e;

          /deep/ .el-tree {
            background-color: #262a2e;

            &.el-tree--highlight-current {
              .el-tree-node.is-current > .el-tree-node__content {
                background-color: hsla(0, 0%, 100%, 0.05) !important;
              }
            }

            .el-tree-node:focus > .el-tree-node__content {
              background-color: hsla(0, 0%, 100%, 0.05) !important;
            }

            .el-tree-node__content:hover,
            .el-upload-list__item:hover {
              background-color: hsla(0, 0%, 100%, 0.02) !important;
            }
          }

          .fileTreeWrap {
            .customTreeNode {
              .treeNodeInfo {
                color: #fff;
              }

              .treeNodeBtnList {
                .el-button {
                  padding: 7px 5px;
                }
              }
            }
          }
        }
      }

      .toolbarBtn {
        .icon {
          background: transparent;
          border-color: transparent;
        }

        &:hover {
          &:not(.disabled) {
            .icon {
              background: hsla(0, 0%, 100%, 0.05);
            }
          }
        }

        &.disabled {
          color: #54595f;
        }
      }
    }
  }
  .toolbar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    top: 10px;
    width: max-content;
    display: flex;
    font-size: 9px;
    font-family: PingFangSC-Regular, PingFang SC;
    font-weight: 400;
    color: rgba(26, 26, 26, 0.8);
    z-index: 2;

    .toolbarBlock {
      display: flex;
      background-color: #fff;
      padding: 4px 8px;
      border-radius: 8px;
      box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
      border: 1px solid rgba(0, 0, 0, 0.06);
      margin-right: 8px;
      flex-shrink: 0;
      position: relative;
      align-items: center;

      &:last-of-type {
        margin-right: 0;
      }

      /deep/ .el-popover__reference-wrapper {
        display: flex;
        align-items: center;
      }

      .fileTreeBox {
        position: absolute;
        left: 0;
        top: 55px;
        width: 100%;
        height: 30px;
        background-color: #fff;
        padding: 12px 5px;
        padding-top: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 5px;
        min-width: 200px;
        box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);

        &.expand {
          height: 300px;

          .fileTreeWrap {
            visibility: visible;
          }
        }

        .fileTreeToolbar {
          width: 100%;
          height: 30px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e9e9e9;
          margin-bottom: 12px;
          padding-left: 12px;

          .fileTreeName {
          }

          .fileTreeActionList {
            .btn {
              font-size: 18px;
              margin-left: 12px;
              cursor: pointer;
            }
          }
        }

        .fileTreeWrap {
          width: 100%;
          height: 100%;
          overflow: auto;
          visibility: hidden;

          .customTreeNode {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            padding-right: 5px;

            .treeNodeInfo {
              display: flex;
              align-items: center;

              .treeNodeIcon {
                margin-right: 5px;
                opacity: 0.7;
              }

              .treeNodeName {
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
            }

            .treeNodeBtnList {
              display: flex;
              align-items: center;
            }
          }
        }
      }
    }

    .toolbarBtn {
      display: flex;
      justify-content: center;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      margin-right: 8px;
      height: 34px;

      &:last-of-type {
        margin-right: 0;
      }

      &:hover {
        &:not(.disabled) {
          .icon {
            background: #f5f5f5;
          }
        }
      }

      &.active {
        .icon {
          background: #f5f5f5;
        }
      }

      &.disabled {
        color: #bcbcbc;
        cursor: not-allowed;
        pointer-events: none;
      }

      .icon {
        display: flex;
        height: 16px;
        min-width: 24px;
        background: #fff;
        border-radius: 4px;
        border: 1px solid #e9e9e9;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        text-align: center;
        padding: 0 3px;
        box-sizing: border-box;
      }

      .text {
        margin-top: 1px;
        white-space: nowrap;
        font-size: 9px;
      }
    }
  }
}

/* 挖空版本管理面板 */
.clozeVersionPanel {
  .clozeVersionHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 600;
  }

  .clozeVersionTip {
    font-size: 12px;
    color: #999;
    line-height: 1.6;
    padding: 8px 0;
  }

  .clozeVersionList {
    max-height: 300px;
    overflow-y: auto;
  }

  .clozeVersionItem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;

    &:last-child {
      border-bottom: none;
    }

    .clozeVersionInfo {
      flex: 1;
      min-width: 0;

      .clozeVersionName {
        font-size: 13px;
        color: #333;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .clozeVersionTime {
        font-size: 11px;
        color: #aaa;
        margin-top: 2px;
      }
    }

    .clozeVersionActions {
      flex-shrink: 0;
      margin-left: 8px;

      .dangerBtn {
        color: #f56c6c;
      }
    }
  }

  .clozeVersionEmpty {
    text-align: center;
    color: #ccc;
    font-size: 12px;
    padding: 20px 0;
  }
}

/* AI 挖空加载遮罩 */
.aiClozeMask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.35);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;

  .aiClozeLoadingBox {
    background: #fff;
    border-radius: 12px;
    padding: 30px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);

    i {
      font-size: 32px;
      color: #8e44ad;
    }

    span {
      font-size: 14px;
      color: #555;
    }

    .aiClozeStopBtn {
      margin-top: 4px;
    }
  }
}
</style>
