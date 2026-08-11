<template>
  <div class="filePreviewFloat" v-if="visible" :style="floatStyle" @click.stop>
    <!-- 悬浮窗头部（hover 预览模式不显示操作按钮） -->
    <div class="floatHeader" v-if="!hoverPreview">
      <span class="floatTitle" :title="fileName">{{ fileName || '文件预览' }}</span>
      <div class="floatActions" v-if="!hoverPreview">
        <el-button size="mini" type="primary" @click="goEdit" title="在主窗口打开此文件">
          <span class="el-icon-edit"></span>
          去编辑
        </el-button>
        <el-button size="mini" @click="close" title="关闭">
          <span class="el-icon-close"></span>
        </el-button>
      </div>
    </div>
    <!-- 悬浮窗主体：渲染被引用文件的思维导图 -->
    <div class="floatBody" ref="floatBodyRef">
      <div class="floatLoading" v-if="loading">
        <i class="el-icon-loading"></i>
        <span>加载中...</span>
      </div>
      <div class="floatError" v-else-if="error">
        <i class="el-icon-warning-outline"></i>
        <span>{{ error }}</span>
      </div>
      <div class="mindMapContainer" v-if="!loading && !error" ref="mindMapContainerRef"></div>
    </div>
    <!-- 悬浮窗指向节点的小三角 -->
    <div class="floatArrow" :style="arrowStyle" v-if="showArrow"></div>
  </div>
</template>

<script>
import MindMap from 'simple-mind-map'
import { getFs } from '@/utils/webFs'

const fs = getFs()

