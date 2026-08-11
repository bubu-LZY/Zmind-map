<template>
  <div
    class="outlineEditContainer"
    :class="{ isDark: isDark }"
    ref="outlineEditContainer"
    v-if="isOutlineEdit"
  >
    <div class="btnList">
      <el-tooltip
        class="item"
        effect="dark"
        :content="$t('outline.print')"
        placement="top"
      >
        <div class="btn" @click="onPrint">
          <span class="icon iconfont iconprinting"></span>
        </div>
      </el-tooltip>
      <div class="btn" @click="onClose">
        <span class="icon iconfont iconguanbi"></span>
      </div>
    </div>
    <div
      class="outlineEditBox"
      id="fullScreenOutlineEditBox"
      ref="outlineEditBox"
    >
      <div class="outlineEdit">
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
          @current-change="onCurrentChange"
        >
          <span
            class="customNode"
            slot-scope="{ node, data }"
            :data-id="data.uid"
          >
            <span
              class="nodeEdit"
              :contenteditable="!isReadonly"
              :key="getKey()"
              @blur="onBlur($event, node)"
              @keydown.stop="onNodeInputKeydown($event, node)"
              @keyup.stop
              @paste="onPaste($event, node)"
              v-html="node.label"
            ></span>
          </span>
        </el-tree>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import {
  nodeRichTextToTextWithWrap,
  textToNodeRichTextWithWrap,
  createUid,
  simpleDeepClone,
  htmlEscape,
  handleInputPasteText,
  getTextFromHtml
} from 'simple-mind-map/src/utils'
import { storeData } from '@/api'
import { printOutline } from '@/utils'

