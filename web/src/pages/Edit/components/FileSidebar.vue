<template>
  <div v-if="isElectron" class="fileSidebarWrapper" :class="{ isDark: isDark }">
    <!-- 展开的侧边栏 -->
    <transition name="slide">
      <div class="fileSidebar" v-show="!collapsed">
        <div class="header">
          <div class="actions">
            <el-tooltip content="打开文件" placement="bottom">
              <span
                class="actionBtn el-icon-folder-opened"
                @click="openFilePicker"
              ></span>
            </el-tooltip>
            <el-tooltip content="新建文件" placement="bottom">
              <span
                class="actionBtn el-icon-document-add"
                @click="createFileOnDesktop"
              ></span>
            </el-tooltip>
            <el-tooltip content="另存为" placement="bottom">
              <span
                class="actionBtn el-icon-document"
                @click="saveAs"
              ></span>
            </el-tooltip>
            <el-tooltip content="导入" placement="bottom">
              <span
                class="actionBtn el-icon-download"
                @click="importFile"
              ></span>
            </el-tooltip>
            <el-tooltip content="导出" placement="bottom">
              <span
                class="actionBtn el-icon-upload2"
                @click="exportFile"
              ></span>
            </el-tooltip>
            <el-tooltip content="添加文件夹" placement="bottom">
              <span
                class="actionBtn el-icon-folder-add"
                @click="addFolder"
              ></span>
            </el-tooltip>
            <el-tooltip content="刷新" placement="bottom">
              <span
                class="actionBtn el-icon-refresh"
                @click="refreshAll"
              ></span>
            </el-tooltip>
            <el-tooltip content="收起" placement="bottom">
              <span
                class="actionBtn el-icon-arrow-left"
                @click="collapsed = true"
              ></span>
            </el-tooltip>
          </div>
        </div>

        <div class="body customScrollbar">
          <!-- 最近打开 -->
          <div class="section" v-if="recentList.length > 0">
            <div class="sectionTitle" @click="recentExpand = !recentExpand">
              <span
                class="el-icon-arrow-down sectionArrow"
                :class="{ collapsed: !recentExpand }"
              ></span>
              最近打开
            </div>
            <div v-show="recentExpand" class="recentList">
              <div
                v-for="item in recentList"
                :key="item.path"
                class="recentItem"
                :class="{ active: item.path === currentFilePath }"
                @click="openRecent(item)"
              >
                <span class="el-icon-document fileIcon"></span>
                <span class="name" :title="item.path">{{ item.name }}</span>
                <span
                  class="el-icon-close removeBtn"
                  @click.stop="removeRecent(item)"
                ></span>
              </div>
            </div>
          </div>

          <!-- 文件夹树 -->
          <div class="section">
            <div class="sectionTitle">我的文件夹</div>
            <el-tree
              ref="fileTreeRef"
              :props="treeProps"
              :load="loadNode"
              lazy
              draggable
              :allow-drop="allowDrop"
              :allow-drag="() => true"
              node-key="path"
              :expand-on-click-node="true"
              @node-click="handleNodeClick"
              @node-drop="handleNodeDrop"
            >
              <div class="treeNode" slot-scope="{ data }">
                <span
                  class="nodeIcon el-icon-folder"
                  v-if="data.isDir"
                ></span>
                <span class="nodeIcon el-icon-document" v-else></span>
                <template v-if="data.path === inlineEditingPath">
                  <input
                    class="inlineEditInput"
                    v-model="inlineEditingValue"
                    @keyup.enter="confirmInlineEdit(data)"
                    @keyup.esc="cancelInlineEdit"
                    @blur="confirmInlineEdit(data)"
                    ref="inlineEditInputRef"
                  />
                </template>
                <template v-else>
                  <span
                    class="nodeName"
                    :class="{ active: data.path === currentFilePath }"
                    >{{ data.name }}</span
                  >
                  <span class="nodeActions">
                    <template v-if="data.isDir">
                      <el-tooltip content="新建文件" placement="top">
                        <span
                          class="el-icon-document-add"
                          @click.stop="createFile(data)"
                        ></span>
                      </el-tooltip>
                      <el-tooltip content="新建文件夹" placement="top">
                        <span
                          class="el-icon-folder-add"
                          @click.stop="createDir(data)"
                        ></span>
                      </el-tooltip>
                    </template>
                    <el-tooltip content="重命名" placement="top">
                      <span
                        class="el-icon-edit-outline"
                        @click.stop="startRename(data)"
                      ></span>
                    </el-tooltip>
                    <el-tooltip content="删除" placement="top">
                      <span
                        class="el-icon-delete"
                        @click.stop="removeNode(data)"
                      ></span>
                    </el-tooltip>
                    <el-tooltip
                      v-if="data.isDir && data.isRoot"
                      content="从列表移除"
                      placement="top"
                    >
                      <span
                        class="el-icon-circle-close"
                        @click.stop="removeRootFolder(data)"
                      ></span>
                    </el-tooltip>
                  </span>
                </template>
              </div>
            </el-tree>
            <div v-if="folderRoots.length === 0" class="emptyTip">
              点击上方"添加文件夹"，选择一个包含思维导图文件的文件夹
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 收起后的边缘展开按钮 -->
    <div
      class="expandBtn"
      v-show="collapsed"
      @click="collapsed = false"
      title="展开文件目录"
    >
      <span class="el-icon-arrow-right"></span>
    </div>

    <!-- 重命名弹窗 -->
    <el-dialog
      title="重命名"
      :visible.sync="renameDialogVisible"
      width="360px"
      append-to-body
    >
      <el-input v-model="renameValue" @keyup.enter.native="confirmRename" />
      <span slot="footer">
        <el-button @click="renameDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmRename">确定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import { getData } from '@/api'