export default {
  data() {
    return {
      visible: false,
      filePath: '',
      fileName: '',
      nodeUid: '',
      loading: false,
      error: '',
      previewMindMap: null,
      // 悬浮窗位置（跟随被点击的节点）
      posX: 0,
      posY: 0,
      showArrow: false,
      // outside click 关闭监听
      outsideClickHandler: null,
      // hover 预览模式（#节点搜索时）：不启用 outside-click
      hoverPreview: false
    }
  },
  computed: {
    // 悬浮窗样式：跟随节点位置
    floatStyle() {
      // 悬浮窗固定宽高（缩小，避免遮挡太多内容），通过 left/top 定位
      const w = 360
      const h = 280
      let left = this.posX
      let top = this.posY
      // 防止超出屏幕右边
      if (left + w > window.innerWidth - 10) {
        left = window.innerWidth - w - 10
      }
      // 防止超出屏幕左边
      if (left < 10) left = 10
      // 防止超出屏幕底部
      if (top + h > window.innerHeight - 10) {
        top = window.innerHeight - h - 10
      }
      // 防止超出屏幕顶部
      if (top < 10) top = 10
      return {
        left: left + 'px',
        top: top + 'px',
        width: w + 'px',
        height: h + 'px'
      }
    },
    // 小三角指向被点击节点
    arrowStyle() {
      const arrowLeft = this.posX - parseFloat(this.floatStyle.left)
      return {
        left: Math.max(8, arrowLeft) + 'px'
      }
    }
  },
  created() {
    this.$bus.$on('show_file_preview', this.show)
    this.$bus.$on('hide_file_preview', this.close)
  },
  beforeDestroy() {
    this.$bus.$off('show_file_preview', this.show)
    this.$bus.$off('hide_file_preview', this.close)
    this.removeOutsideClick()
    this.destroyPreviewMindMap()
  },
  methods: {
    async show(data) {
      this.filePath = data.filePath || ''
      this.fileName = data.filePath ? data.filePath.split(/[\\/]/).pop() : '文件预览'
      this.nodeUid = data.nodeUid || ''
      // hoverPreview 模式（#节点搜索 hover 预览）：不启用 outside-click，由调用方控制开关
      this.hoverPreview = !!data.hoverPreview
      // 定位悬浮窗：节点下方，左对齐节点
      const pos = data.pos
      if (pos && typeof pos.x === 'number') {
        this.posX = pos.x
        this.posY = pos.y + 8 // 节点下方 8px
        this.showArrow = true
      } else {
        // 没有坐标信息，居中显示
        this.posX = window.innerWidth / 2 - 260
        this.posY = window.innerHeight / 2 - 190
        this.showArrow = false
      }
      this.visible = true
      this.loading = true
      this.error = ''
      // 非 hover 预览模式才注册 outside click 关闭
      if (!this.hoverPreview) {
        this.$nextTick(() => {
          this.addOutsideClick()
        })
      }
      await this.loadAndRender()
    },

    // outside click 关闭悬浮窗（capture 阶段）
    addOutsideClick() {
      this.removeOutsideClick()
      this.outsideClickHandler = (e) => {
        const el = this.$el
        if (el && !el.contains(e.target)) {
          this.close()
        }
      }
      document.addEventListener('mousedown', this.outsideClickHandler, true)
    },
    removeOutsideClick() {
      if (this.outsideClickHandler) {
        document.removeEventListener('mousedown', this.outsideClickHandler, true)
        this.outsideClickHandler = null
      }
    },

    async loadAndRender() {
      try {
        if (!this.filePath) {
          this.error = '文件路径为空'
          this.loading = false
          return
        }
        const exists = await fs.exists(this.filePath)
        if (!exists) {
          this.error = '被引用的文件已删除，无法查看。'
          this.loading = false
          this.$message && this.$message.warning('被引用的文件已删除，无法查看')
          return
        }
        const content = await fs.readFile(this.filePath)
        let data
        if (/\.md$/i.test(this.filePath)) {
          const markdown = await import('simple-mind-map/src/parse/markdown.js')
          const list = markdown.default.transformMarkdownToList(content)
          if (!list || list.length === 0) throw new Error('empty')
          data = list.length === 1
            ? list[0]
            : { data: { text: '导入' }, children: list }
        } else {
          data = JSON.parse(content)
          if (!data.root) {
            data = { root: data }
          }
        }
        this.loading = false
        this.$nextTick(() => {
          this.createPreviewMindMap(data)
          // 缩放 0.4 已在 createPreviewMindMap 内通过 node_tree_render_end 监听设置
          // （fit:true 的 fit 回调会覆盖同步 setScale，必须在渲染完成后再次设置）
          // 如果有 nodeUid，等渲染完成后高亮节点
          if (this.nodeUid) {
          setTimeout(() => this.highlightNode(), 800)
          }
        })
      } catch (e) {
        console.error(e)
        this.error = '被引用的文件或节点已删除，无法查看。'
        this.loading = false
      }
    },

    createPreviewMindMap(data, retries = 8) {
      this.destroyPreviewMindMap()
      const container = this.$refs.mindMapContainerRef
      // 容器不存在或尺寸为 0 时等待重试（v-if 刚创建，flex 布局可能延迟计算尺寸）
      if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
        if (retries > 0) {
          setTimeout(() => this.createPreviewMindMap(data, retries - 1), 100)
          return
        }
        this.error = '预览容器未就绪，请重试'
        return
      }
      try {
        this.previewMindMap = new MindMap({
          el: container,
          data: data.root || data,
          fit: true,
          readonly: true,
          layout: 'logicalStructure',
          theme: 'default',
          nodeTextEditZIndex: 1000,
          expandBtnSize: 20,
          showExpandBtn: true,
          // 二开：与主思维导图一致，使用右键/中键拖动（而非左键）
          useLeftKeySelectionRightKeyDrag: true
        })
        // 二开：fit:true 会在初始渲染回调里调 view.fit()（内部 setScale 适配缩放），
        // 会覆盖任何同步设置的缩放。而 onRenderEnd 先跑回调再 emit node_tree_render_end，
        // 故在此监听 node_tree_render_end（fit 回调之后）再 setScale(0.4)，确保期望缩放最终生效，
        // 同时保留 fit 的居中定位。若有 nodeUid，由 highlightNode 负责移动节点到中央。
        const applyPreviewScale = () => {
          if (!this.previewMindMap) return
          this.previewMindMap.off('node_tree_render_end', applyPreviewScale)
          try {
            this.previewMindMap.view.setScale(0.4)
          } catch (e) {}
        }
        this.previewMindMap.on('node_tree_render_end', applyPreviewScale)
      } catch (e) {
        console.error('创建预览 MindMap 失败:', e)
        this.error = '预览渲染失败：' + (e.message || '未知错误')
      }
    },

    destroyPreviewMindMap() {
      if (this.previewMindMap) {
        try {
          this.previewMindMap.destroy()
        } catch (e) {}
        this.previewMindMap = null
      }
    },

    // 高亮指定节点：移动到预览窗中央 + 闪烁节点本身
    highlightNode() {
      if (!this.previewMindMap || !this.nodeUid) return
      const root = this.previewMindMap.renderer.root
      if (!root) {
        this.error = '被引用的文件或节点已删除，无法查看。'
        this.$message && this.$message.warning('被引用的节点已删除，无法查看')
        return
      }
      const targetNode = this.findPreviewNodeByUid(this.nodeUid)
      if (!targetNode) {
        this.error = '被引用的节点已删除，无法查看。'
        this.$message && this.$message.warning('被引用的节点已删除，无法查看')
        return
      }
      // 展开父节点
      let parent = targetNode.parent
      while (parent) {
        if (!parent.getData('expand')) {
          parent.setData({ expand: true })
        }
        parent = parent.parent
      }
      // 等待展开渲染完成后一次性应用所有变换（无嵌套 setTimeout，避免缩放动画可见）
      const onRendered = () => {
        this.previewMindMap.off('node_tree_render_end', onRendered)
        clearTimeout(renderFallback)
        this.applyHighlightInstant(targetNode)
      }
      const renderFallback = setTimeout(() => {
        this.previewMindMap.off('node_tree_render_end', onRendered)
        this.applyHighlightInstant(targetNode)
      }, 500)
      this.previewMindMap.on('node_tree_render_end', onRendered)
    },

    // 即时应用高亮：移动到中心 + 闪烁（缩放 0.4 已在创建/全屏时预设，此处不再改）
    applyHighlightInstant(targetNode) {
      if (!this.previewMindMap) return
      try {
        // 移动节点到预览窗中央（同步执行，无动画）
        this.previewMindMap.renderer.moveNodeToCenter(targetNode)
        // 重新查找节点（重渲染后 group 可能变化），再次居中并闪烁
        const fresh = this.findPreviewNodeByUid(this.nodeUid)
        if (fresh) {
          this.previewMindMap.renderer.moveNodeToCenter(fresh)
          this.doHighlightInFloat(fresh)
        } else {
          this.doHighlightInFloat(targetNode)
        }
      } catch (e) {
        console.error('高亮节点失败:', e)
      }
    },

    // 在预览 MindMap 中按 uid 递归查找节点（highlightNode 与 doHighlightInFloat 共用）
    findPreviewNodeByUid(uid) {
      if (!uid || !this.previewMindMap || !this.previewMindMap.renderer || !this.previewMindMap.renderer.root) return null
      const findNode = (node, u) => {
        if (!node) return null
        if (node.uid === u || (node.getData && node.getData('uid') === u)) return node
        if (node.children) {
          for (const child of node.children) {
            const found = findNode(child, u)
            if (found) return found
          }
        }
        return null
      }
      return findNode(this.previewMindMap.renderer.root, uid)
    },

    // 在悬浮窗内高亮节点：和复习高亮一致的蓝色边框闪烁层（fixed div 覆盖在节点位置）
    doHighlightInFloat(node) {
      if (!node) return
      // 清除上一个高亮定时器/盒子
      if (this._floatBlinkTimer) { clearInterval(this._floatBlinkTimer); this._floatBlinkTimer = null }
      if (this._floatHighlightTimer) { clearTimeout(this._floatHighlightTimer); this._floatHighlightTimer = null }
      if (this._floatHighlightBox && this._floatHighlightBox.parentNode) {
        this._floatHighlightBox.parentNode.removeChild(this._floatHighlightBox)
        this._floatHighlightBox = null
      }
      // 重渲染后旧 node 可能失效，通过 uid 重新查找 fresh 节点
      let activeNode = node
      const fresh = this.findPreviewNodeByUid(this.nodeUid)
      if (fresh) activeNode = fresh
      if (!activeNode) return
      // 获取节点屏幕坐标（SVG.js v3: group.node 是 DOM <g> 元素）
      let rect = null
      try {
        if (activeNode.group) {
          const domEl = activeNode.group.node || activeNode.group
          if (domEl && typeof domEl.getBoundingClientRect === 'function') {
            rect = domEl.getBoundingClientRect()
          }
        }
      } catch (e) {}
      // 兜底：悬浮窗容器中心
      if (!rect || rect.width === 0 || rect.height === 0) {
        try {
          const container = this.previewMindMap && this.previewMindMap.el
          if (container) {
            const cr = container.getBoundingClientRect()
            rect = { left: cr.left + cr.width / 2 - 100, top: cr.top + cr.height / 2 - 30, width: 200, height: 60 }
          }
        } catch (e) {}
      }
      if (!rect) return
      // 创建蓝色边框闪烁层（与复习高亮 doHighlightNode 完全一致）
      const box = document.createElement('div')
      box.style.cssText = 'position:fixed;left:' + (rect.left - 6) + 'px;top:' + (rect.top - 6) + 'px;width:' + (rect.width + 12) + 'px;height:' + (rect.height + 12) + 'px;border:3px solid #0984e3;border-radius:8px;pointer-events:none;z-index:99999;box-shadow:0 0 15px rgba(9,132,227,0.5);opacity:1;'
      document.body.appendChild(box)
      this._floatHighlightBox = box
      // 闪烁 2 次，透明度 1↔0.2（二开：闪 2 次，总时长约 1 秒）
      let count = 0
      this._floatBlinkTimer = setInterval(() => {
        count++
        box.style.opacity = count % 2 === 0 ? '1' : '0.2'
        if (count >= 4) {
          clearInterval(this._floatBlinkTimer)
          this._floatBlinkTimer = null
          // 闪烁结束后 200ms 移除（总时长约 1 秒）
          this._floatHighlightTimer = setTimeout(() => {
            if (this._floatHighlightBox && this._floatHighlightBox.parentNode) {
              this._floatHighlightBox.parentNode.removeChild(this._floatHighlightBox)
              this._floatHighlightBox = null
            }
          }, 200)
        }
      }, 200)
    },

    goEdit() {
      this.$bus.$emit('file_mention_open_file', this.filePath)
      this.close()
    },

    close() {
      this.visible = false
      this.removeOutsideClick()
      this.destroyPreviewMindMap()
      // 清除悬浮窗内高亮
      if (this._floatHighlightBox && this._floatHighlightBox.parentNode) {
        this._floatHighlightBox.parentNode.removeChild(this._floatHighlightBox)
        this._floatHighlightBox = null
      }
      if (this._floatBlinkTimer) { clearInterval(this._floatBlinkTimer); this._floatBlinkTimer = null }
      if (this._floatHighlightTimer) { clearTimeout(this._floatHighlightTimer); this._floatHighlightTimer = null }
      this.filePath = ''
      this.fileName = ''
      this.nodeUid = ''
      this.error = ''
      this.loading = false
      this.showArrow = false
    }
  }
}
</script>

