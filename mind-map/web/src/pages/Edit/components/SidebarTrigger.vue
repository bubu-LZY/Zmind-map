<template>
  <div
    class="sidebarTriggerContainer "
    @click.stop
    :class="{ hasActive: show && activeSidebar && activeSidebar !== 'ai', show: show, isDark: isDark, hideForAiChat: activeSidebar === 'ai' }"
    :style="{ maxHeight: maxHeight + 'px', '--panel-width': sidebarWidth + 'px' }"
  >
    <div class="toggleShowBtn" :class="{ hide: !show }" @click="toggleShow">
      <span class="iconfont iconjiantouyou"></span>
    </div>
    <div class="trigger customScrollbar">
      <div
        class="triggerItem"
        v-for="item in triggerList"
        :key="item.value"
        :class="{ active: activeSidebar === item.value }"
        @click="trigger(item)"
      >
        <div class="triggerIcon iconfont" :class="[item.icon]"></div>
        <div class="triggerName">{{ item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import { sidebarTriggerList } from '@/config'

// 侧边栏触发器
export default {
  data() {
    return {
      show: true,
      maxHeight: 0
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      isReadonly: state => state.isReadonly,
      enableAi: state => state.localConfig.enableAi
    }),

    // 当前激活面板的宽度：节点样式/基础样式用原项目 300px，其他保持 440px
    sidebarWidth() {
      if (
        this.activeSidebar === 'nodeStyle' ||
        this.activeSidebar === 'baseStyle'
      ) {
        return 300
      }
      return 440
    },

    triggerList() {
      let list = sidebarTriggerList[this.$i18n.locale] || sidebarTriggerList.zh
      if (this.isReadonly) {
        list = list.filter(item => {
          return ['outline', 'shortcutKey', 'ai'].includes(item.value)
        })
      }
      if (!this.enableAi) {
        list = list.filter(item => {
          return item.value !== 'ai'
        })
      }
      return list
    }
  },
  watch: {
    isReadonly(val) {
      if (val) {
        this.setActiveSidebar(null)
      }
    }
  },
  created() {
    window.addEventListener('resize', this.onResize)
    this.updateSize()
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.onResize)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    trigger(item) {
      this.setActiveSidebar(item.value)
    },

    // 二开：收起时同时关闭已打开的功能悬浮窗
    toggleShow() {
      this.show = !this.show
      if (!this.show && this.activeSidebar) {
        this.setActiveSidebar(null)
      }
    },

    onResize() {
      this.updateSize()
    },

    updateSize() {
      const topMargin = 110
      const bottomMargin = 80
      this.maxHeight = window.innerHeight - topMargin - bottomMargin
    }
  }
}
</script>

<style lang="less" scoped>
.sidebarTriggerContainer {
  position: fixed;
  top: 110px;
  bottom: 80px;
  right: -60px;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  justify-content: center;

  &.isDark {
    .trigger {
      background-color: #262a2e;

      .triggerItem {
        color: hsla(0, 0%, 100%, 0.6);

        &:hover {
          background-color: hsla(0, 0%, 100%, 0.05);
        }
      }
    }
  }

  &.show {
    right: 0;
  }

  &.hasActive {
    right: var(--panel-width, 440px);
  }

  /* 二开：AI对话为独立窗口，打开时隐藏侧边栏触发器 */
  &.hideForAiChat {
    right: -60px !important;
    opacity: 0;
    pointer-events: none;
  }

  .toggleShowBtn {
    position: absolute;
    left: -18px;
    width: 18px;
    height: 60px;
    background: rgba(245, 245, 247, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-right: none;
    border-top-left-radius: 12px;
    border-bottom-left-radius: 12px;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    transition: all 0.1s linear;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #909090;

    &.hide {
      left: -20px;

      span {
        transform: rotateZ(180deg);
      }
    }

    &:hover {
      left: -22px;
      color: #409eff;
      width: 22px;
    }

    span {
      color: inherit;
      transition: all 0.1s;
    }
  }

  .trigger {
    position: relative;
    width: 60px;
    border-color: #eee;
    background-color: #fff;
    box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
    border-radius: 6px;
    max-height: 100%;
    overflow-y: auto;
    overflow-x: hidden;

    .triggerItem {
      height: 60px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      color: #464646;
      user-select: none;
      white-space: nowrap;

      &:hover {
        background-color: #ededed;
      }

      &.active {
        color: #409eff;
        font-weight: bold;
      }

      .triggerIcon {
        font-size: 18px;
        margin-bottom: 5px;
      }

      .triggerName {
        font-size: 13px;
      }
    }
  }
}
</style>
