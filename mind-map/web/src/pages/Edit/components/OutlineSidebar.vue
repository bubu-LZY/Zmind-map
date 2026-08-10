<template>
  <Sidebar ref="sidebar" :title="$t('outline.title')">
    <div class="btnList">
      <el-tooltip
        class="item"
        effect="dark"
        content="展开全部"
        placement="top"
      >
        <div class="btn" @click="expandAll">
          <span class="el-icon-arrow-down"></span>
        </div>
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        content="收起全部"
        placement="top"
      >
        <div class="btn" @click="collapseAll">
          <span class="el-icon-arrow-up"></span>
        </div>
      </el-tooltip>
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
      <el-tooltip
        class="item"
        effect="dark"
        :content="$t('outline.fullscreen')"
        placement="top"
      >
        <div
          class="btn"
          :class="{ isDark: isDark }"
          @click="onChangeToOutlineEdit"
        >
          <span class="icon iconfont iconquanping1"></span>
        </div>
      </el-tooltip>
    </div>
    <Outline
      :mindMap="mindMap"
      v-if="activeSidebar === 'outline'"
      @scrollTo="onScrollTo"
      ref="outlineRef"
    ></Outline>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { mapState, mapMutations } from 'vuex'
import Outline from './Outline.vue'
import { printOutline } from '@/utils'

// 大纲侧边栏
export default {
  components: {
    Sidebar,
    Outline
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    })
  },
  watch: {
    activeSidebar(val) {
      if (val === 'outline') {
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
      }
    }
  },
  methods: {
    ...mapMutations(['setIsOutlineEdit', 'setActiveSidebar']),

    // 展开全部大纲节点
    expandAll() {
      const tree = this.$refs.outlineRef && this.$refs.outlineRef.$refs.tree
      if (!tree) return
      const walk = node => {
        node.expanded = true
        ;(node.childNodes || []).forEach(walk)
      }
      walk(tree.root)
    },

    // 收起全部大纲节点（保留根节点展开）
    collapseAll() {
      const tree = this.$refs.outlineRef && this.$refs.outlineRef.$refs.tree
      if (!tree) return
      const walk = (node, isRoot) => {
        node.expanded = !!isRoot
        ;(node.childNodes || []).forEach(child => walk(child, false))
      }
      walk(tree.root, true)
    },

    onChangeToOutlineEdit() {
      this.setActiveSidebar(null)
      this.setIsOutlineEdit(true)
    },

    onScrollTo(y) {
      let container = this.$refs.sidebar.getEl()
      let height = container.offsetHeight
      let top = container.scrollTop
      if (y > top + height) {
        container.scrollTo(0, y - height / 2)
      }
    },

    // 打印
    onPrint() {
      printOutline(this.$refs.outlineRef.$el)
    }
  }
}
</script>

<style lang="less" scoped>
.btnList {
  position: absolute;
  right: 10px;
  top: 52px;
  display: flex;
  align-items: center;
  z-index: 1;

  .btn {
    cursor: pointer;
    margin-left: 8px;
    font-size: 14px;

    &.isDark {
      color: #fff;
    }
  }
}
</style>
