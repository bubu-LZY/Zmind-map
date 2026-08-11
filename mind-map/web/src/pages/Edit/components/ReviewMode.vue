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
          <div class="panelHeaderTop">
            <span class="panelTitle">复习计划</span>
            <el-button
              size="mini"
              type="primary"
              plain
              @click="openOverview"
              class="overviewBtn"
              title="查看所有知识点的复习进度"
            >
              <span class="el-icon-data-board"></span>
              知识点总览
            </el-button>
          </div>
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
                @contextmenu.prevent="onNodeItemContextMenu($event, item)"
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

        <!-- 右键菜单：删除本复习计划 -->
        <div
          class="reviewContextMenu"
          v-if="contextMenu.visible"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <div class="ctxItem danger" @click="confirmDeleteReviewPlan">
            删除本复习计划
          </div>
        </div>
      </div>
    </transition>

    <!-- 二开：复习知识点总览弹窗 -->
    <div class="reviewOverviewMask" v-if="overviewVisible" @click.self="closeOverview">
      <div class="reviewOverviewDialog" :class="{ isDark: isDark }">
        <div class="overviewHeader">
          <span class="overviewTitle">复习知识点总览</span>
          <div class="overviewHeaderActions">
            <el-button
              size="mini"
              type="warning"
              plain
              @click="clearAllCompletedOverview"
            >清除所有已完成</el-button>
            <span class="overviewClose el-icon-close" @click="closeOverview" title="关闭"></span>
          </div>
        </div>
        <div class="overviewBody customScrollbar">
          <table class="overviewTable" v-if="overviewItems.length > 0">
            <thead>
              <tr>
                <th class="colIndex">序号</th>
                <th class="colContent">内容</th>
                <th
                  v-for="c in cycles"
                  :key="c.cycle"
                  class="colCycleHeader"
                >{{ c.label }}</th>
                <th class="colAction">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in overviewItems" :key="item.id">
                <td class="colIndex">{{ idx + 1 }}</td>
                <td class="colContent">
                  <div
                    class="overviewNodeText"
                    v-html="stripHtml(item.nodeText)"
                  ></div>
                </td>
                <td
                  v-for="c in item.cycles"
                  :key="c.cycle"
                  class="colCycle"
                >
                  <div class="cycleCell" :class="{ completed: c.completed }">
                    <div class="cycleDate">{{ formatOverviewDate(c.reviewDateTs) }}</div>
                    <el-checkbox
                      :value="c.completed"
                      @change="val => toggleOverviewCycle(item, c.cycle, val)"
                    ></el-checkbox>
                  </div>
                </td>
                <td class="colAction">
                  <el-button
                    size="mini"
                    type="danger"
                    icon="el-icon-delete"
                    @click="deleteOverviewItem(item, idx)"
                    title="删除此复习计划"
                  ></el-button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="overviewEmpty" v-else>暂无复习计划</div>
        </div>
      </div>
    </div>
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
  removeById,
  removeAllCompleted,
  getReviewStats,
  getToday,
  formatDate,
  CYCLES
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
      highlightTimer: null,
      contextMenu: {
        visible: false,
        x: 0,
        y: 0,
        item: null
      },
      // 二开：知识点总览弹窗
      overviewVisible: false,
      overviewItems: [],
      cycles: CYCLES
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
    if (this._enterTimer1) { clearTimeout(this._enterTimer1); this._enterTimer1 = null }
    if (this._enterTimer2) { clearTimeout(this._enterTimer2); this._enterTimer2 = null }
    this.clearHighlight()
    document.removeEventListener('click', this.closeContextMenu)
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
      this._enterTimer1 = setTimeout(() => {
        this.shrinking = true
      }, 500)
      // 1秒后切换到面板
      this._enterTimer2 = setTimeout(() => {
        this.phase = 'panel'
        this.setIsReviewMode(true)
        this.refreshData()
        this.selectedDate = this.today
        this.loadDateItems(this.today)
      }, 1000)
    },

    exit() {
      // 清理进场动画定时器，避免退出后又被错误激活
      if (this._enterTimer1) { clearTimeout(this._enterTimer1); this._enterTimer1 = null }
      if (this._enterTimer2) { clearTimeout(this._enterTimer2); this._enterTimer2 = null }
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

    // 右键节点项：弹出删除菜单
    onNodeItemContextMenu(e, item) {
      // 清理可能残留的监听，保证全局只挂一个
      document.removeEventListener('click', this.closeContextMenu)
      const menuW = 170
      const menuH = 40
      let x = e.clientX
      let y = e.clientY
      if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 4
      if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 4
      this.contextMenu = { visible: true, x, y, item }
      this.$nextTick(() => {
        document.addEventListener('click', this.closeContextMenu, { once: true })
      })
    },

    closeContextMenu() {
      this.contextMenu.visible = false
      this.contextMenu.item = null
    },

    // 确认删除本复习计划（删除后该节点所有日期的复习任务一并移除）
    confirmDeleteReviewPlan() {
      const item = this.contextMenu.item
      if (!item) return
      const text = this.stripHtmlSimple(item.nodeText) || '该节点'
      this.closeContextMenu()
      this.$confirm(
        `确定删除「${text}」的复习计划吗？删除后该节点后续所有日期的复习任务都会被一并移除，此操作不可撤销。`,
        '删除复习计划',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonClass: 'el-button--danger'
        }
      )
        .then(() => {
          this.deleteReviewPlan(item)
        })
        .catch(() => {})
    },

    deleteReviewPlan(item) {
      removeById(item.id)
      this.refreshData()
      this.$bus.$emit('review_plan_updated')
      this.$message.success('已删除该复习计划')
    },

    // 导航到节点：统一交给 Edit.vue 处理（文件加载 + 高亮 + 导航栈 + 返回按钮）
    navigateToNode(item) {
      this.$bus.$emit('zmind_review_navigate', item)
    },

    clearHighlight() {
      if (this.highlightTimer) {
        clearTimeout(this.highlightTimer)
        this.highlightTimer = null
      }
      if (this._blinkTimer) {
        clearInterval(this._blinkTimer)
        this._blinkTimer = null
      }
      if (this._highlightBox && this._highlightBox.parentNode) {
        this._highlightBox.parentNode.removeChild(this._highlightBox)
        this._highlightBox = null
      }
    },

    // 二开：打开复习知识点总览
    openOverview() {
      this.overviewItems = getReviewPlan()
      this.overviewVisible = true
    },

    // 二开：关闭总览
    closeOverview() {
      this.overviewVisible = false
    },

    // 二开：总览表格日期格式化（MM-DD HH:mm）
    formatOverviewDate(ts) {
      const d = new Date(ts)
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const h = String(d.getHours()).padStart(2, '0')
      const min = String(d.getMinutes()).padStart(2, '0')
      return m + '-' + day + ' ' + h + ':' + min
    },

    // 二开：总览表格勾选某个周期（与复习计划数据同步）
    toggleOverviewCycle(item, cycleNum, val) {
      if (val) {
        markCycleCompleted(item.id, cycleNum)
      } else {
        markCycleUncompleted(item.id, cycleNum)
      }
      // 刷新总览数据与面板数据
      this.overviewItems = getReviewPlan()
      this.refreshData()
      this.$bus.$emit('review_plan_updated')
    },

    // 二开：总览表格删除单个复习计划
    deleteOverviewItem(item, idx) {
      const text = this.stripHtmlSimple(item.nodeText) || '该节点'
      this.$confirm(
        `确定删除「${text}」的复习计划吗？删除后该节点后续所有日期的复习任务都会被一并移除，此操作不可撤销。`,
        '删除复习计划',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonClass: 'el-button--danger'
        }
      )
        .then(() => {
          removeById(item.id)
          this.overviewItems = getReviewPlan()
          this.refreshData()
          this.$bus.$emit('review_plan_updated')
          this.$message.success('已删除该复习计划')
        })
        .catch(() => {})
    },

    // 二开：清除所有已完成的复习计划
    clearAllCompletedOverview() {
      const completedCount = this.overviewItems.filter(
        item => item.cycles.every(c => c.completed)
      ).length
      if (completedCount === 0) {
        this.$message.info('当前没有已完成的复习计划')
        return
      }
      this.$confirm(
        `确定清除所有已完成的复习计划吗？共 ${completedCount} 项，此操作不可撤销。`,
        '清除已完成',
        {
          confirmButtonText: '清除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonClass: 'el-button--danger'
        }
      )
        .then(() => {
          const removed = removeAllCompleted()
          this.overviewItems = getReviewPlan()
          this.refreshData()
          this.$bus.$emit('review_plan_updated')
          this.$message.success(`已清除 ${removed} 项已完成的复习计划`)
        })
        .catch(() => {})
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
  top: 76px;
  left: 0;
  bottom: 80px;
  width: 300px;
  background: #fff;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.08);
  border-radius: 0 16px 16px 0;
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

  .panelHeaderTop {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panelTitle {
    font-size: 16px;
    font-weight: 600;
  }

  .overviewBtn {
    padding: 3px 8px;
    font-size: 11px;
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

// 右键菜单
.reviewContextMenu {
  position: fixed;
  z-index: 10000;
  min-width: 160px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  border: 1px solid #ebeef5;
  overflow: hidden;
  user-select: none;

  .ctxItem {
    padding: 8px 14px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: #f5f5f5;
    }

    &.danger {
      color: #f56c6c;
      &:hover {
        background: #fef0f0;
      }
    }
  }

  .isDark & {
    background: #363b3f;
    border-color: hsla(0, 0%, 100%, 0.1);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);

    .ctxItem {
      color: #e8e8e8;
      &:hover {
        background: hsla(0, 0%, 100%, 0.08);
      }
      &.danger {
        color: #f89898;
        &:hover {
          background: hsla(0, 0%, 100%, 0.08);
        }
      }
    }
  }
}

/* 二开：复习知识点总览弹窗 */
.reviewOverviewMask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.reviewOverviewDialog {
  width: 92%;
  max-width: 1180px;
  max-height: 82vh;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &.isDark {
    background: #363b3f;
    color: #fff;

    .overviewHeader {
      border-bottom-color: hsla(0, 0%, 100%, 0.1);
    }
    .overviewClose {
      color: hsla(0, 0%, 100%, 0.5);
      &:hover { color: #f89898; }
    }
    .overviewTable th {
      background: hsla(0, 0%, 100%, 0.06);
      color: hsla(0, 0%, 100%, 0.85);
      border-color: hsla(0, 0%, 100%, 0.1);
    }
    .overviewTable td {
      border-color: hsla(0, 0%, 100%, 0.08);
      color: hsla(0, 0%, 100%, 0.85);
    }
    .overviewTable tr:hover td {
      background: hsla(0, 0%, 100%, 0.04);
    }
    .cycleCell .cycleDate {
      color: hsla(0, 0%, 100%, 0.45);
    }
    .cycleCell.completed .cycleDate {
      color: hsla(0, 0%, 100%, 0.25);
    }
    .colIndex {
      color: hsla(0, 0%, 100%, 0.4);
    }
  }
}

.overviewHeader {
  padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;

  .overviewTitle {
    font-size: 16px;
    font-weight: 600;
  }

  .overviewClose {
    font-size: 22px;
    cursor: pointer;
    color: #999;
    line-height: 1;
    &:hover {
      color: #f56c6c;
    }
  }

  .overviewHeaderActions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

.overviewBody {
  flex: 1;
  overflow: auto;

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 3px;
  }
}

.overviewTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    border: 1px solid #f0f0f0;
    padding: 6px 8px;
    text-align: center;
    vertical-align: middle;
  }

  th {
    background: #f5f7fa;
    font-weight: 600;
    color: #333;
    position: sticky;
    top: 0;
    z-index: 1;
    white-space: nowrap;
  }

  tr:hover td {
    background: #fafafa;
  }

  .colIndex {
    width: 42px;
    color: #999;
  }

  .colContent {
    width: 180px;
    max-width: 180px;
    text-align: left;
  }

  .colCycleHeader {
    min-width: 82px;
  }

  .colCycle {
    min-width: 82px;
  }

  .colAction {
    width: 60px;
    white-space: nowrap;
  }

  .overviewNodeText {
    word-break: break-word;
    max-height: 56px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    line-height: 1.4;
  }

  .cycleCell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;

    .cycleDate {
      font-size: 11px;
      color: #666;
      white-space: nowrap;
    }

    &.completed .cycleDate {
      color: #ccc;
      text-decoration: line-through;
    }
  }
}

.overviewEmpty {
  padding: 60px 20px;
  text-align: center;
  color: #ccc;
  font-size: 14px;
}
</style>
