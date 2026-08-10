<template>
  <el-tree
    ref="tree"
    class="outlineTree"
    node-key="uid"
    draggable
    default-expand-all
    :class="{ isDark: isDark }"
    :data="data"
    :props="defaultProps"
    :highlight-current="true"
    :expand-on-click-node="false"
    :allow-drag="checkAllowDrag"
    @node-drop="onNodeDrop"
    @node-drag-start="onNodeDragStart"
    @node-drag-end="onNodeDragEnd"
    @current-change="onCurrentChange"
    @mouseenter.native="isInTreArea = true"
    @mouseleave.native="isInTreArea = false"
  >
    <span
      class="customNode"
      slot-scope="{ node, data }"
      :data-id="data.uid"
      @click="onClick(data)"
    >
      <span
        class="nodeEdit"
        :contenteditable="!isReadonly"
        :key="getKey()"
        @keydown.stop="onNodeInputKeydown($event, node)"
        @keyup.stop
        @blur="onBlur($event, node)"
        @paste="onPaste($event, node)"
        v-html="node.label"
      ></span>
    </span>
  </el-tree>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import {
  nodeRichTextToTextWithWrap,
  textToNodeRichTextWithWrap,
  createUid,
  htmlEscape,
  handleInputPasteText,
  getTextFromHtml
} from 'simple-mind-map/src/utils'

