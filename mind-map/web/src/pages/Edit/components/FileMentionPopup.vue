<template>
  <div
    class="fileMentionPopup"
    v-if="visible"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    :class="{ isDark: isDark }"
  >
    <div class="searchBox">
      <input
        ref="searchInputRef"
        v-model="searchText"
        type="text"
        :placeholder="mode === 'node' ? '输入节点内容搜索...' : '输入文件名搜索...'"
        @keydown.up.prevent="selectPrev"
        @keydown.down.prevent="selectNext"
        @keydown.enter.prevent="confirmSelection"
        @keydown.esc.prevent="hide"
      />
    </div>
    <div class="fileList customScrollbar" v-if="filteredFiles.length > 0">
      <div
        class="fileItem"
        v-for="(item, idx) in filteredFiles"
        :key="item.path || (item.filePath + item.nodeUid)"
        :class="{ active: idx === selectedIndex }"
        @click="selectFile(item)"
        @mouseenter="onItemMouseEnter($event, item, idx)"
        @mouseleave="onItemMouseLeave($event, item)"
      >
        <span class="fileIcon" :class="item.isDir ? 'el-icon-folder' : (item.isNode ? 'el-icon-share' : 'el-icon-document')"></span>
        <div class="fileInfo">
          <span class="fileName">{{ item.name }}</span>
          <span class="fileMeta" v-if="item.isNode">{{ item.fileName }}</span>
          <span class="filePath" v-else-if="item.parentName">{{ item.parentName }}</span>
        </div>
        <span class="previewHint" v-if="item.isNode">悬浮预览 →</span>
      </div>
    </div>
    <div class="emptyTip" v-else>
      {{ searchText ? '未找到匹配' + (mode === 'node' ? '节点' : '文件') : '请输入' + (mode === 'node' ? '节点内容' : '文件名') }}
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { getFs } from '@/utils/webFs'

const fs = getFs()
const ROOTS_KEY = 'ZMIND_FOLDER_ROOTS'
const SUPPORT_EXT_REG = /\.(smm|json|md)$/i