<style lang="less" scoped>
.filePreviewFloat {
  position: fixed;
  z-index: 5000;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: visible;

  .floatHeader {
    height: 38px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border-bottom: 1px solid #f0f0f0;
    background: #fafafa;
    border-radius: 10px 10px 0 0;

    .floatTitle {
      font-size: 12px;
      font-weight: 600;
      color: #333;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 240px;
    }

    .floatActions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
  }

  .floatBody {
    flex: 1;
    position: relative;
    overflow: hidden;
    border-radius: 0 0 10px 10px;
    // 二开：flex 子元素需要 min-width/min-height: 0 才能正确缩放（否则会被内容撑大）
    min-width: 0;
    min-height: 0;

    .floatLoading,
    .floatError {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #999;
      font-size: 13px;

      i {
        font-size: 28px;
      }
    }

    .floatError {
      color: #f56c6c;
    }

    .mindMapContainer {
      width: 100%;
      height: 100%;
      position: relative;
      // 二开：确保 SVG 元素能填满容器
      & > svg {
        width: 100% !important;
        height: 100% !important;
      }
    }
  }

  // 指向节点的小三角
  .floatArrow {
    position: absolute;
    top: -8px;
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-bottom: 8px solid #fff;
    filter: drop-shadow(0 -2px 2px rgba(0, 0, 0, 0.08));
  }
}
</style>
