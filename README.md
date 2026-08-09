# Zmind-map 新增功能说明

> 本项目基于 **思绪思维导图（simple-mind-map）** 二次开发。
> 原项目地址：https://github.com/wanglin2/mind-map
> 在线体验：https://wanglin2.github.io/mind-map/ ｜ 官网：https://sxmind.cn/

---

## 先说说原项目

第一次翻 `simple-mind-map` 的源码时，说实话有点震撼。

一个纯前端的思维导图内核，能把布局算法（逻辑结构图、思维导图、组织结构图、目录组织图、时间轴、鱼骨图……）、富文本编辑、主题系统、导入导出、插件机制这些东西做得这么完整，而且 API 设计得干净利落——`MindMap` 实例挂一堆能力，插件按需 `usePlugin`，节点数据结构简洁得让人想直接抄作业。文档还写了整整一份 `README_MORE_ZH.md`，五万多字，把每个配置项、每个事件、每个方法都讲清楚了。

更难得的是它 MIT 协议开源，并且真的可以拿来用在生产环境里。本项目所有的能力底座，都来自 wanglin2 的这份工作。

**如果这个项目对你有帮助，请优先去给原项目点个 Star：https://github.com/wanglin2/mind-map**

下面记录的是我在它的基础上，为自己的「记忆 + 复习」使用场景加进去的东西。

---

## 一、桌面客户端（Electron）

把 Web 端封装成了一个 Windows 桌面程序，包名 `Zmind-map`。

- **自定义 `app://` 协议加载**：注册为 privileged scheme（`standard` + `secure`），这样 `localStorage` 能按 `app://local` 这个源正常持久化，避免 `file://` 下的一堆限制。资源读取走主进程 `fs`，原生支持 asar。
- **系统托盘常驻**：托盘菜单直达「复习模式」「AI 对话」「一键复制网页端访问地址」，点关闭按钮是收进托盘而不是退出。
- **开机自启动**：默认开启，也可以在设置里关掉。
- **单实例锁**：防止多开导致同一个文件被两个窗口互相覆盖，第二次启动会唤起已有窗口。
- **多窗口**：`Ctrl+T` 开新窗口，`Ctrl+W` 关当前窗口。
- **稳定性兜底**：`render-process-gone` 后自动重建/重载窗口，`powerSaveBlocker` 阻止息屏挂起，`unhandledRejection` / `uncaughtException` 全部落到 `userData/mindmap-debug.log`，方便事后排查。
- **AI 接口直连**：桌面端关掉了 Chromium 同源策略，并对 `OPTIONS` 预检强制返回 200，这样可以直接填任意第三方 API 地址，不需要额外起代理。

相关文件：`main.js`、`preload.js`、`package.json`（electron-builder 配置）

---

## 二、本地文件目录树

新增 `FileSidebar.vue`，左侧多了一个真正操作本机磁盘的文件管理器。

- 可以添加任意文件夹作为根目录（首次启动自动把桌面加进去），`el-tree` 懒加载，只显示文件夹和 `.smm` / `.json` / `.md` 三类文件
- 新建文件 / 新建文件夹 / 内联重命名 / 拖拽移动 / 删除（走系统回收站，不是硬删）
- 同名冲突自动加序号：`笔记.smm` → `笔记 (1).smm`
- 打开 `.md` 文件时走 Markdown 解析导入，且不会把当前 md 当成编辑目标（避免原文被覆盖）
- 编辑内容变化后自动写回当前文件，另有「另存为」
- 「最近打开」列表
- 局部刷新：重命名/移动后只刷新受影响的父目录，其他节点的展开状态原样保留

主进程侧对应一组 `zmind:*` IPC（`listDir` / `readFile` / `writeFile` / `rename` / `remove` / `mkdir` / `createFile` / `move` / `exists`），通过 `contextBridge` 以 `window.zmindFs` 暴露，渲染进程保持 `contextIsolation: true`。

---

## 三、局域网访问 + 双向实时同步

设置里打开「开启局域网访问」，桌面端会起一个 HTTP 服务（默认 8080，端口可改），手机、平板、另一台电脑在同一网络下直接开浏览器就能用。

同步做的是**双向**的：