import { getFs, isWebMode } from '@/utils/webFs'

const fs = getFs()

const RECENT_KEY = 'ZMIND_RECENT_FILES'
const ROOTS_KEY = 'ZMIND_FOLDER_ROOTS'

// 支持加载的文件扩展名（二开）：smm/json 为思维导图数据，md 走解析导入
const SUPPORT_EXT_REG = /\.(smm|json|md)$/i
const isSupportFile = name => SUPPORT_EXT_REG.test(name || '')

// 新思维导图文件的默认内容
const defaultFileContent = () =>
  JSON.stringify({
    data: {
      text: '根节点'
    },
    children: []
  })

export default {
  name: 'FileSidebar',
  data() {
    return {
      isElectron: typeof window !== 'undefined' && (!!window.zmindFs || isWebMode()),
      isWeb: typeof window !== 'undefined' && isWebMode(),
      collapsed: false,
      recentExpand: true,
      recentList: [],
      folderRoots: [],
      treeProps: {
        label: 'name',
        isLeaf: data => !data.isDir
      },
      renameDialogVisible: false,
      renameValue: '',
      renamingNode: null,
      saveTimer: null,
      inlineEditingPath: '',
      inlineEditingValue: '',
      pendingOpenPath: ''
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      currentFilePath: state => state.currentFilePath
    })
  },
  created() {
    if (!this.isElectron) return
    this.loadLocalData()
    // 网页模式：自动添加桌面路径作为根目录
    if (this.isWeb && this.folderRoots.length === 0) {
      fs.getDesktopPath().then(desktop => {
        if (desktop && !this.folderRoots.includes(desktop)) {
          this.folderRoots.push(desktop)
          this.saveLocalData()
        }
      }).catch(() => {})
    }
    // 数据变化时自动保存到当前文件
    this.$bus.$on('data_change', this.onDataChange)
    // 局域网同步：刷新最近文件和目录树
    this.$bus.$on('lanSyncFileState', this.onLanSyncFileState)
  },
  beforeDestroy() {
    if (!this.isElectron) return
    this.$bus.$off('data_change', this.onDataChange)
    this.$bus.$off('lanSyncFileState', this.onLanSyncFileState)
    clearTimeout(this.saveTimer)
  },
  methods: {
    ...mapMutations(['setCurrentFilePath']),

    // 另存为：将当前思维导图数据保存到新文件
    async saveAs() {
      try {
        const data = this.$bus.mindMap ? this.$bus.mindMap.getData(true) : null
        if (!data) {
          this.$message.warning('没有可保存的数据')
          return
        }
        const content = JSON.stringify({ root: data.root, layout: data.layout, theme: data.theme })
        let filePath
        if (this.isWeb) {
          const result = await this.$prompt('请输入保存路径', '另存为', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            inputPlaceholder: '例如：C:\\Users\\Desktop\\新思维导图.smm'
          })
          filePath = result.value
        } else {
          const desktop = await fs.getDesktopPath()
          filePath = this.joinPath(desktop, '新思维导图.smm')
        }
        if (!filePath) return
        if (!/\.(smm|json)$/i.test(filePath)) filePath += '.smm'
        const target = await fs.createFile(filePath, content)
        this.$message.success('已保存：' + target.split(/[\\/]/).pop())
        await this.openFile(target, target.split(/[\\/]/).pop())
        this.refreshTree()
      } catch (e) {
        console.log(e)
        if (e !== 'cancel') this.$message.error('保存失败')
      }
    },

    // 导入：触发导入流程
    importFile() {
      this.$bus.$emit('showImport')
    },

    // 打开文件：通过文件选择器打开 .smm/.json/.md 文件
    openFilePicker() {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.smm,.json,.md'
      input.onchange = async () => {
        const file = input.files[0]
        if (!file) return
        try {
          const content = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsText(file)
          })
          if (/\.md$/i.test(file.name)) {
            const markdown = await import('simple-mind-map/src/parse/markdown.js')
            const list = markdown.default.transformMarkdownToList(content)
            if (!list || list.length === 0) throw new Error('empty')
            const data = list.length === 1 ? list[0] : { data: { text: file.name }, children: list }
            this.$bus.$emit('setData', data)
            this.setCurrentFilePath('')
          } else {
            const data = JSON.parse(content)
            if (!data.root) data = { root: data }
            this.$bus.$emit('setData', data)
            this.setCurrentFilePath('')
          }
          this.$message.success('已打开：' + file.name)
        } catch (e) {
          console.log(e)
          this.$message.error('打开失败：文件格式不正确')
        }
      }
      input.click()
    },

    // 导出：触发导出对话框
    exportFile() {
      this.$bus.$emit('showExport')
    },

    loadLocalData() {
      try {
        this.recentList = JSON.parse(
          localStorage.getItem(RECENT_KEY) || '[]'
        )
        this.folderRoots = JSON.parse(localStorage.getItem(ROOTS_KEY) || '[]')
      } catch (e) {
        this.recentList = []
        this.folderRoots = []
      }
    },

    saveLocalData() {
      localStorage.setItem(RECENT_KEY, JSON.stringify(this.recentList))
      localStorage.setItem(ROOTS_KEY, JSON.stringify(this.folderRoots))
      // 通知 Edit.vue 触发局域网同步
      this.$bus.$emit('lanFileStateChanged')
    },

    // 局域网同步：从 localStorage 重新加载最近文件和目录树
    onLanSyncFileState() {
      this.loadLocalData()
      this.refreshAll()
    },

    // ============ 文件夹根节点管理 ============
    async addFolder() {
      let dir
      if (this.isWeb) {
        // 网页模式：手动输入路径
        const h = this.$createElement
        try {
          const result = await this.$prompt('请输入文件夹路径', '添加文件夹', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            inputPlaceholder: '例如：C:\\Users\\Desktop\\我的思维导图'
          })
          dir = result.value
        } catch (e) {
          return
        }
        if (!dir) return
        const exists = await fs.exists(dir)
        if (!exists) {
          this.$message.error('路径不存在')
          return
        }
      } else {
        dir = await fs.selectFolder()
      }
      if (!dir) return
      if (!this.folderRoots.includes(dir)) {
        this.folderRoots.push(dir)
        this.saveLocalData()
      }
      this.refreshTree()
    },

    // 顶部"新建文件"按钮：在桌面创建新 .smm 文件并打开
    async createFileOnDesktop() {
      try {
        const desktop = await fs.getDesktopPath()
        if (!desktop) {
          this.$message.error('无法获取桌面路径')
          return
        }
        const filePath = this.joinPath(desktop, '新建思维导图.smm')
        const target = await fs.createFile(filePath, defaultFileContent())
        // 桌面不在 folderRoots 里则自动添加，让用户在目录树看到
        if (!this.folderRoots.includes(desktop)) {
          this.folderRoots.push(desktop)
          this.saveLocalData()
        }
        this.refreshTree()
        this.pendingOpenPath = target
        this.startInlineEdit(target, target.split(/[\\/]/).pop())
      } catch (e) {
        console.log(e)
        this.$message.error('创建失败')
      }
    },

    removeRootFolder(data) {
      this.folderRoots = this.folderRoots.filter(p => p !== data.path)
      this.saveLocalData()
      this.refreshTree()
    },

    refreshAll() {
      this.refreshTree()
    },

    refreshTree() {
      const tree = this.$refs.fileTreeRef
      if (tree) {
        // 清空懒加载缓存并重新加载根
        tree.store.setData([])
        this.rootNodesDirty = true
        this.$nextTick(() => {
          this.loadRootNodes(tree)
        })
      }
    },

    // 仅重载父节点的子树，保持其他节点展开状态不变
    reloadParentNode(data) {
      const tree = this.$refs.fileTreeRef
      if (!tree) return
      const parentPath = data.path.slice(0, data.path.length - data.name.length)
      // 尝试找到父节点
      const parentNode = tree.getNode(parentPath)
      if (parentNode) {
        parentNode.loaded = false
        parentNode.loadData(() => {})
      } else {
        // 如果找不到父节点（可能是根节点），刷新整棵树
        this.refreshTree()
      }
    },

    // el-tree 懒加载
    async loadNode(node, resolve) {
      try {
        if (node.level === 0) {
          // 校验根文件夹是否还存在
          const validRoots = []
          for (const p of this.folderRoots) {
            if (await fs.exists(p)) {
              validRoots.push(p)
            }
          }
          if (validRoots.length !== this.folderRoots.length) {
            this.folderRoots = validRoots
            this.saveLocalData()
          }
          return resolve(
            validRoots.map(p => ({
              name: p.split(/[\\/]/).pop(),
              path: p,
              isDir: true,
              isRoot: true
            }))
          )
        }
        if (!node.data.isDir) return resolve([])
        const list = await fs.listDir(node.data.path)
        // 只显示文件夹和支持加载的文件，不支持的文件直接隐藏
        resolve(
          (list || []).filter(item => item.isDir || isSupportFile(item.name))
        )
      } catch (e) {
        console.log(e)
        resolve([])
      }
    },

    loadRootNodes(tree) {
      // 触发根节点重新加载
      tree.store.load && tree.root.loaded === false
      // 简单方式：直接更新根数据
      this.loadNode({ level: 0 }, data => {
        tree.store.setData(data)
      })
    },

    // ============ 打开文件 ============
    async handleNodeClick(data) {
      if (data.isDir) return
      await this.openFile(data.path, data.name)
    },

    async openRecent(item) {
      const exist = await fs.exists(item.path)
      if (!exist) {
        this.$message.warning('文件不存在，可能已被移动或删除')
        this.removeRecent(item)
        return
      }
      await this.openFile(item.path, item.name)
    },

    async openFile(filePath, name) {
      // 不支持的文件类型直接提示，不进入加载流程
      if (!isSupportFile(filePath)) {
        this.$message.warning('不支持加载此文件')
        return
      }
      try {
        const content = await fs.readFile(filePath)
        let data
        if (/\.md$/i.test(filePath)) {
          // markdown 文件走解析导入
          const markdown = await import(
            'simple-mind-map/src/parse/markdown.js'
          )
          const list = markdown.default.transformMarkdownToList(content)
          if (!list || list.length === 0) throw new Error('empty')
          data =
            list.length === 1
              ? list[0]
              : { data: { text: name }, children: list }
          this.$bus.$emit('setData', data)
          // md 文件不做为当前编辑文件（避免覆盖原 md）
          this.setCurrentFilePath('')
        } else {
          data = JSON.parse(content)
          if (typeof data !== 'object' || data === null) throw new Error('format')
          if (!data.root) {
            data = { root: data }
          }
          // 校验根节点结构，不符合思维导图格式直接提示
          if (
            !data.root.data ||
            typeof data.root.data.text === 'undefined'
          ) {
            throw new Error('format')
          }
          this.$bus.$emit('setData', data)
          this.setCurrentFilePath(filePath)
        }
        this.addRecent(filePath, name)
      } catch (e) {
        console.log(e)
        this.$message.error('不支持加载此文件或文件内容有误')
      }
    },

    // ============ 最近打开 ============
    addRecent(filePath, name) {
      this.recentList = [
        { path: filePath, name, time: Date.now() },
        ...this.recentList.filter(item => item.path !== filePath)
      ].slice(0, 15)
      this.saveLocalData()
    },

    removeRecent(item) {
      this.recentList = this.recentList.filter(i => i.path !== item.path)
      this.saveLocalData()
    },

    // ============ 自动保存 ============
    onDataChange() {
      if (!this.currentFilePath) return
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(async () => {
        try {
          const data = getData()
          await fs.writeFile(
            this.currentFilePath,
            JSON.stringify(data)
          )
        } catch (e) {
          console.log(e)
        }
      }, 800)
    },

    // ============ 新建/重命名/删除/移动 ============
    async createFile(dirData) {
      try {
        const target = await fs.createFile(
          this.joinPath(dirData.path, '新建思维导图.smm'),
          defaultFileContent()
        )
        this.refreshNode(dirData)
        this.pendingOpenPath = target
        this.startInlineEdit(target, target.split(/[\\/]/).pop())
      } catch (e) {
        console.log(e)
        this.$message.error('创建失败')
      }
    },

    async createDir(dirData) {
      try {
        const target = await fs.mkdir(this.joinPath(dirData.path, '新建文件夹'))
        this.refreshNode(dirData)
        this.startInlineEdit(target, target.split(/[\\/]/).pop())
      } catch (e) {
        console.log(e)
        this.$message.error('创建文件夹失败')
      }
    },

    // 开始内联编辑（新建文件/文件夹后自动进入）
    startInlineEdit(filePath, defaultName) {
      this.inlineEditingPath = filePath
      this.inlineEditingValue = defaultName
      // 树懒加载后需要等待渲染完成才能找到input
      const tryFocus = (attempts) => {
        if (attempts > 30) return
        this.$nextTick(() => {
          const input = this.$refs.inlineEditInputRef
          const el = Array.isArray(input) ? input[0] : input
          if (el) {
            el.focus()
            el.select()
          } else {
            setTimeout(() => tryFocus(attempts + 1), 100)
          }
        })
      }
      tryFocus(0)
    },

    // 确认内联编辑
    async confirmInlineEdit(data) {
      if (!this.inlineEditingPath) return
      const newName = (this.inlineEditingValue || '').trim()
      const oldPath = this.inlineEditingPath
      const oldName = data.name
      // 清除编辑状态
      this.inlineEditingPath = ''
      this.inlineEditingValue = ''
      if (!newName || newName === oldName) {
        // 名字没变，如果是文件则直接打开
        if (!data.isDir && this.pendingOpenPath === oldPath) {
          this.pendingOpenPath = ''
          await this.openFile(oldPath, oldName)
        }
        return
      }
      if (/[\\/:*?"<>|]/.test(newName)) {
        this.$message.warning('名称不能包含 \\ / : * ? " < > | 字符')
        if (!data.isDir && this.pendingOpenPath === oldPath) {
          this.pendingOpenPath = ''
          await this.openFile(oldPath, oldName)
        }
        return
      }
      try {
        const parentDir = oldPath.slice(0, oldPath.length - oldName.length)
        let finalName = newName
        if (!data.isDir) {
          const ext = oldName.slice(oldName.lastIndexOf('.'))
          if (!finalName.endsWith(ext)) finalName += ext
        }
        const newPath = await fs.rename(oldPath, parentDir + finalName)
        this.reloadParentNode(data)
        // 如果是待打开的文件，现在用新路径打开
        if (!data.isDir && this.pendingOpenPath === oldPath) {
          this.pendingOpenPath = ''
          await this.openFile(newPath, finalName)
          this.$message.success('已创建：' + finalName)
        }
      } catch (e) {
        console.log(e)
        this.$message.error('重命名失败：' + (e.message || ''))
        // 失败也尝试打开原文件
        if (!data.isDir && this.pendingOpenPath === oldPath) {
          this.pendingOpenPath = ''
          await this.openFile(oldPath, oldName)
        }
      }
    },

    // 取消内联编辑
    cancelInlineEdit() {
      const oldPath = this.inlineEditingPath
      this.inlineEditingPath = ''
      this.inlineEditingValue = ''
      // 如果是待打开的文件，取消编辑也直接打开
      if (oldPath && this.pendingOpenPath === oldPath) {
        this.pendingOpenPath = ''
        const name = oldPath.split(/[\\/]/).pop()
        this.openFile(oldPath, name)
      }
    },

    startRename(data) {
      this.renamingNode = data
      this.renameValue = data.name
      this.renameDialogVisible = true
    },

    async confirmRename() {
      const newName = (this.renameValue || '').trim()
      if (!newName || newName === this.renamingNode.name) {
        this.renameDialogVisible = false
        return
      }
      if (/[\\/:*?"<>|]/.test(newName)) {
        this.$message.warning('名称不能包含 \\ / : * ? " < > | 字符')
        return
      }
      try {
        const data = this.renamingNode
        const parentDir = data.path.slice(0, data.path.length - data.name.length)
        let finalName = newName
        // 文件需要保留扩展名
        if (!data.isDir) {
          const ext = data.name.slice(data.name.lastIndexOf('.'))
          if (!finalName.endsWith(ext)) finalName += ext
        }
        const newPath = await fs.rename(
          data.path,
          parentDir + finalName
        )
        if (this.currentFilePath === data.path) {
          this.setCurrentFilePath(newPath)
        }
        this.renameDialogVisible = false
        this.reloadParentNode(data)
      } catch (e) {
        console.log(e)
        this.$message.error('重命名失败：' + (e.message || ''))
      }
    },

    async removeNode(data) {
      try {
        await this.$confirm(
          `确定删除"${data.name}"吗？（移入回收站）`,
          '删除确认',
          { type: 'warning' }
        )
      } catch (e) {
        return
      }
      try {
        await fs.remove(data.path)
        if (this.currentFilePath === data.path) {
          this.setCurrentFilePath('')
        }
        // 局部刷新父目录，保持其他目录的展开状态不变
        const tree = this.$refs.fileTreeRef
        if (tree) {
          const node = tree.getNode(data.path)
          if (node && node.parent && node.parent.data && node.parent.data.path) {
            this.refreshNode(node.parent.data)
          } else {
            this.refreshTree()
          }
        } else {
          this.refreshTree()
        }
        this.$message.success('已删除')
      } catch (e) {
        console.log(e)
        this.$message.error('删除失败')
      }
    },

    // 拖拽移动
    allowDrop(draggingNode, dropNode, type) {
      // 只允许移动到文件夹内部
      if (type !== 'inner') return false
      return dropNode.data.isDir
    },

    async handleNodeDrop(draggingNode, dropNode, dropType) {
      if (dropType !== 'inner' || !dropNode.data.isDir) {
        this.refreshTree()
        return
      }
      try {
        const newPath = await fs.move(
          draggingNode.data.path,
          dropNode.data.path
        )
        if (this.currentFilePath === draggingNode.data.path) {
          this.setCurrentFilePath(newPath)
        }
        this.$message.success('已移动')
        // 刷新源和目标父节点，保持其他展开状态
        this.refreshNode(dropNode.data)
        if (draggingNode.parent && draggingNode.parent.data && draggingNode.parent.data.path !== dropNode.data.path) {
          this.refreshNode(draggingNode.parent.data)
        }
      } catch (e) {
        console.log(e)
        this.$message.error('移动失败：' + (e.message || ''))
      }
    },

    // 刷新某个文件夹节点的子节点
    refreshNode(dirData) {
      const tree = this.$refs.fileTreeRef
      if (!tree) return
      const node = tree.getNode(dirData.path)
      if (node) {
        node.loaded = false
        node.expand()
      } else {
        this.refreshTree()
      }
    },

    joinPath(dir, name) {
      const sep = dir.includes('\\') ? '\\' : '/'
      return dir.replace(/[\\/]+$/, '') + sep + name
    }
  }
}
</script>

