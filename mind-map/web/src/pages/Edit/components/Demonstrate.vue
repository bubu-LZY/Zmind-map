<template>
  <div class="demonstrateContainer" :class="{ isDark: isDark }">
    <el-tooltip
      class="item"
      effect="dark"
      :content="$t('demonstrate.demonstrate')"
      placement="top"
    >
      <div class="btn iconfont iconyanshibofang" @click="enterZenMode"></div>
    </el-tooltip>
  </div>
</template>

<script>
import { fullScreen, fullscrrenEvent } from '@/utils'

// 演示模式按钮（二开：进入即全屏 + 禅模式，合并原全屏查看功能）
export default {
  props: {
    mindMap: {
      type: Object
    },
    isDark: {
      type: Boolean
    }
  },
  created() {
    // 幕布快捷键：Ctrl+Alt+Shift+P
    this.$bus.$on('enter_demonstrate', this.enterZenMode)
    // 全屏状态变化后重新计算思维导图尺寸
    document[fullscrrenEvent] = () => {
      setTimeout(() => {
        if (this.mindMap) this.mindMap.resize()
      }, 1000)
    }
  },
  beforeDestroy() {
    this.$bus.$off('enter_demonstrate', this.enterZenMode)
  },
  methods: {
    enterZenMode() {
      // 进入演示模式：直接全屏 + 隐藏界面元素
      fullScreen(document.body)
      this.$store.commit('setLocalConfig', { isZenMode: true })
    }
  }
}
</script>

<style lang="less" scoped>
.demonstrateContainer {
  .btn {
    cursor: pointer;
  }
}
</style>