- 网页端 → 桌面端：注入脚本劫持 `localStorage.setItem`，对白名单 key 做 300ms 防抖，POST 到 `/api/sync`
- 桌面端 → 网页端：`/api/sse` 走 Server-Sent Events 实时推送，不是轮询
- 带 `_fromSSE` 标记位防止两端来回打乒乓
- 多个网页端同时连接时，任一端的改动会广播给其余所有客户端

同步的内容包括导图数据、配置、语言、挖空显示状态、节点折叠状态、最近文件列表、目录树根目录、复习计划。

另外给网页端补了一套 `/api/fs/*` 的 HTTP 文件接口（list / read / write / create / mkdir / rename / remove / move / exists），配合 `utils/webFs.js` 这个适配器——`window.zmindFs` 不存在时自动降级到 HTTP，所以浏览器里也能管理桌面端的文件目录树，上层组件代码完全不用改。

托盘菜单里的「一键复制网页端访问地址」会直接把 `http://内网IP:端口` 塞进剪贴板。

---

## 四、挖空（Cloze）

这块是整个二开的核心，为背书 / 记忆场景做的。

### 手动挖空

- 编辑状态下选中文字按 `Ctrl+Enter`，立刻包上紫色下划线
- 非编辑状态下按 `Ctrl+Enter`，整个节点的文字一次性挖空（再按一次取消，toggle 语义）
- 富文本悬浮工具条上也加了挖空按钮

实现上没有注册自定义 Quill Blot（Quill 2.x 下自定义 inline blot 容易踩 `extends undefined` 的坑），而是复用 Quill 内建的 `code` 格式当载体：编辑时是 `<code>`，`RichText.hideEditText` 保存时由 `clozeEncode` 转成 `<span class="smm-cloze">` 落盘，读取时 `clozeDecode` 再还原。全程在 delta 内完成，稳定且不丢数据。

### AI 挖空

工具栏新增两个模式：

- **AI 智能挖空**：保守策略。prompt 里写了一整套「保留可推测性」规则——「标签：值」格式只挖值不挖标签，句子的主谓宾不能全挖光，并列语义只挖一边，按文本长度限制挖空数量（10 字内最多 1 个，10–25 字最多 2 个，25 字以上最多 3 个），保证挖完之后靠上下文还能想起来。
- **AI 激进挖空**：大量挖关键词，用于高强度自测。

右键单个节点或框选多个节点也能只对选中范围挖空。

### 挖空版本管理

同一份导图可以存多套挖空方案，命名保存、随时切换、删除。适合「第一遍挖概念、第二遍挖细节」这种复习节奏。

### 显示控制

- 工具栏一键「显示挖空 / 隐藏挖空」
- 单个节点点一下就切换该节点的显示状态，覆盖全局设置
- 状态存 `SIMPLE_MIND_MAP_CLOZE_STATE`，跨会话保留，也参与局域网同步
- 用 `MutationObserver` 监听画布，节点重绘后自动重新应用样式（SVG `foreignObject` 里 `text-decoration` 不可靠，最终用 `background-image` 线性渐变画下划线）

### 挖空语法

大纲视图和 Markdown 里用 `[==文本==]` 表示挖空，双向可逆：

- 导图 → 大纲 / Markdown / txt：`<span class="smm-cloze">` 自动转成 `[==文本==]`
- 大纲编辑提交 / Markdown 导入：`[==文本==]` 自动升级成富文本节点并还原挖空

也就是说，你可以在任何文本编辑器里写好带挖空标记的 Markdown，粘进来就是一份现成的复习卡片。

相关文件：`utils/cloze.js`、`utils/aiCloze.js`、`simple-mind-map/src/plugins/RichText.js`、`parse/markdownTo.js`、`parse/toMarkdown.js`、`parse/toTxt.js`

---

## 五、艾宾浩斯复习计划 + 复习模式

### 复习计划

右键任意节点 →「添加到复习计划」，自动按艾宾浩斯遗忘曲线排出 9 个复习周期：

| 周期 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| 间隔 | 5 分钟 | 30 分钟 | 12 小时 | 1 天 | 2 天 | 4 天 | 7 天 | 15 天 | 31 天 |

每条记录会保存节点文本、父节点文本、所属文件路径和文件名，所以跨文件也能定位回去。删除已加入复习计划的节点时会拦截提示，避免误删。