<style lang="less" scoped>
.fileSidebarWrapper {
  .fileSidebar {
    position: fixed;
    left: 0;
    top: 72px;
    bottom: 0;
    width: 250px;
    background: rgba(245, 245, 247, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-right: 1px solid rgba(0, 0, 0, 0.06);
    z-index: 1600;
    display: flex;
    flex-direction: column;
    border-radius: 0 16px 16px 0;
  }

  .header {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    border-bottom: 1px solid #f0f0f0;
    flex-shrink: 0;

    .actions {
      display: flex;
      gap: 12px;

      .actionBtn {
        cursor: pointer;
        color: #666;
        font-size: 16px;

        &:hover {
          color: #409eff;
        }
      }
    }
  }

  .body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;

    // 树组件背景融入侧边栏
    /deep/ .el-tree {
      background: transparent;

      .el-tree-node__content {
        &:hover {
          background: #ebebef;
        }
      }

      .el-tree-node:focus > .el-tree-node__content {
        background: #ebebef;
      }
    }

    .section {
      margin-bottom: 8px;
    }

    .sectionTitle {
      padding: 6px 12px;
      font-size: 12px;
      color: #999;
      cursor: pointer;
      user-select: none;

      .sectionArrow {
        transition: transform 0.2s;
        &.collapsed {
          transform: rotate(-90deg);
        }
      }
    }
  }

  .recentList {
    .recentItem {
      display: flex;
      align-items: center;
      padding: 6px 12px 6px 24px;
      cursor: pointer;
      font-size: 13px;
      color: #333;

      &:hover {
        background: #ebebef;

        .removeBtn {
          visibility: visible;
        }
      }

      &.active {
        color: #409eff;
        background: #e3edfb;
      }

      .fileIcon {
        margin-right: 6px;
        color: #909090;
      }

      .name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .removeBtn {
        visibility: hidden;
        color: #c0c4cc;
        &:hover {
          color: #f56c6c;
        }
      }
    }
  }

  .treeNode {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    font-size: 13px;

    .nodeIcon {
      margin-right: 5px;
      color: #909090;
    }

    .inlineEditInput {
      flex: 1;
      min-width: 0;
      border: 1px solid #409eff;
      border-radius: 3px;
      padding: 2px 4px;
      font-size: 13px;
      outline: none;
      background: #fff;
      color: #333;
    }

    .nodeName {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &.active {
        color: #409eff;
      }
    }

    .nodeActions {
      display: none;
      margin-left: 4px;

      span {
        margin-right: 6px;
        color: #909090;

        &:hover {
          color: #409eff;
        }
      }
    }

    &:hover .nodeActions {
      display: inline-flex;
    }
  }

  .emptyTip {
    padding: 12px;
    font-size: 12px;
    color: #c0c4cc;
    line-height: 1.6;
  }

  .expandBtn {
    position: fixed;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 60px;
    background: rgba(245, 245, 247, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-left: none;
    border-radius: 0 12px 12px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1600;
    color: #909090;

    &:hover {
      color: #409eff;
      width: 22px;
    }
  }

  &.isDark {
    .fileSidebar {
      background: #262a2e;
      border-right-color: hsla(0, 0%, 100%, 0.1);
    }
    .body /deep/ .el-tree {
      .el-tree-node__content {
        &:hover {
          background: hsla(0, 0%, 100%, 0.05);
        }
      }
      .el-tree-node:focus > .el-tree-node__content {
        background: hsla(0, 0%, 100%, 0.05);
      }
    }
    .header .title {
      color: #fff;
    }
    .body .sectionTitle {
      color: hsla(0, 0%, 100%, 0.4);
    }
    .recentList .recentItem {
      color: hsla(0, 0%, 100%, 0.8);
      &:hover {
        background: hsla(0, 0%, 100%, 0.05);
      }
      &.active {
        background: rgba(64, 158, 255, 0.15);
      }
    }
    .treeNode {
      color: hsla(0, 0%, 100%, 0.8);
      .inlineEditInput {
        background: #363b3f;
        color: #fff;
        border-color: #409eff;
      }
    }
    .expandBtn {
      background: #262a2e;
      border-color: hsla(0, 0%, 100%, 0.1);
      color: hsla(0, 0%, 100%, 0.6);
    }
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.slide-enter,
.slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
</style>
