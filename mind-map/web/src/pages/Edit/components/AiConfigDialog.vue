<template>
  <el-dialog
    class="aiConfigDialog"
    :title="$t('ai.AIConfiguration')"
    :visible.sync="aiConfigDialogVisible"
    width="550px"
    append-to-body
  >
    <div class="aiConfigBox">
      <el-form
        :model="ruleForm"
        :rules="rules"
        ref="ruleFormRef"
        label-width="100px"
      >
        <p class="title">{{ $t('ai.VolcanoArkLargeModelConfiguration') }}</p>
        <p class="desc">{{ $t('ai.configTip') }}</p>
        <el-form-item :label="$t('ai.apiAddress')" prop="api">
          <el-input
            v-model="ruleForm.api"
            placeholder="https://api.openai.com/v1/chat/completions"
          ></el-input>
        </el-form-item>
        <el-form-item label="API Key" prop="key">
          <el-input
            v-model="ruleForm.key"
            show-password
            placeholder="sk-..."
          ></el-input>
        </el-form-item>
        <el-form-item :label="$t('ai.inferenceAccessPoint')" prop="model">
          <div class="modelRow">
            <el-select
              v-model="ruleForm.model"
              filterable
              allow-create
              default-first-option
              :placeholder="$t('ai.modelPlaceholder')"
              :loading="modelLoading"
              @focus="onModelFocus"
              class="modelSelect"
            >
              <el-option
                v-for="item in modelOptions"
                :key="item"
                :label="item"
                :value="item"
              ></el-option>
            </el-select>
            <el-button
              size="mini"
              type="primary"
              plain
              @click="fetchModels"
              :loading="modelLoading"
              class="detectBtn"
            >检测模型</el-button>
          </div>
        </el-form-item>
        <p class="desc examples">{{ $t('ai.configExamples') }}</p>
        <!-- 二开：深度思考模式开关 -->
        <el-form-item label="深度思考">
          <div class="thinkingRow">
            <el-switch
              v-model="ruleForm.enableThinking"
              active-color="#13ce66"
              inactive-color="#dcdfe6"
            ></el-switch>
            <span class="thinkingTip">开启后AI会先深度推理再回复（兼容Qwen/DeepSeek/OpenAI o系列/GLM等）</span>
          </div>
        </el-form-item>
      </el-form>
    </div>
    <div slot="footer" class="dialog-footer">
      <el-button @click="testConnection" :loading="testing">{{
        $t('ai.connectionDetection')
      }}</el-button>
      <el-button @click="cancel">{{ $t('ai.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{
        $t('ai.confirm')
      }}</el-button>
    </div>
  </el-dialog>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import { testAiConnection } from '@/utils/ai'

export default {
  model: {
    prop: 'visible',
    event: 'change'
  },
  props: {
    visible: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      aiConfigDialogVisible: false,
      testing: false,
      modelLoading: false,
      modelOptions: [],
      ruleForm: {
        api: '',
        key: '',
        model: '',
        // 二开：可用模型列表（与 aiConfig.modelList 同步）
        modelList: [],
        // 二开：深度思考模式开关
        enableThinking: false
      },
      rules: {
        api: [
          {
            required: true,
            message: this.$t('ai.apiValidateTip'),
            trigger: 'blur'
          }
        ],
        key: [
          {
            required: true,
            message: this.$t('ai.keyValidateTip'),
            trigger: 'blur'
          }
        ],
        model: [
          {
            required: true,
            message: this.$t('ai.modelValidateTip'),
            trigger: 'change'
          }
        ]
      }
    }
  },
  computed: {
    ...mapState(['aiConfig'])
  },
  watch: {
    visible(val) {
      this.aiConfigDialogVisible = val
      if (val) {
        this.initFormData()
      }
    },
    aiConfigDialogVisible(val, oldVal) {
      if (!val && oldVal) {
        this.close()
      }
    }
  },
  created() {
    this.initFormData()
  },
  methods: {
    ...mapMutations(['setLocalConfig']),

    close() {
      this.$emit('change', false)
    },

    initFormData() {
      Object.keys(this.ruleForm).forEach(key => {
        if (key === 'modelList') {
          // 二开：modelList 从 aiConfig 读取并同步到 modelOptions（用于下拉显示）
          const list = Array.isArray(this.aiConfig.modelList) ? this.aiConfig.modelList.slice() : []
          this.ruleForm.modelList = list
          this.modelOptions = list.slice()
        } else if (key === 'enableThinking') {
          // 二开：布尔值需要特殊处理（false || '' 会返回 ''）
          this.ruleForm.enableThinking = !!this.aiConfig.enableThinking
        } else {
          this.ruleForm[key] = this.aiConfig[key] || ''
        }
      })
    },

    cancel() {
      this.close()
      this.initFormData()
    },

    // 当模型输入框获得焦点时，如果已填写接口地址和Key且尚未检测过，自动获取模型列表
    onModelFocus() {
      if (
        this.ruleForm.api &&
        this.ruleForm.key &&
        this.modelOptions.length === 0
      ) {
        this.fetchModels()
      }
    },

    // 从接口获取可用模型列表
    async fetchModels() {
      if (!this.ruleForm.api || !this.ruleForm.key) {
        this.$message.warning('请先填写接口地址和 API Key')
        return
      }
      this.modelLoading = true
      try {
        // 从 chat completions 地址推导 models 地址
        let modelsUrl = this.ruleForm.api.replace(/\/+$/, '')
        if (modelsUrl.includes('/chat/completions')) {
          modelsUrl = modelsUrl.replace('/chat/completions', '/models')
        } else {
          const urlObj = new URL(modelsUrl)
          const pathParts = urlObj.pathname.split('/').filter(Boolean)
          if (pathParts.length > 0) {
            pathParts[pathParts.length - 1] = 'models'
            urlObj.pathname = '/' + pathParts.join('/')
            modelsUrl = urlObj.toString()
          }
        }

        const res = await fetch(modelsUrl, {
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + this.ruleForm.key
          }
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const data = await res.json()
        let models = []
        if (data.data && Array.isArray(data.data)) {
          models = data.data.map(m => m.id).filter(Boolean)
        } else if (Array.isArray(data.models)) {
          models = data.models
            .map(m => (typeof m === 'string' ? m : m.id || m.name))
            .filter(Boolean)
        } else if (Array.isArray(data)) {
          models = data
            .map(m => (typeof m === 'string' ? m : m.id || m.name))
            .filter(Boolean)
        }

        this.modelOptions = models.sort()
        // 二开：同步到 ruleForm.modelList，保存后供 AI 对话窗口快速切换使用
        this.ruleForm.modelList = models.slice()

        if (models.length > 0) {
          this.$message.success(`检测到 ${models.length} 个可用模型`)
        } else {
          this.$message.warning('未检测到可用模型，请手动输入')
        }
      } catch (error) {
        this.$message.error(
          '获取模型列表失败：' + (error.message || '未知错误') + '，请手动输入'
        )
      } finally {
        this.modelLoading = false
      }
    },

    // 连接检测：真实调用一次接口验证配置可用
    async testConnection() {
      this.$refs.ruleFormRef.validate(async valid => {
        if (!valid) return
        this.testing = true
        try {
          await testAiConnection(this.ruleForm)
          this.$message.success(this.$t('ai.connectSuccessful'))
        } catch (error) {
          console.log(error)
          this.$message.error(
            this.$t('ai.connectFailed') + '：' + (error.message || '')
          )
        } finally {
          this.testing = false
        }
      })
    },

    confirm() {
      this.$refs.ruleFormRef.validate(valid => {
        if (valid) {
          // 二开：保存前确保当前选中的模型在 modelList 中（用户可能通过 allow-create 手动输入新模型）
          const list = Array.isArray(this.ruleForm.modelList) ? this.ruleForm.modelList.slice() : []
          if (this.ruleForm.model && !list.includes(this.ruleForm.model)) {
            list.unshift(this.ruleForm.model)
          }
          this.ruleForm.modelList = list
          this.close()
          this.setLocalConfig({
            ...this.ruleForm
          })
          this.$message.success(this.$t('ai.configSaveSuccessTip'))
        }
      })
    }
  }
}
</script>

<style lang="less" scoped>
.aiConfigDialog {
  /deep/ .el-dialog__body {
    padding: 12px 20px;
  }

  .aiConfigBox {
    a {
      color: #409eff;
    }

    .title {
      margin-bottom: 12px;
      font-weight: bold;
    }

    .desc {
      margin-bottom: 12px;
      color: #909090;
      font-size: 12px;

      &.examples {
        white-space: pre-line;
        line-height: 1.8;
      }
    }

    .thinkingRow {
      display: flex;
      align-items: center;
      gap: 10px;

      .thinkingTip {
        font-size: 12px;
        color: #909090;
        line-height: 1.4;
      }
    }

    .modelRow {
      display: flex;
      align-items: center;
      width: 100%;

      .modelSelect {
        flex: 1;
      }

      .detectBtn {
        flex-shrink: 0;
        margin-left: 8px;
      }
    }
  }
}
</style>