### 复习模式

工具栏或托盘进入。有一段「复习模式」大字收缩成小球再展开成面板的过场动画，然后是左右分栏：左边按日期列出待复习任务（今日高亮、带数量角标），右边是当天的节点清单，可勾选完成。

点击任意条目会自动跳转——同文件直接定位，跨文件先加载对应文件再定位，展开所有父节点，最后用红色方框框住目标节点、外层再套一个大框标出上下文，5 秒后自动消失。

### 提醒与推送

- **定时提醒**（默认 20:00）和**忘记复习触发**（默认 23:59）两个时间点都可配置
- 到点发系统通知
- 可配置飞书 Webhook，把当天未完成的复习任务推到群里；未完成的节点还会被临时组装成一张合并的思维导图并渲染成图片
- 启动时自动补检查错过的复习任务
- 可指定备份目录，复习相关文件自动备份，三个月前的旧备份自动清理

相关文件：`utils/reviewPlan.js`、`utils/reviewNotify.js`、`pages/Edit/components/ReviewMode.vue`

---

## 六、AI 能力扩展

### 通用 OpenAI 兼容接口

新增了一套通用的 AI 接入配置，只要三个字段：**接口地址 + API Key + 模型名**。凡是符合 OpenAI Chat Completions 规范的服务都能直接填：

```
OpenAI      https://api.openai.com/v1/chat/completions
DeepSeek    https://api.deepseek.com/v1/chat/completions
火山方舟     https://ark.cn-beijing.volces.com/api/v3/chat/completions
Ollama      http://localhost:11434/v1/chat/completions
```

配套加了：

- **自动拉取模型列表**：模型输入框获得焦点时，从 chat completions 地址推导出 `/models` 并请求，直接下拉选
- **连接检测**：发一个 `max_tokens: 1` 的最小请求真实验证配置，失败时把 HTTP 状态码和响应体前 200 字符一起显示出来，不再是笼统的「请求失败」

### AI 对话增强

- **图片粘贴**：`Ctrl+V` 直接粘图进对话框，走多模态；模型不支持图片时会明确提示
- **同步文档给 AI**：一键把当前导图转成 Markdown 大纲随消息发出去，只在会话首条发送，后续消息不重复发以省 token
- **会话历史**：新建会话、历史列表、加载、删除，刷新页面自动恢复上次对话

### AI 续写

在整体生成之外新增了两种续写模式：

- **参考知识续写**：粘一段参考资料进去，prompt 里明确要求「严禁天马行空、自由发散，所有续写内容必须基于参考知识」
- **极简续写**：约束层级，优先只写一层，内容实在多才写两层

相关文件：`utils/ai.js`、`AiChat.vue`、`AiCreate.vue`、`AiConfigDialog.vue`

---

## 七、快捷键（对齐幕布使用习惯）

用惯幕布的人可以无缝切过来。

**全局**

| 快捷键 | 功能 |
|---|---|
| `Ctrl + /` | 快捷键帮助 |
| `Ctrl + Shift + F` | 全局搜索 |
| `Ctrl + Shift + A` | 导出图片 |
| `Ctrl + K` | 嵌入链接 |
| `Ctrl + Alt + Shift + M` | 大纲视图 |
| `Ctrl + Alt + Shift + P` | 禅模式 |
| `Ctrl + Shift + ↑ / ↓` | 上移 / 下移节点 |
| `Ctrl + Enter` | 挖空 / 取消挖空 |

**编辑态**

| 快捷键 | 功能 |
|---|---|
| `Tab` | 插入子节点 |
| `Shift + Tab` | 跳到上一个节点 |
| `Esc` | 退出编辑 |
| `Alt + D/R/Y/G/B/P` | 字体颜色（默认/红/黄/绿/蓝/紫） |
| `Ctrl + Alt + Y/R/H/G/B/P/C` | 高亮背景（黄/红/灰/绿/蓝/粉/青） |

颜色和高亮这两组走的是 document capture 阶段的独立监听。原因是编辑态下 `keydown` 的 `target` 通常是 `<p>` / `<span>` 或文本节点而不是 `.ql-editor` 容器，走常规注册会被静默忽略；同时做了 `e.key` 和 `e.keyCode` 双重匹配，规避部分输入法和键盘布局下 `e.key` 不可靠的问题。有选区时用 `quill.formatText` 格式化选区，无选区时退回设置节点级样式。