// 挖空语法转换（二开功能）：富文本 HTML 中的挖空 span <-> [==文本==] 标记
const clozeSpanToMarker = html => {
  return html.replace(
    /<span[^>]*class=["'][^"']*smm-cloze[^"']*["'][^>]*>([\s\S]*?)<\/span>/g,
    (m, inner) => '[==' + getTextFromHtml(inner) + '==]'
  )
}
const markerToClozeSpan = html => {
  return html.replace(
    /\[==([\s\S]+?)==\]/g,
    '<span class="smm-cloze">$1</span>'
  )
}

// 大纲树
export default {
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      data: [],
      defaultProps: {
        label: 'label'
      },
      currentData: null,
      notHandleDataChange: false,
      isHandleNodeTreeRenderEnd: false,
      beInsertNodeUid: '',
      insertType: '',
      isInTreArea: false,
      isAfterCreateNewNode: false,
      // 文件加载后需重新展开所有树节点（el-tree default-expand-all 不在数据变更时重新生效）
      pendingExpandAll: false
    }
  },
  computed: {
    ...mapState({
      isReadonly: state => state.isReadonly,
      isDark: state => state.localConfig.isDark
    })
  },
  created() {
    window.addEventListener('keydown', this.onKeyDown)
    this.$bus.$on('data_change', this.handleDataChange)
    this.$bus.$on('node_tree_render_end', this.handleNodeTreeRenderEnd)
    this.$bus.$on('hide_text_edit', this.handleHideTextEdit)
    // 二开：文件加载后需重新展开所有大纲树节点
    this.$bus.$on('zmind_file_loaded', this.onFileLoaded)
  },
  mounted() {
    this.refresh()
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    this.$bus.$off('data_change', this.handleDataChange)
    this.$bus.$off('node_tree_render_end', this.handleNodeTreeRenderEnd)
    this.$bus.$off('hide_text_edit', this.handleHideTextEdit)
    this.$bus.$off('zmind_file_loaded', this.onFileLoaded)
  },
  methods: {
    ...mapMutations(['setIsDragOutlineTreeNode']),

    handleHideTextEdit() {
      if (this.notHandleDataChange) {
        this.notHandleDataChange = false
        this.refresh()
      }
    },

    handleDataChange() {
      // 在大纲里操作节点时不要响应该事件，否则会重新刷新树
      if (this.notHandleDataChange) {
        this.notHandleDataChange = false
        this.isAfterCreateNewNode = false
        return
      }
      if (this.isAfterCreateNewNode) {
        this.isAfterCreateNewNode = false
        return
      }
      this.refresh()
    },

    handleNodeTreeRenderEnd() {
      // 当前存在未完成的节点插入操作
      if (this.insertType) {
        this[this.insertType]()
        this.insertType = ''
        return
      }
      // 插入了新节点后需要做一些操作
      if (this.isHandleNodeTreeRenderEnd) {
        this.isHandleNodeTreeRenderEnd = false
        this.refresh()
        this.$nextTick(() => {
          this.afterCreateNewNode()
        })
      }
    },

    // 二开：文件加载完成事件 → 标记下次 refresh 后需展开所有节点
    onFileLoaded() {
      this.pendingExpandAll = true
    },

    // 保存当前 el-tree 的展开状态（记录展开节点的 uid 集合）
    saveTreeExpandState() {
      const tree = this.$refs.tree
      if (!tree) return null
      const expandedUids = new Set()
      const walk = node => {
        if (node && node.expanded && node.data && node.data.uid) {
          expandedUids.add(node.data.uid)
        }
        ;(node.childNodes || []).forEach(walk)
      }
      walk(tree.root)
      return expandedUids
    },

    // 恢复 el-tree 的展开状态
    restoreTreeExpandState(expandedUids) {
      if (!expandedUids || expandedUids.size === 0) return
      const tree = this.$refs.tree
      if (!tree) return
      const walk = node => {
        if (node && node.data && node.data.uid && expandedUids.has(node.data.uid)) {
          node.expanded = true
        }
        ;(node.childNodes || []).forEach(walk)
      }
      walk(tree.root)
    },

    // 展开所有树节点
    expandAllTreeNodes() {
      const tree = this.$refs.tree
      if (!tree) return
      const walk = node => {
        if (node) node.expanded = true
        ;(node.childNodes || []).forEach(walk)
      }
      walk(tree.root)
    },

    // 刷新树数据
    refresh() {
      // 二开：刷新前保存当前 el-tree 展开状态，刷新后恢复（避免数据变更导致展开状态丢失）
      const savedExpandState = this.saveTreeExpandState()
      let data = this.mindMap.getData()
      data.root = true // 标记根节点
      let walk = root => {
        // 挖空内容转为 [==文本==] 标记再提取纯文本（二开功能）
        // 兼容 smm-cloze span（已保存）和 <code> 标签（编辑中未退出）
        const rawText = root.data.text || ''
        const hasRichText = !!root.data.richText
        const hasClozeSpan = /<span[^>]*class=["'][^"']*smm-cloze/.test(rawText)
        const hasCodeTag = /<code\b[^>]*>/.test(rawText)
        let richHtml = ''
        if (hasRichText && (hasClozeSpan || hasCodeTag)) {
          const normalized = hasCodeTag && !hasClozeSpan
            ? rawText.replace(/<code\b([^>]*)>([\s\S]*?)<\/code>/gi, '<span class="smm-cloze">$2</span>')
            : rawText
          richHtml = clozeSpanToMarker(normalized)
        }
        // 三种情况：
        // 1. 有挖空标记 → 先转 [==text==] 再提取纯文本
        // 2. 富文本但无挖空 → 从原始 HTML 提取纯文本（修复 <p><span> 显示问题）
        // 3. 纯文本节点 → 直接使用原文
        let text
        if (richHtml) {
          text = nodeRichTextToTextWithWrap(richHtml)
        } else if (hasRichText) {
          text = getTextFromHtml(rawText)
        } else {
          text = rawText
        }
        text = htmlEscape(text)
        text = text.replace(/\n/g, '<br>')
        root.textCache = text // 保存一份修改前的数据，用于对比是否修改了
        root.label = text
        root.uid = root.data.uid
        if (root.children && root.children.length > 0) {
          root.children.forEach(item => {
            walk(item)
          })
        }
      }
      walk(data)
      this.data = [data]
      // 二开：恢复展开状态
      this.$nextTick(() => {
        if (this.pendingExpandAll) {
          // 文件加载后展开所有节点
          this.pendingExpandAll = false
          this.expandAllTreeNodes()
        } else {
          // 普通刷新：恢复刷新前的展开状态（用户手动收起/展开的状态不受影响）
          this.restoreTreeExpandState(savedExpandState)
        }
      })
    },

    // 插入了新节点之后
    afterCreateNewNode() {
      // 如果是新插入节点，那么需要手动高亮该节点、定位该节点及聚焦
      let id = this.beInsertNodeUid
      if (id && this.$refs.tree) {
        try {
          this.isAfterCreateNewNode = true
          // 高亮树节点
          this.$refs.tree.setCurrentKey(id)
          let node = this.$refs.tree.getNode(id)
          this.onCurrentChange(node.data)
          // 定位该节点
          this.onClick(node.data)
          // 聚焦该树节点的编辑框
          const el = document.querySelector(
            `.customNode[data-id="${id}"] .nodeEdit`
          )
          if (el) {
            let selection = window.getSelection()
            let range = document.createRange()
            range.selectNodeContents(el)
            selection.removeAllRanges()
            selection.addRange(range)
            let offsetTop = el.offsetTop
            this.$emit('scrollTo', offsetTop)
          }
        } catch (error) {
          console.log(error)
        }
      }
      this.beInsertNodeUid = ''
    },

    // 根节点不允许拖拽
    checkAllowDrag(node) {
      return !node.data.root
    },

    // 失去焦点更新节点文本
    onBlur(e, node) {
      // 节点数据没有修改
      if (node.data.textCache === e.target.innerHTML) {
        // 如果存在未执行的插入新节点操作，那么直接执行
        if (this.insertType) {
          this[this.insertType]()
          this.insertType = ''
        }
        return
      }
      const richText0 = !!node.data.data.richText
      const plainText = e.target.innerText || ''
      // 包含 [==文本==] 挖空语法时自动升级为富文本节点（二开功能）
      const needCloze = /\[==[\s\S]+?==\]/.test(plainText)
      const richText = richText0 || needCloze
      if (needCloze) {
        node.data.data.richText = true
      }
      // 否则插入新节点操作需要等待当前修改事件渲染完成后再执行
      const targetNode = this.mindMap.renderer.findNodeByUid(node.data.uid)
      if (!targetNode) return
      this.notHandleDataChange = true
      if (richText) {
        targetNode.setText(
          markerToClozeSpan(textToNodeRichTextWithWrap(e.target.innerHTML)),
          true
        )
      } else {
        targetNode.setText(plainText)
      }
      node.data.textCache = e.target.innerHTML
    },

    // 拦截粘贴事件
    onPaste(e) {
      handleInputPasteText(e)
    },

    // 生成唯一的key
    getKey() {
      return Math.random()
    },

    // 节点输入区域按键事件
    onNodeInputKeydown(e) {
      if (e.keyCode === 13 && !e.shiftKey) {
        // 插入兄弟节点
        e.preventDefault()
        this.insertType = 'insertNode'
        e.target.blur()
      }
      if (e.keyCode === 9) {
        e.preventDefault()
        if (e.shiftKey) {
          // Shift+Tab：节点升级（提升一级）
          this.insertType = 'promoteNode'
          e.target.blur()
        } else {
          // Tab：插入子节点
          this.insertType = 'insertChildNode'
          e.target.blur()
        }
      }
      // 箭头键：大纲节点间导航（上下左右跨节点）
      if (e.keyCode === 38 || e.keyCode === 40) {
        e.preventDefault()
        const flat = []
        const walkFlat = item => { flat.push(item); (item.children || []).forEach(walkFlat) }
        this.data[0] && walkFlat(this.data[0])
        const idx = flat.findIndex(item => item.uid === node.data.uid)
        if (e.keyCode === 38 && idx > 0) { this.focusNodeByUid(flat[idx - 1].uid); return }
        if (e.keyCode === 40 && idx < flat.length - 1) { this.focusNodeByUid(flat[idx + 1].uid); return }
      }
      if (e.keyCode === 37 || e.keyCode === 39) {
        const treeNode = this.$refs.tree.getNode(node.data.uid)
        if (e.keyCode === 37 && treeNode) {
          // 左箭头：折叠 / 跳到父节点
          if (treeNode.expanded) { treeNode.collapse(); return }
          if (node.parent && node.parent.data) { this.focusNodeByUid(node.parent.data.uid); return }
        }
        if (e.keyCode === 39 && treeNode) {
          // 右箭头：展开 / 跳到第一个子节点
          if (treeNode.childNodes && treeNode.childNodes.length > 0 && !treeNode.expanded) { treeNode.expand(); return }
          if (treeNode.childNodes && treeNode.childNodes.length > 0) { this.focusNodeByUid(treeNode.childNodes[0].data.uid); return }
        }
      }
    },

    // 聚焦指定 uid 的大纲节点输入框
    focusNodeByUid(uid) {
      this.$nextTick(() => {
        this.$refs.tree.setCurrentKey(uid)
        const el = document.querySelector(
          `.customNode[data-id="${uid}"] .nodeEdit`
        )
        if (el) {
          let selection = window.getSelection()
          let range = document.createRange()
          range.selectNodeContents(el)
          selection.removeAllRanges()
          selection.addRange(range)
          let offsetTop = el.offsetTop
          this.$emit('scrollTo', offsetTop)
        }
      })
    },

    // 节点上移一个层级（Shift+Tab：升级/提升一级）
    // 例如三级节点→二级节点，其下所有子节点同步上调
    promoteNode() {
      const targetNode = this.mindMap.renderer.findNodeByUid(this.currentData && this.currentData.uid)
      if (!targetNode || targetNode.isRoot) return
      this.notHandleDataChange = true
      this.mindMap.execCommand('MOVE_UP_ONE_LEVEL', targetNode)
    },

    // 插入兄弟节点
    insertNode() {
      this.notHandleDataChange = true
      this.isHandleNodeTreeRenderEnd = true
      this.beInsertNodeUid = createUid()
      this.mindMap.execCommand('INSERT_NODE', false, [], {
        uid: this.beInsertNodeUid
      })
    },

    // 插入下级节点
    insertChildNode() {
      this.notHandleDataChange = true
      this.isHandleNodeTreeRenderEnd = true
      this.beInsertNodeUid = createUid()
      this.mindMap.execCommand('INSERT_CHILD_NODE', false, [], {
        uid: this.beInsertNodeUid
      })
    },

    // 激活当前节点且移动当前节点到画布中间
    onClick(data) {
      this.notHandleDataChange = true
      const targetNode = this.mindMap.renderer.findNodeByUid(data.uid)
      if (targetNode && targetNode.nodeData.data.isActive) return
      this.mindMap.execCommand('GO_TARGET_NODE', data.uid, () => {
        this.notHandleDataChange = false
      })
    },

    onNodeDragStart() {
      this.setIsDragOutlineTreeNode(true)
    },

    onNodeDragEnd() {
      this.setIsDragOutlineTreeNode(false)
    },

    // 拖拽结束事件
    onNodeDrop(data, target, postion) {
      this.notHandleDataChange = true
      const node = this.mindMap.renderer.findNodeByUid(data.data.uid)
      const targetNode = this.mindMap.renderer.findNodeByUid(target.data.uid)
      if (!node || !targetNode) {
        return
      }
      switch (postion) {
        case 'before':
          this.mindMap.execCommand('INSERT_BEFORE', node, targetNode)
          break
        case 'after':
          this.mindMap.execCommand('INSERT_AFTER', node, targetNode)
          break
        case 'inner':
          this.mindMap.execCommand('MOVE_NODE_TO', node, targetNode)
          break
        default:
          break
      }
    },

    // 当前选中的树节点变化事件
    onCurrentChange(data) {
      this.currentData = data
    },

    // 删除节点
    onKeyDown(e) {
      if (!this.isInTreArea) return
      if ([46, 8].includes(e.keyCode) && this.currentData) {
        e.stopPropagation()
        this.mindMap.renderer.textEdit.hideEditTextBox()
        const node = this.mindMap.renderer.findNodeByUid(this.currentData.uid)
        if (node && !node.isRoot) {
          this.notHandleDataChange = true
          this.$refs.tree.remove(this.currentData)
          this.mindMap.execCommand('REMOVE_NODE', [node])
        }
      }
    }
  }
}
</script>

<style lang="less" scoped>
.customNode {
  width: 100%;
  color: rgba(0, 0, 0, 0.85);
  font-weight: bold;

  .nodeEdit {
    outline: none;
    white-space: normal;
    padding-right: 20px;
  }
}
</style>
<style lang="less" scoped>
@import url('../../../style/outlineTree.less');
</style>