// 挖空语法转换（二开功能）：富文本 HTML 中的挖空 span <-> [==文本==] 标记
// 将挖空 span 转为 [==文本==] 标记（用于大纲显示）
const clozeSpanToMarker = html => {
  return html.replace(
    /<span[^>]*class=["'][^"']*smm-cloze[^"']*["'][^>]*>([\s\S]*?)<\/span>/g,
    (m, inner) => '[==' + getTextFromHtml(inner) + '==]'
  )
}
// 将 [==文本==] 标记转为挖空 span（用于大纲编辑提交）
const markerToClozeSpan = html => {
  return html.replace(
    /\[==([\s\S]+?)==\]/g,
    '<span class="smm-cloze">$1</span>'
  )
}

// 大纲侧边栏
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
      currentData: null
    }
  },
  computed: {
    ...mapState({
      isReadonly: state => state.isReadonly,
      isDark: state => state.localConfig.isDark,
      isOutlineEdit: state => state.isOutlineEdit
    })
  },
  watch: {
    isOutlineEdit(val) {
      if (val) {
        this.refresh()
        this.$nextTick(() => {
          document.body.appendChild(this.$refs.outlineEditContainer)
        })
      }
    }
  },
  created() {
    window.addEventListener('keydown', this.onKeyDown)
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.onKeyDown)
  },
  methods: {
    ...mapMutations(['setIsOutlineEdit']),

    // 刷新树数据
    refresh() {
      let data = this.mindMap.getData()
      data.root = true // 标记根节点
      let walk = root => {
        // 挖空内容转为 [==文本==] 标记再提取纯文本（二开功能）
        // 兼容两种格式：<span class="smm-cloze">（已保存）和 <code>（编辑中未退出）
        const rawText = root.data.text || ''
        const hasRichText = !!root.data.richText
        const hasClozeSpan = /<span[^>]*class=["'][^"']*smm-cloze/.test(rawText)
        const hasCodeTag = /<code\b[^>]*>/.test(rawText)
        let richHtml = ''
        if (hasRichText && (hasClozeSpan || hasCodeTag)) {
          // 先把残留的 <code>（编辑中未保存）转为 smm-cloze span，统一处理
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
    },

    // 根节点不允许拖拽
    checkAllowDrag(node) {
      return !node.data.root
    },

    // 拖拽结束事件
    onNodeDrop() {
      this.save()
    },

    // 当前选中的树节点变化事件
    onCurrentChange(data) {
      this.currentData = data
    },

    // 失去焦点更新节点文本
    onBlur(e, node) {
      // 节点数据没有修改
      if (node.data.textCache === e.target.innerHTML) {
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
      // [==文本==] 标记转为挖空 span（二开功能）
      node.data.data.text = richText
        ? markerToClozeSpan(textToNodeRichTextWithWrap(e.target.innerHTML))
        : plainText
      node.data.textCache = e.target.innerHTML
      this.save()
    },

    // 节点输入区域按键事件
    onNodeInputKeydown(e, node) {
      // Tab：当前节点降级为上一个同级节点的子节点（对齐幕布）
      if (e.keyCode === 9 && !e.shiftKey) {
        e.preventDefault()
        this.demoteNode(node)
        return
      }
      // Shift+Tab：节点升级（提升一级），如三级→二级，子节点同步上调
      if (e.keyCode === 9 && e.shiftKey) {
        e.preventDefault()
        this.promoteNode(node)
        return
      }
      // Enter：新建同级节点
      if (e.keyCode === 13 && !e.shiftKey) {
        e.preventDefault()
        if (node.data.root) {
          return
        }
        const richText = !!node.data.data.richText
        const uid = createUid()
        const text = this.$t('outline.nodeDefaultText')
        const data = {
          textCache: text,
          uid,
          label: text,
          data: {
            text: richText ? textToNodeRichTextWithWrap(text) : text,
            uid,
            richText
          },
          children: []
        }
        this.$refs.tree.insertAfter(data, node.data)
        this.save()
        this.focusNodeByUid(uid)
      }
      // 箭头键：大纲节点间导航
      if (e.keyCode === 38 || e.keyCode === 40) {
        e.preventDefault()
        const flat = []
        this.data[0] && (function walk(item) { flat.push(item); (item.children || []).forEach(walk) })(this.data[0])
        const idx = flat.findIndex(item => item.uid === node.data.uid)
        if (e.keyCode === 38 && idx > 0) { this.focusNodeByUid(flat[idx - 1].uid); return }
        if (e.keyCode === 40 && idx < flat.length - 1) { this.focusNodeByUid(flat[idx + 1].uid); return }
      }
      if (e.keyCode === 37 || e.keyCode === 39) {
        const treeNode = this.$refs.tree.getNode(node.data.uid)
        if (e.keyCode === 37 && treeNode) {
          if (treeNode.expanded) { treeNode.collapse(); return }
          if (node.parent && node.parent.data) { this.focusNodeByUid(node.parent.data.uid); return }
        }
        if (e.keyCode === 39 && treeNode) {
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
          this.scrollTo(offsetTop)
        }
      })
    },

    // Tab 降级：当前节点移动为上一个同级节点的最后一个子节点
    demoteNode(node) {
      const parent = node.parent
      if (!parent) return
      const siblings = parent.childNodes || []
      const index = siblings.findIndex(item => item.key === node.key)
      // 第一个子节点无法降级（已是末级节点则避免移动）
      if (index <= 0) {
        this.$notify && this.$notify({
          title: '降级',
          message: '已是同级第一个节点，无法继续降级',
          type: 'info',
          duration: 2000
        })
        return
      }
      const prevSiblingNode = siblings[index - 1]
      const nodeData = node.data
      // el-tree 方法全部传 data 对象，不能传 Node 实例
      this.$refs.tree.remove(nodeData)
      this.$refs.tree.append(nodeData, prevSiblingNode.data)
      prevSiblingNode.expand()
      this.save()
      this.focusNodeByUid(nodeData.uid)
    },

    // Shift+Tab：节点升级（提升一级），如三级→二级，子节点同步上调
    promoteNode(node) {
      const targetNode = this.mindMap.renderer.findNodeByUid(node.data.uid)
      if (!targetNode || node.data.root) {
        this.$notify && this.$notify({
          title: '升级',
          message: '根节点无法升级',
          type: 'info',
          duration: 2000
        })
        return
      }
      // 在大纲树中操作：把节点移到其父节点的同级位置（成为父节点的兄弟）
      const parent = node.parent
      if (!parent || !parent.data || parent.data.root) {
        // 父节点是根节点，无法再升级
        this.$notify && this.$notify({
          title: '升级',
          message: '已是一级子节点，无法继续升级',
          type: 'info',
          duration: 2000
        })
        return
      }
      const grandParent = parent.parent
      if (!grandParent) return
      const nodeData = node.data
      // 从当前位置移除
      this.$refs.tree.remove(nodeData)
      // 插入到父节点之后（成为父节点的兄弟）
      this.$refs.tree.insertAfter(nodeData, parent.data)
      this.save()
      this.focusNodeByUid(nodeData.uid)
    },

    // 删除节点
    onKeyDown(e) {
      if (!this.isOutlineEdit) return
      if ([46, 8].includes(e.keyCode) && this.currentData) {
        e.stopPropagation()
        this.$refs.tree.remove(this.currentData)
        this.currentData = null
        this.save()
      }
    },

    // 拦截粘贴事件
    onPaste(e) {
      handleInputPasteText(e)
    },

    // 生成唯一的key
    getKey() {
      return Math.random()
    },

    // 打印
    onPrint() {
      printOutline(this.$refs.outlineEditBox)
    },

    // 关闭
    onClose() {
      // 强制把所有正在编辑中的 contenteditable 内容同步到 textCache（触发模糊）
      const spans = this.$el.querySelectorAll('.nodeEdit')
      spans.forEach(el => el.blur())
      this.$nextTick(() => {
        // 关闭前再扫描一次：把还未被 onBlur 处理的 [==文本==] 语法转为富文本（兜底）
        this.processClozeSyntax(this.data[0])
        this.setIsOutlineEdit(false)
        this.$bus.$emit('setData', this.getData())
      })
    },

    // 递归扫描大纲树，把普通文本中的 [==文本==] 语法转为富文本（二开兜底）
    processClozeSyntax(root) {
      if (!root) return
      const walk = item => {
        const d = item.data && item.data.data
        // textCache 是大纲编辑区当前显示的内容（可能包含刚输入还未 blur 的 [==文本==]）
        const textSource =
          (item.textCache && typeof item.textCache === 'string' && item.textCache.indexOf('[==') !== -1
            ? item.textCache.replace(/<br>/g, '\n')
            : '') ||
          (d && d.text) ||
          ''
        if (!d || d.richText) {
          ;(item.children || []).forEach(walk)
          return
        }
        if (/\[==[\s\S]+?==\]/.test(textSource)) {
          d.richText = true
          d.text = markerToClozeSpan(
            textToNodeRichTextWithWrap(textSource)
          )
        }
        ;(item.children || []).forEach(walk)
      }
      walk(root)
    },

    // 滚动
    scrollTo(y) {
      let container = this.$refs.outlineEditBox
      let height = container.offsetHeight
      let top = container.scrollTop
      y += 50
      if (y > top + height) {
        container.scrollTo(0, y - height / 2)
      }
    },

    // 获取思维导图数据
    getData() {
      let newNode = {}
      let node = this.data[0]
      let walk = (root, newRoot) => {
        newRoot.data = root.data
        newRoot.children = []
        ;(root.children || []).forEach(child => {
          const newChild = {}
          newRoot.children.push(newChild)
          walk(child, newChild)
        })
      }
      walk(node, newNode)
      return simpleDeepClone(newNode)
    },

    // 保存
    save() {
      storeData({
        root: this.getData()
      })
    }
  }
}
</script>

<style lang="less" scoped>
.outlineEditContainer {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 1999;
  background-color: #fff;
  overflow: hidden;

  &.isDark {
    background-color: #262a2e;

    .btnList {
      .btn {
        .icon {
          color: #fff;
        }
      }
    }
  }

  .btnList {
    position: absolute;
    right: 40px;
    top: 20px;
    display: flex;
    align-items: center;

    .btn {
      cursor: pointer;
      margin-left: 12px;

      .icon {
        font-size: 28px;
      }
    }
  }

  .outlineEditBox {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 50px 0;

    .outlineEdit {
      width: 1000px;
      height: 100%;
      height: max-content;
      margin: 0 auto;

      /deep/ .customNode {
        .nodeEdit {
          max-width: 800px;
        }
      }
    }
  }
}

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