「上一个节点」的跳转实现了深度优先逆序遍历（`getPrevNodeInDfsOrder`），会跳过祖先节点直接落到上一分支最深的末级节点，跟幕布的行为一致。

---

## 八、大纲与编辑增强

- 大纲里 `Tab` / `Shift+Tab` 调整层级，方向键跨节点上下左右导航，左箭头折叠或跳父节点
- 大纲侧栏加了「展开全部 / 收起全部」
- 导航工具栏加了「大纲模式」按钮，一键进全屏大纲
- 新增**禅模式**：隐藏所有界面元素的纯净专注视图，工具栏按钮或 `Ctrl+Alt+Shift+P` 进入，`Esc` 退出
- 导入面板新增**「粘贴 Markdown 文本」**：直接贴 `#` 标题和 `-` / `1.` 列表，支持多层嵌套；多个顶层节点会自动包一个根节点
- **节点折叠状态记忆**：折叠了哪些节点会存进 `SIMPLE_MIND_MAP_COLLAPSE_STATE`，重开应用照原样恢复，也参与局域网同步
- **多选保持**：点击已激活的节点不再清空其他选中项，框选多个节点后可以继续单击微调

---

## 九、界面

新增 `style/appleTheme.less`，一套苹果风格的全局覆写：统一 SF Pro / 苹方系统字体栈、字体抗锯齿、弹层圆角、轻量投影。样式在 element-ui 之后引入，只做视觉层覆盖，不动组件结构。

---

## 十、工程改动

- `vue.config.js` 把 `simple-mind-map` 的 alias 指向仓库内的本地源码而不是 npm 包，方便直接改内核
- `window.$bus` 提前到应用初始化之前挂载，注入脚本能更早拿到事件总线
- 新增 electron-builder 打包配置（NSIS，可选安装目录、桌面/开始菜单快捷方式）
- `make-icon.js` / `make-icon-vector.js` 两个图标生成脚本

---

## 新增 / 改动文件一览

```
新增
├── main.js                                    Electron 主进程
├── preload.js                                 contextBridge 桥接
├── web/src/utils/cloze.js                     挖空状态管理
├── web/src/utils/aiCloze.js                   AI 挖空
├── web/src/utils/reviewPlan.js                艾宾浩斯复习计划
├── web/src/utils/reviewNotify.js              复习通知 / 飞书推送
├── web/src/utils/collapseState.js             折叠状态记忆
├── web/src/utils/webFs.js                     网页端文件系统适配器
├── web/src/style/appleTheme.less              苹果风格样式
├── web/src/pages/Edit/components/FileSidebar.vue   文件目录树
└── web/src/pages/Edit/components/ReviewMode.vue    复习模式面板

改动
├── simple-mind-map/src/plugins/RichText.js         挖空编解码
├── simple-mind-map/src/core/render/Render.js       DFS 逆序导航 / 快捷键
├── simple-mind-map/src/core/render/TextEdit.js     编辑态 Tab / Shift+Tab / Esc
├── simple-mind-map/src/core/render/node/MindMapNode.js  多选保持
├── simple-mind-map/src/parse/markdownTo.js         [==挖空==] 语法解析
├── simple-mind-map/src/parse/toMarkdown.js         挖空导出
├── simple-mind-map/src/parse/toTxt.js              挖空导出
└── web/src/**                                      工具栏、设置、AI、大纲等
```

---

## 开发与打包

```bash
# Web 端
cd web
npm install
npm run serve
npm run build

# 桌面端
npm install
npm start          # 开发运行
npm run pack       # 打包 Windows x64 安装包
```

---

## 许可与致谢

本项目沿用 **MIT** 协议。

内核、布局算法、主题系统、导入导出、富文本编辑等全部核心能力，均来自 wanglin2 的 [mind-map / 思绪思维导图](https://github.com/wanglin2/mind-map)。这份代码的质量和文档的完整度，是这个二开项目能跑起来的前提。

再放一次原项目地址，值得你去看看：

**https://github.com/wanglin2/mind-map**
