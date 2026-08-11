<template>
  <div
    class="richTextToolbar"
    ref="richTextToolbar"
    :style="style"
    :class="{ isDark: isDark }"
    @click.stop.passive
    v-show="showRichTextToolbar"
  >
    <!-- 加粗 -->
    <div class="btn" :class="{ active: formatInfo.bold }" @click="toggleBold">
      <span class="icon iconfont iconzitijiacu"></span>
    </div>
    <!-- 斜体 -->
    <div class="btn" :class="{ active: formatInfo.italic }" @click="toggleItalic">
      <span class="icon iconfont iconzitixieti"></span>
    </div>
    <!-- 下划线 -->
    <div class="btn" :class="{ active: formatInfo.underline }" @click="toggleUnderline">
      <span class="icon iconfont iconzitixiahuaxian"></span>
    </div>
    <!-- 删除线 -->
    <div class="btn" :class="{ active: formatInfo.strike }" @click="toggleStrike">
      <span class="icon iconfont iconshanchuxian"></span>
    </div>
    <!-- 挖空 -->
    <div class="btn clozeBtn" :class="{ active: formatInfo.cloze }" @click="toggleCloze" @mousedown.prevent>
      <span class="clozeText">空</span>
    </div>

    <!-- 字体 -->
    <div class="dropdownWrap" @mouseenter="hoverMenu='font'" @mouseleave="hoverMenu=''">
      <div class="btn"><span class="icon iconfont iconxingzhuang-wenzi"></span></div>
      <div class="dropdownPanel" v-show="hoverMenu==='font'">
        <div
          class="fontOptionItem"
          v-for="item in fontFamilyList"
          :key="item.value"
          :style="{ fontFamily: item.value }"
          :class="{ active: formatInfo.font === item.value }"
          @click="changeFontFamily(item.value)"
        >{{ item.name }}</div>
      </div>
    </div>

    <!-- 字号 -->
    <div class="dropdownWrap" @mouseenter="hoverMenu='size'" @mouseleave="hoverMenu=''">
      <div class="btn"><span class="icon iconfont iconcase fontColor"></span></div>
      <div class="dropdownPanel" v-show="hoverMenu==='size'">
        <div
          class="fontOptionItem"
          v-for="item in fontSizeList"
          :key="item"
          :style="{ fontSize: item + 'px', height: (item < 30 ? 30 : item + 10) + 'px' }"
          :class="{ active: formatInfo.size === item + 'px' }"
          @click="changeFontSize(item)"
        >{{ item }}px</div>
      </div>
    </div>

    <!-- 文字颜色 -->
    <div class="dropdownWrap" @mouseenter="hoverMenu='color'" @mouseleave="hoverMenu=''">
      <div class="btn" :style="{ color: formatInfo.color }">
        <span class="icon iconfont iconzitiyanse"></span>
      </div>
      <div class="dropdownPanel colorPanel" v-show="hoverMenu==='color'">
        <Color :color="fontColor" @change="changeFontColor"></Color>
      </div>
    </div>

    <!-- 背景色 -->
    <div class="dropdownWrap" @mouseenter="hoverMenu='bg'" @mouseleave="hoverMenu=''">
      <div class="btn"><span class="icon iconfont iconbeijingyanse"></span></div>
      <div class="dropdownPanel colorPanel" v-show="hoverMenu==='bg'">
        <Color :color="fontBackgroundColor" @change="changeFontBackgroundColor"></Color>
      </div>
    </div>

    <!-- 对齐 -->
    <div class="dropdownWrap" @mouseenter="hoverMenu='align'" @mouseleave="hoverMenu=''">
      <div class="btn"><span class="icon iconfont iconjuzhongduiqi"></span></div>
      <div class="dropdownPanel" v-show="hoverMenu==='align'">
        <div
          class="fontOptionItem"
          v-for="item in alignList"
          :key="item.value"
          :class="{ active: formatInfo.align === item.value }"
          @click="changeTextAlign(item.value)"
        >{{ item.name }}</div>
      </div>
    </div>

    <!-- 清除格式 -->
    <div class="btn" @click="removeFormat">
      <span class="icon iconfont iconqingchu"></span>
    </div>
  </div>
</template>

<script>
import { fontFamilyList, fontSizeList, alignList } from '@/config'
import Color from './Color.vue'
import { mapState } from 'vuex'
import { toggleSelectionCloze } from '@/utils/cloze'

