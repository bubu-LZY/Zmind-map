<template>
  <div class="navigatorContainer customScrollbar" :class="{ isDark: isDark }">
    <div class="item">
      <el-select
        v-model="lang"
        size="small"
        style="width: 100px"
        @change="onLangChange"
      >
        <el-option
          v-for="item in langList"
          :key="item.value"
          :label="item.name"
          :value="item.value"
        />
      </el-select>
    </div>
    <div class="item">
      <el-tooltip
        effect="dark"
        :content="$t('navigatorToolbar.backToRoot')"
        placement="top"
      >
        <div class="btn iconfont icondingwei" @click="backToRoot"></div>
      </el-tooltip>
    </div>
    <div class="item">
      <div class="btn iconfont iconsousuo" @click="showSearch"></div>
    </div>
    <!-- 大纲模式：一键进入全屏大纲编辑 -->
    <div class="item">
      <el-tooltip effect="dark" content="大纲模式" placement="top">
        <div
          class="btn iconfont iconfuhao-dagangshu"
          @click="enterOutlineMode"
        ></div>
      </el-tooltip>
    </div>
    <div class="item">
      <MouseAction :isDark="isDark" :mindMap="mindMap"></MouseAction>
    </div>
    <div class="item">
      <el-tooltip
        effect="dark"
        :content="
          openMiniMap
            ? $t('navigatorToolbar.closeMiniMap')
            : $t('navigatorToolbar.openMiniMap')
        "
        placement="top"
      >
        <div class="btn iconfont icondaohang1" @click="toggleMiniMap"></div>
      </el-tooltip>
    </div>
    <div class="item">
      <!-- <el-switch
        v-model="isReadonly"
        :active-text="$t('navigatorToolbar.readonly')"
        :inactive-text="$t('navigatorToolbar.edit')"
        @change="readonlyChange"
      >
      </el-switch> -->
      <el-tooltip
        effect="dark"
        :content="
          isReadonly
            ? $t('navigatorToolbar.edit')
            : $t('navigatorToolbar.readonly')
        "
        placement="top"
      >
        <div
          class="btn iconfont"
          :class="[isReadonly ? 'iconyanjing' : 'iconbianji1']"
          @click="readonlyChange"
        ></div>
      </el-tooltip>
    </div>
    <div class="item">
      <Scale :isDark="isDark" :mindMap="mindMap"></Scale>
    </div>
    <div class="item">
      <div
        class="btn iconfont"
        :class="[isDark ? 'iconmoon_line' : 'iconlieri']"
        @click="toggleDark"
      ></div>
    </div>
    <!-- <div class="item">
      <el-tooltip
        effect="dark"
        :content="$t('navigatorToolbar.changeSourceCodeEdit')"
        placement="top"
      >
        <div class="btn iconfont iconyuanma" @click="openSourceCodeEdit"></div>
      </el-tooltip>
    </div> -->
    <div class="item">
      <Demonstrate :isDark="isDark" :mindMap="mindMap"></Demonstrate>
    </div>
    <div class="item" v-if="enableAi">
      <el-tooltip effect="dark" :content="$t('navigatorToolbar.ai')" placement="top">
        <div class="btn iconfont iconAIshengcheng" @click="openAiChat"></div>
      </el-tooltip>
    </div>
    <div class="item">
      <el-dropdown @command="handleCommand">
        <div class="btn el-icon-more"></div>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="shortcutKey">
            <span class="iconfont iconjianpan"></span>
            {{ $t('navigatorToolbar.shortcutKeys') }}
          </el-dropdown-item>
          <el-dropdown-item command="client">
            <span class="iconfont icongithub"></span>
            查看GitHub项目
          </el-dropdown-item>
          <el-dropdown-item command="github">
            <span class="iconfont icongithub"></span>
            Github
          </el-dropdown-item>
          <el-dropdown-item command="site">
            <span class="iconfont iconwangzhan"></span>
            {{ $t('navigatorToolbar.site') }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
    </div>
  </div>
</template>

<script>
import Scale from './Scale.vue'
import MouseAction from './MouseAction.vue'
import { langList } from '@/config'
import i18n from '@/i18n'
import { storeLang, getLang } from '@/api'
import { mapState, mapMutations } from 'vuex'
import Demonstrate from './Demonstrate.vue'

// 导航器工具栏
export default {
  components: {
    Scale,
    MouseAction,
    Demonstrate
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      langList,
      lang: '',
      openMiniMap: false
    }
  },
  computed: {
    ...mapState({
      isReadonly: state => state.isReadonly,
      isDark: state => state.localConfig.isDark,
      enableAi: state => state.localConfig.enableAi
    })
  },
  created() {
    this.lang = getLang()
  },
  methods: {
    ...mapMutations([
      'setLocalConfig',
      'setIsReadonly',
      'setIsSourceCodeEdit',
      'setActiveSidebar'
    ]),

    readonlyChange() {
      this.setIsReadonly(!this.isReadonly)
      this.mindMap.setMode(this.isReadonly ? 'readonly' : 'edit')
    },

    toggleMiniMap() {
      this.openMiniMap = !this.openMiniMap
      this.$bus.$emit('toggle_mini_map', this.openMiniMap)
    },

    onLangChange(lang) {
      i18n.locale = lang
      storeLang(lang)
      this.$bus.$emit('lang_change')
    },

    showSearch() {
      this.$bus.$emit('show_search')
    },

    // 一键进入全屏大纲模式
    enterOutlineMode() {
      this.$store.commit('setIsOutlineEdit', true)
    },

    toggleDark() {
      this.setLocalConfig({
        isDark: !this.isDark
      })
    },

    openAiChat() {
      this.setActiveSidebar('ai')
    },

    handleCommand(command) {
      if (command === 'shortcutKey') {
        this.setActiveSidebar('shortcutKey')
        return
      }
      let url = ''
      switch (command) {
        case 'github':
          url = 'https://github.com/wanglin2/mind-map'
          break
        case 'helpDoc':
          url = 'https://wanglin2.github.io/mind-map-docs/help/help1.html'
          break
        case 'devDoc':
          url =
            'https://wanglin2.github.io/mind-map-docs/start/introduction.html'
          break
        case 'site':
          url = 'https://sxmind.cn/'
          break
        case 'issue':
          url = 'https://github.com/wanglin2/mind-map/issues/new'
          break
        case 'client':
          url = 'https://github.com/bubu-LZY/Zmind-map'
          break
        default:
          break
      }
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.click()
    },

    backToRoot() {
      this.mindMap.renderer.setRootNodeCenter()
    },

    openSourceCodeEdit() {
      this.setIsSourceCodeEdit(true)
    }
  }
}
</script>

<style lang="less" scoped>
.navigatorContainer {
  padding: 0 10px;
  position: fixed;
  right: 16px;
  bottom: 16px;
  background: hsla(0, 0%, 100%, 0.8);
  border-radius: 12px;
  opacity: 0.9;
  height: 38px;
  font-size: 11px;
  display: flex;
  align-items: center;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);

  &.isDark {
    background: #262a2e;

    .item {
      a {
        color: hsla(0, 0%, 100%, 0.6);
      }

      .btn {
        color: hsla(0, 0%, 100%, 0.6);
      }
    }
  }

  .item {
    margin-right: 14px;

    &:last-of-type {
      margin-right: 0;
    }

    a {
      color: #303133;
      text-decoration: none;
    }

    .btn {
      cursor: pointer;
      font-size: 16px;
    }
  }
}

@media screen and (max-width: 700px) {
  .navigatorContainer {
    left: 20px;
    overflow-x: auto;
    overflow-y: hidden;
    height: 60px;
  }
}
</style>