export default {
  data() {
    return {
      visible: false,
      pos: { x: 0, y: 0 },
      searchText: '',
      mode: 'file', // 'file' (@) 或 'node' (#)
      allFiles: [],
      allNodes: [],
      filteredFiles: [],
      selectedIndex: 0,
      callback: null
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  watch: {
    searchText(val) {
      if (this.mode === 'node') {
        this.filterNodes(val)
      } else {
        this.filterFiles(val)
      }
    }
  },
  created() {
    this.onOutsideClick = this.onOutsideClick.bind(this)
    this.$bus.$on('show_file_mention_popup', this.show)
    this.$bus.$on('hide_file_mention_popup', this.hide)
  },
  beforeDestroy() {
    document.removeEventListener('mousedown', this.onOutsideClick, true)
    this.$bus.$off('show_file_mention_popup', this.show)
    this.$bus.$off('hide_file_mention_popup', this.hide)
  },
  methods: {
    async show(data) {
      this.pos = data.pos || { x: 0, y: 0 }
      this.callback = data.callback || null
      this.mode = data.mode || 'file'
      this.searchText = ''
      this.selectedIndex = 0
      this.visible = true
      if (this.mode === 'node') {
        await this.loadNodes()
        this.filterNodes('')
      } else {
        await this.loadFiles()
        this.filterFiles('')
      }
      this.$nextTick(() => {
        if (this.$refs.searchInputRef) {
          this.$refs.searchInputRef.focus()
        }
        // 延迟绑定外部点击关闭，避免触发弹窗的 mousedown 立即关闭
        // 用 capture 阶段：textEditNode 的 mousedown 会 stopPropagation 阻止冒泡，
        // bubble 阶段的 document 监听收不到，必须用 capture 才能拦截
        setTimeout(() => {
          document.addEventListener('mousedown', this.onOutsideClick, true)
        }, 100)
      })
    },

    hide() {
      this.visible = false
      this.callback = null
      document.removeEventListener('mousedown', this.onOutsideClick, true)
      // 关闭可能打开的节点预览悬浮窗
      if (this._hoverPreviewTimer) {
        clearTimeout(this._hoverPreviewTimer)
        this._hoverPreviewTimer = null
      }
      if (this._hidePreviewTimer) {
        clearTimeout(this._hidePreviewTimer)
        this._hidePreviewTimer = null
      }
      this.$bus.$emit('hide_file_preview')
    },

    // 点击弹窗外部关闭
    onOutsideClick(e) {
      if (!this.visible) return
      const el = this.$el
      if (el && !el.contains(e.target)) {
        this.hide()
      }
    },

    // 从目录树根目录递归加载所有支持文件
    async loadFiles() {
      this.allFiles = []
      let roots = []
      try {
        roots = JSON.parse(localStorage.getItem(ROOTS_KEY) || '[]')
      } catch (e) {
        roots = []
      }
      for (const root of roots) {
        try {
          const exists = await fs.exists(root)
          if (!exists) continue
          await this.scanDir(root, root, 2)
        } catch (e) {}
      }
    },

    // 递归扫描目录（限制深度避免性能问题）
    async scanDir(dirPath, rootPath, depth) {
      if (depth < 0) return
      try {
        const list = await fs.listDir(dirPath)
        if (!list) return
        for (const item of list) {
          if (item.isDir) {
            await this.scanDir(item.path, rootPath, depth - 1)
          } else if (SUPPORT_EXT_REG.test(item.name)) {
            const parentName = item.path !== rootPath
              ? dirPath.split(/[\\/]/).pop()
              : ''
            this.allFiles.push({
              name: item.name,
              path: item.path,
              parentName,
              isDir: false
            })
          }
        }
      } catch (e) {}
    },

    filterFiles(query) {
      if (!query || !query.trim()) {
        this.filteredFiles = this.allFiles.slice(0, 30)
      } else {
        const q = query.toLowerCase()
        this.filteredFiles = this.allFiles
          .filter(f => f.name.toLowerCase().includes(q))
          .slice(0, 30)
      }
      this.selectedIndex = 0
    },

    // # 模式：加载所有文件中的节点
    async loadNodes() {
      this.allNodes = []
      let roots = []
      try {
        roots = JSON.parse(localStorage.getItem(ROOTS_KEY) || '[]')
      } catch (e) {
        roots = []
      }
      for (const root of roots) {
        try {
          const exists = await fs.exists(root)
          if (!exists) continue
          await this.scanDirForNodes(root, root, 2)
        } catch (e) {}
      }
    },

    // 递归扫描目录，读取文件并提取节点
    async scanDirForNodes(dirPath, rootPath, depth) {
      if (depth < 0) return
      try {
        const list = await fs.listDir(dirPath)
        if (!list) return
        for (const item of list) {
          if (item.isDir) {
            await this.scanDirForNodes(item.path, rootPath, depth - 1)
          } else if (SUPPORT_EXT_REG.test(item.name)) {
            await this.extractNodesFromFile(item.path, item.name)
          }
        }
      } catch (e) {}
    },

    // 从单个文件中提取所有节点
    async extractNodesFromFile(filePath, fileName) {
      try {
        const content = await fs.readFile(filePath)
        let rootData = null
        if (/\.md$/i.test(filePath)) {
          const markdown = await import('simple-mind-map/src/parse/markdown.js')
          const list = markdown.default.transformMarkdownToList(content)
          if (!list || list.length === 0) return
          rootData = list.length === 1 ? list[0] : { data: { text: fileName }, children: list }
        } else {
          const data = JSON.parse(content)
          rootData = data.root || data
        }
        if (!rootData) return
        const walk = (node, depth) => {
          if (!node || !node.data) return
          const text = String(node.data.text || '').replace(/<[^>]+>/g, '').trim()
          if (text) {
            this.allNodes.push({
              name: text.substring(0, 50),
              fullPath: text,
              filePath: filePath,
              fileName: fileName,
              nodeUid: node.data.uid || node.uid || '',
              isDir: false,
              isNode: true
            })
          }
          if (node.children && node.children.length > 0 && depth < 5) {
            node.children.forEach(child => walk(child, depth + 1))
          }
        }
        walk(rootData, 0)
      } catch (e) {}
    },

    // # 模式：过滤节点
    filterNodes(query) {
      if (!query || !query.trim()) {
        this.filteredFiles = this.allNodes.slice(0, 30)
      } else {
        const q = query.toLowerCase()
        this.filteredFiles = this.allNodes
          .filter(n => n.fullPath.toLowerCase().includes(q) || n.fileName.toLowerCase().includes(q))
          .slice(0, 30)
      }
      this.selectedIndex = 0
    },

    selectPrev() {
      if (this.selectedIndex > 0) {
        this.selectedIndex--
      }
    },

    selectNext() {
      if (this.selectedIndex < this.filteredFiles.length - 1) {
        this.selectedIndex++
      }
    },

    confirmSelection() {
      if (this.filteredFiles.length > 0 && this.selectedIndex >= 0) {
        this.selectFile(this.filteredFiles[this.selectedIndex])
      }
    },

    selectFile(file) {
      try {
        if (this.callback) {
          this.callback(file)
        }
      } catch (e) {
        console.error('插入引用失败:', e)
      } finally {
        this.hide()
      }
    },

    // 二开：#节点搜索 - 鼠标悬浮列表项时在右侧显示预览悬浮窗
    onItemMouseEnter(e, item, idx) {
      this.selectedIndex = idx
      // 仅 node 模式触发预览
      if (this.mode !== 'node' || !item.isNode) return
      // 防抖：鼠标在列表项间快速移动时，只预览最后停留的项
      if (this._hoverPreviewTimer) {
        clearTimeout(this._hoverPreviewTimer)
        this._hoverPreviewTimer = null
      }
      // 提前保存 rect，setTimeout 后 e.currentTarget 会变为 null
      const itemRect = e.currentTarget.getBoundingClientRect()
      this._hoverPreviewTimer = setTimeout(() => {
        this._hoverPreviewTimer = null
        this.showNodePreview(itemRect, item)
      }, 300)
    },

    onItemMouseLeave(e, item) {
      // 取消待执行的预览
      if (this._hoverPreviewTimer) {
        clearTimeout(this._hoverPreviewTimer)
        this._hoverPreviewTimer = null
      }
      // 延迟关闭预览，给鼠标移到预览窗留时间
      if (this._hidePreviewTimer) {
        clearTimeout(this._hidePreviewTimer)
      }
      this._hidePreviewTimer = setTimeout(() => {
        this.$bus.$emit('hide_file_preview')
        this._hidePreviewTimer = null
      }, 200)
    },

    // 显示节点预览悬浮窗（复用 FilePreviewOverlay）
    showNodePreview(itemRect, item) {
      if (this._hidePreviewTimer) {
        clearTimeout(this._hidePreviewTimer)
        this._hidePreviewTimer = null
      }
      // 计算预览窗位置：列表项右侧
      const pos = {
        x: itemRect.right + 8,
        y: itemRect.top,
        width: itemRect.width
      }
      // 防止超出屏幕右边（悬浮窗宽 360）
      if (pos.x + 360 > window.innerWidth - 10) {
        pos.x = itemRect.left - 368
      }
      this.$bus.$emit('show_file_preview', {
        filePath: item.filePath,
        nodeUid: item.nodeUid,
        pos,
        hoverPreview: true
      })
    }
  }
}
</script>

<style lang="less" scoped>
.fileMentionPopup {
  position: fixed;
  z-index: 2000;
  width: 280px;
  max-height: 320px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &.isDark {
    background: #262a2e;
    border-color: hsla(0, 0%, 100%, 0.1);

    .searchBox input {
      background-color: #262a2e;
      color: #fff;
      border-bottom-color: hsla(0, 0%, 100%, 0.1);

      &::placeholder {
        color: hsla(0, 0%, 100%, 0.3);
      }
    }

    .fileItem {
      color: hsla(0, 0%, 100%, 0.85);

      &:hover, &.active {
        background-color: hsla(0, 0%, 100%, 0.08);
      }

      .filePath {
        color: hsla(0, 0%, 100%, 0.3);
      }
    }

    .emptyTip {
      color: hsla(0, 0%, 100%, 0.3);
    }
  }

  .searchBox {
    padding: 8px 10px;
    border-bottom: 1px solid #f0f0f0;

    input {
      width: 100%;
      border: none;
      outline: none;
      font-size: 13px;
      padding: 4px 0;
      background: transparent;
      color: #333;
    }
  }

  .fileList {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
    max-height: 260px;

    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 2px;
    }
  }

  .fileItem {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
    color: #333;
    transition: background 0.15s;

    &:hover, &.active {
      background-color: #f5f7fa;
    }

    .fileIcon {
      margin-right: 6px;
      color: #909090;
      font-size: 14px;
      flex-shrink: 0;
    }

    .fileInfo {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .fileName {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .fileMeta {
      font-size: 11px;
      color: #409eff;
      margin-top: 2px;
    }

    .filePath {
      font-size: 11px;
      color: #b0b0b0;
      margin-top: 2px;
    }

    .previewHint {
      font-size: 10px;
      color: #409eff;
      margin-left: 6px;
      flex-shrink: 0;
      opacity: 0.7;
    }
  }

  .emptyTip {
    padding: 20px;
    text-align: center;
    color: #ccc;
    font-size: 13px;
  }
}
</style>
