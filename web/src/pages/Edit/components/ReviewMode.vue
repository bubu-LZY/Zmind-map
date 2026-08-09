<template>
  <div class="reviewModeWrapper" v-if="visible">
    <!-- 阶段0：大字 "复习模式" -->
    <transition name="bigTextFade">
      <div
        class="reviewBigText"
        v-if="phase === 'bigText'"
        :class="{ shrink: shrinking }"
      >
        <span>复习模式</span>
      </div>
    </transition>

    <!-- 阶段1+：展开的面板 -->
    <transition name="panelExpand">
      <div
        class="reviewPanel"
        v-if="phase === 'panel'"
        :class="{ isDark: isDark }"
      >
        <!-- 面板头部 -->
        <div class="panelHeader">
          <span class="panelTitle">复习计划</span>
          <div class="panelStats" v-if="stats">
            <span class="statItem">今日 {{ stats.todayTotal }}</span>
            <span class="statItem done">已完成 {{ stats.todayCompleted }}</span>
            <span class="statItem pending" v-if="stats.todayUncompleted > 0">
              待复习 {{ stats.todayUncompleted }}
            </span>
          </div>
        </div>

        <!-- 面板内容：左侧日期 + 右侧节点 -->
        <div class="panelBody">
          <!-- 左侧日期列表 -->
          <div class="dateList">
            <div class="listScroll">
              <div
                class="dateItem"
                v-for="date in reviewDates"
                :key="date"
                :class="{
                  active: date === selectedDate,
                  today: date === today
                }"
                @click="selectDate(date)"
              >
                <span class="dateText">{{ formatDateDisplay(date) }}</span>
                <span class="dateBadge" v-if="dateItemCount(date) > 0">{{ dateItemCount(date) }}</span>
              </div>
              <div class="emptyTip" v-if="reviewDates.length === 0">
                暂无复习计划
              </div>
            </div>
          </div>

          <!-- 右侧节点列表 -->
          <div class="nodeList">
            <div class="listScroll">
              <div
                class="nodeItem"
                v-for="(item, index) in currentDateItems"
                :key="item.id + '_' + item.currentCycle.cycle"
                :class="{ completed: item.currentCycle.completed }"
              >
                <div class="nodeInfo" @click="navigateToNode(item)">
                  <span class="nodeIndex">{{ index + 1 }}.</span>
                  <div class="nodeDetail">
                    <div class="nodeTitle" v-html="stripHtml(item.nodeText)"></div>
                    <div class="nodeMeta">
                      <span class="nodeFile" v-if="item.fileName">{{ item.fileName }}</span>
                      <span class="nodeParent" v-if="item.parentText">← {{ stripHtmlSimple(item.parentText) }}</span>
                      <span class="nodeCycle">{{ formatDateLabel(selectedDate) }} · {{ item.currentCycle.label }}</span>
                    </div>
                  </div>
                </div>
                <el-checkbox
                  :value="item.currentCycle.completed"
                  @change="val => toggleComplete(item, val)"
                  class="nodeCheckbox"
                ></el-checkbox>
              </div>
              <div class="emptyTip" v-if="currentDateItems.length === 0">
                {{ selectedDate === today ? '今日暂无复习任务' : '该日期暂无复习任务' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import {
  getReviewPlan,
  getAllReviewDates,
  getReviewItemsByDate,
  markCycleCompleted,
  markCycleUncompleted,
  getReviewStats,
  getToday,
  formatDate
} from '@/utils/reviewPlan'
import { getTextFromHtml } from 'simple-mind-map/src/utils'

export default {
  props: {
    mindMap: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      visible: false,
      phase: '', // 'bigText' | 'panel'
      shrinking: false,
      reviewDates: [],
      selectedDate: '',
      currentDateItems: [],
      stats: null,
      today: getToday(),
      highlightTimer: null
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      currentFilePath: state => state.currentFilePath
    })
  },
  created() {
    this.$bus.$on('enter_review_mode', this.enter)
    this.$bus.$on('exit_review_mode', this.exit)
    this.$bus.$on('review_plan_updated', this.refreshData)
  },
  beforeDestroy() {
    this.$bus.$off('enter_review_mode', this.enter)
    this.$bus.$off('exit_review_mode', this.exit)
    this.$bus.$off('review_plan_updated', this.refreshData)
    this.clearHighlight()
  },
  methods: {
    ...mapMutations(['setIsReviewMode']),

    enter() {
      this.visible = true
      this.phase = 'bigText'
      this.shrinking = false
      this.today = getToday()
      // 关闭已打开的侧边栏（目录树等）
      this.$store.commit('setActiveSidebar', null)
      // 0.5秒后大字收缩成小球
      setTimeout(() => {
        this.shrinking = true
      }, 500)
      // 1秒后切换到面板
      setTimeout(() => {
        this.phase = 'panel'
        this.setIsReviewMode(true)
        this.refreshData()
        this.selectedDate = this.today
        this.loadDateItems(this.today)
      }, 1000)
    },

    exit() {
      this.visible = false
      this.phase = ''
      this.shrinking = false
      this.setIsReviewMode(false)
      this.clearHighlight()
    },

    refreshData() {
      this.reviewDates = getAllReviewDates()
      this.stats = getReviewStats()
      if (this.selectedDate) {
        this.loadDateItems(this.selectedDate)
      }
    },

    selectDate(date) {
      this.selectedDate = date
      this.loadDateItems(date)
    },

    loadDateItems(date) {
      this.currentDateItems = getReviewItemsByDate(date)
    },

    dateItemCount(date) {
      return getReviewItemsByDate(date).length
    },

    formatDateDisplay(dateStr) {
      const d = new Date(dateStr)
      const month = d.getMonth() + 1
      const day = d.getDate()
      const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
      return `${month}月${day}日 周${weekday}`
    },

    formatDateLabel(dateStr) {
      const d = new Date(dateStr)
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}号`
    },

    stripHtml(html) {
      return getTextFromHtml(html || '')
    },

    stripHtmlSimple(html) {
      return getTextFromHtml(html || '')
    },

    toggleComplete(item, val) {
      if (val) {
        markCycleCompleted(item.id, item.currentCycle.cycle)
      } else {
        markCycleUncompleted(item.id, item.currentCycle.cycle)
      }
      this.refreshData()
      this.$bus.$emit('review_plan_updated')
    },

    // 导航到节点
    async navigateToNode(item) {
      if (!item.filePath || item.filePath === this.currentFilePath) {
        // 同文件，直接定位
        this.highlightNode(item.nodeUid)
      } else {
        // 跨文件，先加载文件
        await this.loadFileAndHighlight(item.filePath, item.nodeUid)
      }
    },

    async loadFileAndHighlight(filePath, nodeUid) {
      try {
        const fs = window.zmindFs
        if (!fs) {
          this.$message.warning('文件系统不可用')
          return
        }
        const content = await fs.readFile(filePath)
        let data
        if (/\.md$/i.test(filePath)) {
          const markdown = await import('simple-mind-map/src/parse/markdown.js')
          const list = markdown.default.transformMarkdownToList(content)
          if (!list || list.length === 0) throw new Error('empty')
          data =
            list.length === 1
              ? list[0]
              : { data: { text: '导入' }, children: list }
          this.$bus.$emit('setData', data)
        } else {
          data = JSON.parse(content)
          if (!data.root) {
            data = { root: data }
          }
          this.$bus.$emit('setData', data)
        }
        this.$store.commit('setCurrentFilePath', filePath)
        // 等待渲染完成后高亮
        setTimeout(() => {
          this.highlightNode(nodeUid)
        }, 600)
      } catch (e) {
        console.error(e)
        this.$message.error('无法加载文件: ' + filePath)
      }
    },

    // 高亮节点：红色方框框住目标节点 + 大框框住上级及下级
    highlightNode(nodeUid) {
      if (!this.mindMap) return
      this.clearHighlight()

      const node = this.findNodeByUid(this.mindMap.renderer.root, nodeUid)
      if (!node) {
        this.$message.warning('未找到对应节点')
        return
      }

      // 展开所有父节点确保可见
      this.expandParents(node)

      // 等待展开渲染后再定位
      setTimeout(() => {
        this.doHighlight(node)
      }, 300)
    },

    expandParents(node) {
      let parent = node.parent
      while (parent) {
        if (!parent.getData('expand')) {
          parent.setData({ expand: true })
        }
        parent = parent.parent
      }
    },

    doHighlight(node) {
      const svg = this.mindMap.svg
      if (!svg) return

      // 获取节点位置
      this.mindMap.renderer.moveNodeToCenter(node)

      setTimeout(() => {
        const nodeRect = this.getNodeRect(node)
        if (!nodeRect) return

        // 创建红色方框 - 目标节点
        const highlightGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        highlightGroup.setAttribute('class', 'review-highlight-group')

        // 目标节点红框
        const nodeRect_el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        nodeRect_el.setAttribute('x', nodeRect.x - 6)
        nodeRect_el.setAttribute('y', nodeRect.y - 6)
        nodeRect_el.setAttribute('width', nodeRect.width + 12)
        nodeRect_el.setAttribute('height', nodeRect.height + 12)
        nodeRect_el.setAttribute('fill', 'none')
        nodeRect_el.setAttribute('stroke', '#e74c3c')
        nodeRect_el.setAttribute('stroke-width', '3')
        nodeRect_el.setAttribute('rx', '6')
        nodeRect_el.setAttribute('class', 'review-highlight-rect')
        highlightGroup.appendChild(nodeRect_el)

        // 大框 - 上级节点及下级
        if (node.parent && !node.parent.isRoot) {
          const parentRect = this.getParentGroupRect(node.parent)
          if (parentRect) {
            const parentRect_el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
            parentRect_el.setAttribute('x', parentRect.x - 10)
            parentRect_el.setAttribute('y', parentRect.y - 10)
            parentRect_el.setAttribute('width', parentRect.width + 20)
            parentRect_el.setAttribute('height', parentRect.height + 20)
            parentRect_el.setAttribute('fill', 'none')
            parentRect_el.setAttribute('stroke', '#e74c3c')
            parentRect_el.setAttribute('stroke-width', '2')
            parentRect_el.setAttribute('stroke-dasharray', '8,4')
            parentRect_el.setAttribute('rx', '8')
            parentRect_el.setAttribute('opacity', '0.6')
            parentRect_el.setAttribute('class', 'review-highlight-parent')
            highlightGroup.appendChild(parentRect_el)
          }
        }

        svg.node.appendChild(highlightGroup)
        this._highlightGroup = highlightGroup

        // 5秒后自动移除高亮
        this.highlightTimer = setTimeout(() => {
          this.clearHighlight()
        }, 5000)
      }, 300)
    },

    getNodeRect(node) {
      if (!node.group) return null
      try {
        const bbox = node.group.getBBox()
        return {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height
        }
      } catch (e) {
        return null
      }
    },

    getParentGroupRect(parentNode) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      const nodes = [parentNode, ...(parentNode.children || [])]
      nodes.forEach(n => {
        if (!n.group) return
        try {
          const bbox = n.group.getBBox()
          minX = Math.min(minX, bbox.x)
          minY = Math.min(minY, bbox.y)
          maxX = Math.max(maxX, bbox.x + bbox.width)
          maxY = Math.max(maxY, bbox.y + bbox.height)
        } catch (e) {}
      })
      if (minX === Infinity) return null
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    },

    findNodeByUid(root, uid) {
      if (!root) return null
      if (root.uid === uid) return root
      if (root.children) {
        for (const child of root.children) {
          const found = this.findNodeByUid(child, uid)
          if (found) return found
        }
      }
      return null
    },

    clearHighlight() {
      if (this.highlightTimer) {
        clearTimeout(this.highlightTimer)
        this.highlightTimer = null
      }
      if (this._highlightGroup && this._highlightGroup.parentNode) {
        this._highlightGroup.parentNode.removeChild(this._highlightGroup)
        this._highlightGroup = null
      }
    }
  }
}
</script>

<style lang="less" scoped>
.reviewModeWrapper {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 998;
  pointer-events: none;
}

// 大字动画
.reviewBigText {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(1);
  z-index: 9999;
  pointer-events: none;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);

  span {
    font-size: 64px;
    font-weight: 700;
    color: #409eff;
    text-shadow: 0 4px 20px rgba(64, 158, 255, 0.3);
    letter-spacing: 8px;
  }

  &.shrink {
    transform: translate(-50%, -50%) scale(0.1);
    opacity: 0;
  }
}

.bigTextFade-enter-active,
.bigTextFade-leave-active {
  transition: opacity 0.3s;
}
.bigTextFade-enter,
.bigTextFade-leave-to {
  opacity: 0;
}

// 面板
.reviewPanel {
  position: fixed;
  top: 60px;
  left: 0;
  bottom: 0;
  width: 300px;
  background: #fff;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  transform-origin: top left;

  &.isDark {
    background: #363b3f;
    color: #fff;

    .panelHeader {
      border-bottom-color: hsla(0, 0%, 100%, 0.1);
    }

    .dateItem {
      &:hover {
        background: hsla(0, 0%, 100%, 0.05);
      }
      &.active {
        background: hsla(0, 0%, 100%, 0.1);
      }
    }

    .nodeItem {
      border-bottom-color: hsla(0, 0%, 100%, 0.06);
      &:hover {
        background: hsla(0, 0%, 100%, 0.03);
      }
    }

    .nodeMeta {
      color: hsla(0, 0%, 100%, 0.4);
    }
  }
}

.panelExpand-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.panelExpand-enter {
  transform: scale(0);
  opacity: 0;
}

.panelHeader {
  padding: 14px 16px 10px;
  border-bottom: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .panelTitle {
    font-size: 16px;
    font-weight: 600;
  }

  .panelStats {
    display: flex;
    gap: 10px;
    font-size: 12px;

    .statItem {
      color: #999;
      &.done {
        color: #67c23a;
      }
      &.pending {
        color: #e6a23c;
      }
    }
  }
}

.panelBody {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.dateList {
  width: 130px;
  border-right: 1px solid #f0f0f0;
  overflow: hidden;
  flex-shrink: 0;

  .isDark & {
    border-right-color: hsla(0, 0%, 100%, 0.06);
  }
}

.nodeList {
  flex: 1;
  overflow: hidden;
}

.listScroll {
  height: 100%;
  overflow-y: auto;
  padding: 4px 0;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 2px;
  }
}

.dateItem {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 0.15s;

  &:hover {
    background: #f5f5f5;
  }

  &.active {
    background: #ecf5ff;
    color: #409eff;
    font-weight: 500;

    .isDark & {
      background: hsla(0, 0%, 100%, 0.1);
    }
  }

  &.today .dateText::before {
    content: '●';
    color: #e6a23c;
    margin-right: 4px;
    font-size: 10px;
  }

  .dateBadge {
    background: #409eff;
    color: #fff;
    font-size: 10px;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
  }
}

.nodeItem {
  padding: 8px 10px;
  border-bottom: 1px solid #f5f5f5;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  transition: background 0.15s;

  &:hover {
    background: #fafafa;
  }

  &.completed {
    opacity: 0.5;
    .nodeTitle {
      text-decoration: line-through;
    }
  }

  .nodeInfo {
    flex: 1;
    cursor: pointer;
    display: flex;
    gap: 4px;
    min-width: 0;
  }

  .nodeIndex {
    font-size: 12px;
    color: #ccc;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .nodeDetail {
    flex: 1;
    min-width: 0;
  }

  .nodeTitle {
    font-size: 13px;
    line-height: 1.4;
    word-break: break-word;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .nodeMeta {
    margin-top: 3px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 11px;
    color: #999;

    .nodeFile {
      color: #409eff;
    }
    .nodeCycle {
      background: #f0f0f0;
      padding: 0 4px;
      border-radius: 3px;
    }
  }

  .nodeCheckbox {
    flex-shrink: 0;
    margin-top: 1px;
  }
}

.emptyTip {
  padding: 20px 16px;
  text-align: center;
  color: #ccc;
  font-size: 13px;
}
</style>
