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
// 演示模式按钮（二开：功能替换为禅模式，即隐藏所有界面元素的纯净演示/专注模式）
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
  },
  beforeDestroy() {
    this.$bus.$off('enter_demonstrate', this.enterZenMode)
  },
  methods: {
    enterZenMode() {
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