export default {
  components: { Color },
  props: {
    mindMap: { type: Object }
  },
  data() {
    return {
      fontSizeList,
      showRichTextToolbar: false,
      hoverMenu: '',
      style: { left: 0, top: 0 },
      fontColor: '',
      fontBackgroundColor: '',
      formatInfo: {}
    }
  },
  computed: {
    ...mapState({ isDark: state => state.localConfig.isDark }),
    fontFamilyList() {
      return fontFamilyList[this.$i18n.locale] || fontFamilyList.zh
    },
    alignList() {
      return alignList[this.$i18n.locale] || alignList.zh
    }
  },
  created() {
    this.$bus.$on('rich_text_selection_change', this.onRichTextSelectionChange)
  },
  mounted() {
    document.body.append(this.$refs.richTextToolbar)
  },
  beforeDestroy() {
    this.$bus.$off('rich_text_selection_change', this.onRichTextSelectionChange)
  },
  methods: {
    onRichTextSelectionChange(hasRange, rect, formatInfo) {
      if (hasRange) {
        // 先设近似位置（避免闪烁），nextTick 后用实际宽度修正居中
        this.style.left = (rect.left + rect.width / 2) + 'px'
        this.style.top = (rect.top - 60) + 'px'
        this.$nextTick(() => {
          if (this.$refs.richTextToolbar) {
            const w = this.$refs.richTextToolbar.offsetWidth
            this.style.left = (rect.left + rect.width / 2 - w / 2) + 'px'
          }
        })
        this.formatInfo = { ...(formatInfo || {}), cloze: !!(formatInfo && formatInfo.code) }
      }
      this.showRichTextToolbar = hasRange
    },
    toggleBold() {
      this.formatInfo.bold = !this.formatInfo.bold
      this.mindMap.richText.formatText({ bold: this.formatInfo.bold })
    },
    toggleItalic() {
      this.formatInfo.italic = !this.formatInfo.italic
      this.mindMap.richText.formatText({ italic: this.formatInfo.italic })
    },
    toggleUnderline() {
      this.formatInfo.underline = !this.formatInfo.underline
      this.mindMap.richText.formatText({ underline: this.formatInfo.underline })
    },
    toggleStrike() {
      this.formatInfo.strike = !this.formatInfo.strike
      this.mindMap.richText.formatText({ strike: this.formatInfo.strike })
    },
    toggleCloze() {
      const result = toggleSelectionCloze()
      if (result === 'added') this.$set(this.formatInfo, 'cloze', true)
      else if (result === 'removed') this.$set(this.formatInfo, 'cloze', false)
    },
    changeFontFamily(font) {
      this.formatInfo.font = font
      this.mindMap.richText.formatText({ font })
    },
    changeFontSize(size) {
      this.formatInfo.size = size
      this.mindMap.richText.formatText({ size: size + 'px' })
    },
    changeFontColor(color) {
      this.formatInfo.color = color
      this.mindMap.richText.formatText({ color })
    },
    changeFontBackgroundColor(background) {
      this.formatInfo.background = background
      this.mindMap.richText.formatText({ background })
    },
    changeTextAlign(align) {
      this.formatInfo.align = align
      this.mindMap.richText.formatText({ align })
    },
    removeFormat() {
      this.mindMap.richText.removeFormat()
    }
  }
}
</script>

<style lang="less" scoped>
.richTextToolbar {
  position: fixed;
  z-index: 2000;
  height: 55px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;

  &.isDark {
    background: #363b3f;
    .btn { color: #fff; &:hover { background: hsla(0, 0%, 100%, 0.05); } }
  }

  .btn {
    width: 55px;
    height: 55px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    &:hover { background-color: #eefbed; }
    &.active { color: #12bb37; }

    &.clozeBtn {
      .clozeText {
        font-size: 16px;
        font-weight: 700;
        border-bottom: 2px solid #8e44ad;
        line-height: 1.2;
      }
      &.active { color: #8e44ad; }
    }

    .icon {
      font-size: 20px;
      &.fontColor { font-size: 26px; }
    }
  }

  // 下拉包裹器
  .dropdownWrap {
    position: relative;
    height: 55px;
    display: flex;
    align-items: center;

    .dropdownPanel {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      margin-top: 4px;
      background: #fff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.12);
      padding: 4px 0;
      max-height: 280px;
      overflow-y: auto;

      .fontOptionItem {
        min-width: 120px;
        height: 30px;
        padding: 0 16px;
        display: flex;
        align-items: center;
        cursor: pointer;
        white-space: nowrap;
        &:hover { background-color: #f7f7f7; }
        &.active { color: #12bb37; }
      }

      &.colorPanel {
        padding: 8px;
      }
    }
  }
}

.isDark {
  .dropdownWrap .dropdownPanel {
    background: #363b3f;
    border-color: rgba(255, 255, 255, 0.1);
    .fontOptionItem {
      color: #fff;
      &:hover { background-color: hsla(0, 0%, 100%, 0.05); }
    }
  }
}
</style>
