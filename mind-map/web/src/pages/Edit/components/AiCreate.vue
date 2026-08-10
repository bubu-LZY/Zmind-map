<template>
  <div>
    <!-- 客户端连接失败提示弹窗 -->
    <el-dialog
      class="clientTipDialog"
      :title="$t('ai.connectFailedTitle')"
      :visible.sync="clientTipDialogVisible"
      width="400px"
      append-to-body
    >
      <div class="tipBox">
        <p>{{ $t('ai.connectFailedTip') }}</p>
        <p>
          {{ $t('ai.connectFailedCheckTip1')
          }}<a
            href="https://pan.baidu.com/s/1huasEbKsGNH2Af68dvWiOg?pwd=3bp3"
            >{{ $t('ai.baiduNetdisk') }}</a
          >、<a href="https://github.com/wanglin2/mind-map/releases">Github</a>
        </p>
        <p>{{ $t('ai.connectFailedCheckTip2') }}</p>
        <P>{{ $t('ai.connectFailedCheckTip3') }}</P>
        <p>
          {{ $t('ai.connectFailedCheckTip4')
          }}<el-button size="small" @click="testConnect">{{
            $t('ai.connectionDetection')
          }}</el-button>
        </p>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button type="primary" @click="clientTipDialogVisible = false">{{
          $t('ai.close')
        }}</el-button>
      </div>
    </el-dialog>
    <!-- ai内容输入弹窗 -->
    <el-dialog
      class="createDialog"
      :title="$t('ai.createMindMapTitle')"
      :visible.sync="createDialogVisible"
      width="450px"
      append-to-body
    >
      <div class="inputBox">
        <el-input
          type="textarea"
          :rows="5"
          :placeholder="$t('ai.createTip')"
          v-model="aiInput"
        >
        </el-input>
        <div class="tip warning">
          {{ $t('ai.importantTip') }}
        </div>
        <div class="tip">
          {{ $t('ai.wantModifyAiConfigTip')
          }}<el-button size="small" @click="showAiConfigDialog">{{
            $t('ai.modifyAIConfiguration')
          }}</el-button>
        </div>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button @click="closeAiCreateDialog">{{
          $t('ai.cancel')
        }}</el-button>
        <el-button type="primary" @click="doAiCreate">{{
          $t('ai.confirm')
        }}</el-button>
      </div>
    </el-dialog>
    <!-- ai生成中添加一个透明层，防止期间用户进行操作 -->
    <div
      class="aiCreatingMask"
      ref="aiCreatingMaskRef"
      v-show="aiCreatingMaskVisible"
    >
      <el-button type="warning" class="btn" @click="stopCreate">{{
        $t('ai.stopGenerating')
      }}</el-button>
    </div>
    <AiConfigDialog v-model="aiConfigDialogVisible"></AiConfigDialog>
    <!-- AI续写 -->
    <el-dialog
      class="createDialog"
      :title="$t('ai.aiCreatePart')"
      :visible.sync="createPartDialogVisible"
      width="450px"
      append-to-body
    >
      <div class="inputBox">
        <div class="partOptions">
          <el-button
            size="small"
            :type="useReferenceKnowledge ? 'primary' : 'default'"
            @click="useReferenceKnowledge = !useReferenceKnowledge"
          >{{ $t('ai.aiCreatePartReferenceKnowledge') }}</el-button>
          <el-button
            size="small"
            :type="useMinimalistMode ? 'primary' : 'default'"
            @click="useMinimalistMode = !useMinimalistMode"
          >{{ $t('ai.aiCreatePartMinimalist') }}</el-button>
        </div>
        <el-input type="textarea" :rows="5" v-model="aiPartInput"> </el-input>
        <el-input
          v-if="useReferenceKnowledge"
          type="textarea"
          :rows="4"
          class="referenceInput"
          :placeholder="$t('ai.aiCreatePartReferenceKnowledgePlaceholder')"
          v-model="referenceKnowledge"
        >
        </el-input>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button @click="closeAiCreatePartDialog">{{
          $t('ai.cancel')
        }}</el-button>
        <el-button type="primary" @click="confirmAiCreatePart">{{
          $t('ai.confirm')
        }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import Ai, { testAiConnection } from '@/utils/ai'
import { transformMarkdownTo } from 'simple-mind-map/src/parse/markdownTo'
import {
  createUid,
  isUndef,
  checkNodeOuter,
  getStrWithBrFromHtml
} from 'simple-mind-map/src/utils'
import { mapState } from 'vuex'
import AiConfigDialog from './AiConfigDialog.vue'

export default {
  components: {
    AiConfigDialog
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      aiInstance: null,
      isAiCreating: false,
      aiCreatingContent: '',

      isLoopRendering: false,
      uidMap: {},
      latestUid: '',

      clientTipDialogVisible: false,
      createDialogVisible: false,
      aiInput: '',
      aiCreatingMaskVisible: false,
      aiConfigDialogVisible: false,

      mindMapDataCache: '',
      beingAiCreateNodeUid: '',

      createPartDialogVisible: false,
      aiPartInput: '',
      beingCreatePartNode: null,
      useReferenceKnowledge: false,
      useMinimalistMode: false,
      referenceKnowledge: ''
    }
  },
  computed: {
    ...mapState(['aiConfig'])
  },
  created() {
    this.$bus.$on('ai_create_all', this.aiCrateAll)
    this.$bus.$on('ai_create_part', this.showAiCreatePartDialog)
    this.$bus.$on('ai_chat', this.aiChat)
    this.$bus.$on('ai_chat_stop', this.aiChatStop)
    this.$bus.$on('showAiConfigDialog', this.showAiConfigDialog)
  },
  mounted() {
    document.body.appendChild(this.$refs.aiCreatingMaskRef)
  },
  beforeDestroy() {
    this.$bus.$off('ai_create_all', this.aiCrateAll)
    this.$bus.$off('ai_create_part', this.showAiCreatePartDialog)
    this.$bus.$off('ai_chat', this.aiChat)
    this.$bus.$off('ai_chat_stop', this.aiChatStop)
    this.$bus.$off('showAiConfigDialog', this.showAiConfigDialog)
  },
  methods: {
    // 显示AI配置修改弹窗
    showAiConfigDialog() {
      this.aiConfigDialogVisible = true
    },

    // 客户端连接检测（直连模式：真实调用一次配置的接口）
    async testConnect() {
      try {
        await testAiConnection(this.aiConfig)
        this.$message.success(this.$t('ai.connectSuccessful'))
        this.clientTipDialogVisible = false
        this.createDialogVisible = true
      } catch (error) {
        console.log(error)
        this.$message.error(this.$t('ai.connectFailed'))
      }
    },

    // 检测ai配置是否完整
    async aiTest() {
      // 检查配置
      if (
        !(
          this.aiConfig.api &&
          this.aiConfig.key &&
          this.aiConfig.model
        )
      ) {
        this.showAiConfigDialog()
        throw new Error(this.$t('ai.configurationMissing'))
      }
    },

    // AI生成整体
    async aiCrateAll() {
      try {
        await this.aiTest()
        this.createDialogVisible = true
      } catch (error) {
        console.log(error)
      }
    },

    // 关闭ai内容输入弹窗
    closeAiCreateDialog() {
      this.createDialogVisible = false
      this.aiInput = ''
    },

    // 确认生成
    doAiCreate() {
      const aiInputText = this.aiInput.trim()
      if (!aiInputText) {
        this.$message.warning(this.$t('ai.noInputTip'))
        return
      }
      this.closeAiCreateDialog()
      this.aiCreatingMaskVisible = true
      // 发起请求
      this.isAiCreating = true
      this.aiInstance = new Ai()
      this.aiInstance.init(this.aiConfig)
      this.mindMap.renderer.setRootNodeCenter()
      // 保存AI生成前的状态到历史记录，并暂停历史收集
      this.mindMap.command.originAddHistory()
      this.mindMap.command.pause()
      // 二开：保存生成前的数据，以便生成失败时恢复（setData(null) 会清空当前数据）
      this.mindMapDataCache = JSON.stringify(this.mindMap.getData())
      this.mindMap.setData(null)
      this.aiInstance.request(
        {
          messages: [
            {
              role: 'user',
              content: `${this.$t(
                'ai.aiCreateMsgPrefix'
              )}${aiInputText}${this.$t('ai.aiCreateMsgPostfix')}`
            }
          ]
        },
        content => {
          if (content) {
            const arr = content.split(/\n+/)
            this.aiCreatingContent = arr.splice(0, arr.length - 1).join('\n')
          }
          this.loopRenderOnAiCreating()
        },
        content => {
          this.aiCreatingContent = content
          this.resetOnAiCreatingStop()
          // 如果渲染循环从未启动（例如推理模型全程输出 <think> 标签），手动触发最终渲染
          if (!this.isLoopRendering && this.aiCreatingContent.trim()) {
            this.loopRenderOnAiCreating()
          }
        },
        error => {
          this.resetOnAiCreatingStop()
          // 二开：生成失败时恢复生成前的数据（setData(null) 已清空了原数据）
          if (this.mindMapDataCache) {
            try {
              const cachedData = JSON.parse(this.mindMapDataCache)
              this.mindMap.setData(cachedData)
            } catch (e) {
              console.error('[AI生成思维导图] 恢复数据失败:', e)
            }
          }
          this.resetOnRenderEnd()
          const errMsg = (error && error.message) || ''
          console.error('[AI生成思维导图] 错误:', error)
          if (errMsg) {
            this.$message.error('生成失败：' + errMsg)
          } else {
            this.$message.error(this.$t('ai.generationFailed'))
          }
        }
      )
    },

    // AI请求完成或出错后需要复位的数据
    resetOnAiCreatingStop() {
      this.aiCreatingMaskVisible = false
      this.isAiCreating = false
      this.aiInstance = null
      // 如果没有生成任何内容，直接恢复历史收集
      if (!this.aiCreatingContent.trim()) {
        this.mindMap.command.recovery()
      }
    },

    // 渲染结束后需要复位的数据
    resetOnRenderEnd() {
      this.isLoopRendering = false
      this.uidMap = {}
      this.aiCreatingContent = ''
      this.mindMapDataCache = ''
      this.beingAiCreateNodeUid = ''
      // 恢复历史收集，并保存AI操作后的最终状态
      this.mindMap.command.recovery()
      this.mindMap.command.originAddHistory()
    },

    // 停止生成
    stopCreate() {
      this.aiInstance.stop()
      this.isAiCreating = false
      this.aiCreatingMaskVisible = false
      this.$message.success(this.$t('ai.stoppedGenerating'))
    },

    // 去除推理模型的 <think> 标签内容，避免干扰 markdown 解析
    stripThinkTags(content) {
      if (!content) return ''
      // 移除已闭合的 <think>...</think>
      let result = content.replace(/<think>[\s\S]*?<\/think>/gi, '')
      // 移除未闭合的 <think> 标签（流式输出中可能还没闭合）
      if (result.includes('<think>')) {
        const thinkIdx = result.indexOf('<think>')
        // 如果有未闭合的 <think>，截断其后的内容（都是推理内容，不是实际输出）
        result = result.substring(0, thinkIdx)
      }
      return result.trim()
    },

    // 轮询进行渲染
    loopRenderOnAiCreating() {
      if (!this.aiCreatingContent.trim() || this.isLoopRendering) return
      this.isLoopRendering = true
      const cleanContent = this.stripThinkTags(this.aiCreatingContent)
      if (!cleanContent.trim()) {
        this.isLoopRendering = false
        return
      }
      const treeData = transformMarkdownTo(cleanContent)
      if (!treeData) {
        this.isLoopRendering = false
        return
      }
      this.addUid(treeData)
      let lastTreeData = JSON.stringify(treeData)

      // 在当前渲染完成时再进行下一次渲染
      const onRenderEnd = () => {
        // 处理超出画布的节点
        this.checkNodeOuter()

        // 如果生成结束数据渲染完毕，那么解绑事件
        if (!this.isAiCreating && !this.aiCreatingContent) {
          this.mindMap.off('node_tree_render_end', onRenderEnd)
          this.latestUid = ''
          return
        }

        const cleanContent = this.stripThinkTags(this.aiCreatingContent)
        if (!cleanContent.trim()) {
          setTimeout(() => {
            onRenderEnd()
          }, 500)
          return
        }
        const treeData = transformMarkdownTo(cleanContent)
        if (!treeData) {
          setTimeout(() => {
            onRenderEnd()
          }, 500)
          return
        }
        this.addUid(treeData)
        // 正在生成中
        if (this.isAiCreating) {
          // 如果和上次数据一样则不触发重新渲染
          const curTreeData = JSON.stringify(treeData)
          if (curTreeData === lastTreeData) {
            setTimeout(() => {
              onRenderEnd()
            }, 500)
            return
          }
          lastTreeData = curTreeData
          this.mindMap.updateData(treeData)
        } else {
          // 已经生成结束
          // 还要触发一遍渲染，否则会丢失数据
          this.mindMap.updateData(treeData)
          this.resetOnRenderEnd()
          this.$message.success(this.$t('ai.aiGenerationSuccess'))
        }
      }
      this.mindMap.on('node_tree_render_end', onRenderEnd)

      this.mindMap.setData(treeData)
    },

    // 处理超出画布的节点
    checkNodeOuter() {
      if (this.latestUid) {
        const latestNode = this.mindMap.renderer.findNodeByUid(this.latestUid)
        if (latestNode) {
          const { isOuter, offsetLeft, offsetTop } = checkNodeOuter(
            this.mindMap,
            latestNode,
            100,
            100
          )
          if (isOuter) {
            this.mindMap.view.translateXY(offsetLeft, offsetTop)
          }
        }
      }
    },

    // 给AI生成的数据添加uid
    addUid(data) {
      if (!data) return
      const checkRepeatUidMap = {}
      const walk = (node, pUid = '') => {
        if (!node) return
        if (!node.data) {
          node.data = {}
        }
        if (isUndef(node.data.uid)) {
          // 根据pUid+文本内容来复用上一次生成数据的uid
          const key = pUid + '-' + node.data.text
          node.data.uid = this.uidMap[key] || createUid()
          // 当前uid和之前的重复，那么重新生成一个。这种情况很少，但是以防万一
          if (checkRepeatUidMap[node.data.uid]) {
            node.data.uid = createUid()
          }
          this.latestUid = this.uidMap[key] = node.data.uid
          checkRepeatUidMap[node.data.uid] = true
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            walk(child, node.data.uid)
          })
        }
      }
      walk(data)
    },

    // 显示AI续写弹窗
    showAiCreatePartDialog(node) {
      this.beingCreatePartNode = node
      this.useReferenceKnowledge = false
      this.useMinimalistMode = false
      this.referenceKnowledge = ''
      const currentMindMapData = this.mindMap.getData()
      // 填充默认内容
      this.aiPartInput = `${this.$t(
        'ai.aiCreatePartMsgPrefix'
      )}${getStrWithBrFromHtml(currentMindMapData.data.text)}${this.$t(
        'ai.aiCreatePartMsgCenter'
      )}${getStrWithBrFromHtml(node.getData('text'))}${this.$t(
        'ai.aiCreatePartMsgPostfix'
      )}`
      this.createPartDialogVisible = true
    },

    // 关闭AI续写弹窗
    closeAiCreatePartDialog() {
      this.createPartDialogVisible = false
    },

    // 复位AI续写弹窗数据
    resetAiCreatePartDialog() {
      this.beingCreatePartNode = null
      this.aiPartInput = ''
      this.referenceKnowledge = ''
    },

    // 确认AI续写
    confirmAiCreatePart() {
      if (!this.aiPartInput.trim()) return
      if (this.useReferenceKnowledge && !this.referenceKnowledge.trim()) {
        this.$message.warning(this.$t('ai.aiCreatePartReferenceKnowledgePlaceholder'))
        return
      }
      this.closeAiCreatePartDialog()
      this.aiCreatePart()
    },

    // 构建AI续写的完整提示词
    buildAiPartPrompt() {
      let prompt = this.aiPartInput.trim()
      if (this.useReferenceKnowledge && this.referenceKnowledge.trim()) {
        prompt += this.$t('ai.aiCreatePartReferenceKnowledgeMsg') + this.referenceKnowledge.trim()
      }
      if (this.useMinimalistMode) {
        prompt += this.$t('ai.aiCreatePartMinimalistMsg')
      }
      prompt += this.$t('ai.aiCreatePartMsgHelp')
      return prompt
    },

    // AI生成部分
    async aiCreatePart() {
      try {
        if (!this.beingCreatePartNode) {
          return
        }
        await this.aiTest()
        this.beingAiCreateNodeUid = this.beingCreatePartNode.getData('uid')
        const currentMindMapData = this.mindMap.getData()
        this.mindMapDataCache = JSON.stringify(currentMindMapData)
        this.aiCreatingMaskVisible = true
        // 发起请求
        this.isAiCreating = true
        this.aiInstance = new Ai()
        this.aiInstance.init(this.aiConfig)
        // 保存AI续写前的状态到历史记录，并暂停历史收集
        this.mindMap.command.originAddHistory()
        this.mindMap.command.pause()
        const prompt = this.buildAiPartPrompt()
        this.aiInstance.request(
          {
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          },
          content => {
            if (content) {
              const arr = content.split(/\n+/)
              this.aiCreatingContent = arr.splice(0, arr.length - 1).join('\n')
            }

            this.loopRenderOnAiCreatingPart()
          },
          content => {
            this.aiCreatingContent = content
            this.resetOnAiCreatingStop()
            this.resetAiCreatePartDialog()
            // 如果渲染循环从未启动（例如推理模型全程输出 <think> 标签），手动触发最终渲染
            if (!this.isLoopRendering && this.aiCreatingContent.trim()) {
              this.loopRenderOnAiCreatingPart()
            }
          },
          error => {
            this.resetOnAiCreatingStop()
            this.resetAiCreatePartDialog()
            // 二开：续写失败时恢复生成前的数据
            if (this.mindMapDataCache) {
              try {
                const cachedData = JSON.parse(this.mindMapDataCache)
                this.mindMap.setData(cachedData)
              } catch (e) {
                console.error('[AI续写] 恢复数据失败:', e)
              }
            }
            this.resetOnRenderEnd()
            const errMsg = (error && error.message) || ''
            console.error('[AI续写] 错误:', error)
            if (errMsg) {
              this.$message.error('生成失败：' + errMsg)
            } else {
              this.$message.error(this.$t('ai.generationFailed'))
            }
          }
        )
      } catch (error) {
        console.log(error)
      }
    },

    // 将生成的数据添加到指定节点上
    addToTargetNode(newChildren = []) {
      const initData = JSON.parse(this.mindMapDataCache)
      const walk = node => {
        if (node.data.uid === this.beingAiCreateNodeUid) {
          if (!node.children) {
            node.children = []
          }
          node.children.push(...newChildren)
          return
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            walk(child)
          })
        }
      }
      walk(initData)
      return initData
    },

    // 轮询进行部分渲染
    loopRenderOnAiCreatingPart() {
      if (!this.aiCreatingContent.trim() || this.isLoopRendering) return
      this.isLoopRendering = true
      const cleanContent = this.stripThinkTags(this.aiCreatingContent)
      if (!cleanContent.trim()) {
        this.isLoopRendering = false
        return
      }
      const partData = transformMarkdownTo(cleanContent)
      if (!partData) {
        this.isLoopRendering = false
        return
      }
      this.addUid(partData)
      let lastPartData = JSON.stringify(partData)
      const treeData = this.addToTargetNode(partData.children || [])

      // 在当前渲染完成时再进行下一次渲染
      const onRenderEnd = () => {
        // 处理超出画布的节点
        this.checkNodeOuter()

        // 如果生成结束数据渲染完毕，那么解绑事件
        if (!this.isAiCreating && !this.aiCreatingContent) {
          this.mindMap.off('node_tree_render_end', onRenderEnd)
          this.latestUid = ''
          return
        }

        const cleanContent = this.stripThinkTags(this.aiCreatingContent)
        if (!cleanContent.trim()) {
          setTimeout(() => {
            onRenderEnd()
          }, 500)
          return
        }
        const partData = transformMarkdownTo(cleanContent)
        if (!partData) {
          setTimeout(() => {
            onRenderEnd()
          }, 500)
          return
        }
        this.addUid(partData)
        const treeData = this.addToTargetNode(partData.children || [])

        if (this.isAiCreating) {
          // 如果和上次数据一样则不触发重新渲染
          const curPartData = JSON.stringify(partData)
          if (curPartData === lastPartData) {
            setTimeout(() => {
              onRenderEnd()
            }, 500)
            return
          }
          lastPartData = curPartData
          this.mindMap.updateData(treeData)
        } else {
          this.mindMap.updateData(treeData)
          this.resetOnRenderEnd()
          this.$message.success(this.$t('ai.aiGenerationSuccess'))
        }
      }
      this.mindMap.on('node_tree_render_end', onRenderEnd)
      // 因为是续写，所以首次也直接使用updateData方法渲染
      this.mindMap.updateData(treeData)
    },

    // AI对话
    async aiChat(
      messageList = [],
      progress = () => {},
      end = () => {},
      err = () => {}
    ) {
      try {
        await this.aiTest()
        // 发起请求
        this.isAiCreating = true
        this.aiInstance = new Ai()
        this.aiInstance.init(this.aiConfig)
        // 检测消息中是否包含图片
        let hasImages = false
        const messages = messageList.map(msg => {
          if (typeof msg === 'string') {
            return {
              role: 'user',
              content: msg
            }
          }
          // 带图片的消息使用 OpenAI Vision 格式
          const content = []
          if (msg.text) {
            content.push({ type: 'text', text: msg.text })
          }
          if (msg.images && msg.images.length > 0) {
            hasImages = true
            msg.images.forEach(img => {
              content.push({
                type: 'image_url',
                image_url: { url: img }
              })
            })
          }
          // 确保至少有一个内容项
          if (content.length === 0) {
            content.push({ type: 'text', text: '' })
          }
          return { role: 'user', content }
        })
        const requestData = { messages }
        // 发送图片时添加 max_tokens（部分视觉 API 必须指定）
        if (hasImages) {
          requestData.max_tokens = 4096
        }
        // 调试日志：输出实际发送给 API 的请求体（图片 URL 截断显示）
        console.log('[AI对话] 请求API:', JSON.stringify({
          ...requestData,
          messages: requestData.messages.map(m => ({
            role: m.role,
            content: Array.isArray(m.content)
              ? m.content.map(c => c.type === 'image_url' ? { type: c.type, image_url: { url: c.image_url.url.substring(0, 80) + '...' } } : c)
              : m.content
          }))
        }, null, 2))
        this.aiInstance.request(
          requestData,
          content => {
            progress(content)
          },
          content => {
            end(content)
          },
          error => {
            err(error)
          }
        )
      } catch (error) {
        console.log(error)
      }
    },

    // AI对话停止
    aiChatStop() {
      if (this.aiInstance) {
        this.aiInstance.stop()
        this.isAiCreating = false
        this.aiInstance = null
      }
    }
  }
}
</script>

<style lang="less" scoped>
.clientTipDialog,
.createDialog {
  /deep/ .el-dialog__body {
    padding: 12px 20px;
  }
}

.tipBox {
  p {
    margin-bottom: 12px;

    a {
      color: #409eff;
    }
  }
}

.inputBox {
  .partOptions {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .referenceInput {
    margin-top: 10px;
  }

  .tip {
    margin-top: 12px;

    &.warning {
      color: #f56c6c;
    }
  }
}

.aiCreatingMask {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 99999;
  background-color: transparent;

  .btn {
    position: absolute;
    left: 50%;
    top: 100px;
    transform: translateX(-50%);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    font-weight: bold;
  }
}
</style>
