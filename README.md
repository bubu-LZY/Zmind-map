# Zmind-map

基于 [wanglin2/mind-map](https://github.com/wanglin2/mind-map) 二次开发的 Windows 桌面思维导图应用（幕布快捷键风格，全功能免费本地版）。

当前版本：v1.4.47

## 目录结构

```
.
├── mind-map/
│   ├── web/                    # Vue2 + vue-cli4 前端
│   │   ├── src/                # 前端源码（组件 pages/Edit/components/*，工具 utils/*）
│   │   ├── public/             # 静态资源
│   │   ├── vue.config.js       # webpack 配置（alias simple-mind-map$ → 本地源码）
│   │   └── package.json
│   ├── simple-mind-map/        # 核心库源码（改源码即生效，非 npm 包）
│   │   ├── src/                # 核心源码（plugins/RichText.js 等）
│   │   ├── index.js            # 库入口
│   │   └── package.json
│   ├── index.html              # 原项目 demo 入口
│   ├── LICENSE                 # 原项目 MIT 许可
│   └── README*.md              # 原项目说明
├── electron-app/
│   ├── main.js                 # Electron 主进程（复习定时器、飞书 IPC、局域网 HTTP 服务）
│   ├── preload.js              # 预加载脚本（IPC 桥接）
│   ├── package.json            # electron-builder 打包配置
│   ├── app2/                   # 当前版本 web 构建产物（index.html + dist/）
│   └── build/                  # 应用图标
└── Zmind-map功能实现文档.md     # 功能实现文档（复用参考）
```

## 环境要求

- Node.js 22.x（推荐 22.22.2）
- Python 3.x（仅打包脚本用，可选）

## 安装依赖

```bash
# 前端依赖
cd mind-map/web
npm install

# 核心库依赖（二开直接用源码，无需单独安装 simple-mind-map npm 包）
cd ../simple-mind-map
npm install

# Electron 依赖
cd ../../electron-app
npm install
```

## 构建与打包

### 1. 构建前端

```bash
cd mind-map/web
# 通过 ZMIND_OUTDIR 指定输出目录，避免 vue-cli 清理旧 dist 触发 safe-delete 问题
ZMIND_OUTDIR="$LOCALAPPDATA/Temp/zmind-build" NODE_OPTIONS=--openssl-legacy-provider node_modules/@vue/cli-service/bin/vue-cli-service.js build
```

### 2. 同步产物到 electron-app/app2

```bash
cp -rf $TEMP/{css,js,fonts,img,logo.ico} electron-app/app2/dist/
cp -f $TEMP/index.html electron-app/app2/index.html
```

### 3. 打包 Electron 安装包

```bash
cd electron-app
env -u ELECTRON_RUN_AS_NODE node_modules/electron-builder/out/cli/cli.js --win --x64
```

产物默认输出到 `release2/`。

## 主要功能

详见 `Zmind-map功能实现文档.md`，包含以下功能的实现方法与代码示例：

- 节点内悬浮窗预览
- 文档引用（@）/ 节点引用（#）/ 跨文件引用
- 挖空功能（富文本 span + Quill code 格式）
- 艾宾浩斯复习计划（9 周期）
- AI 智能挖空 / AI 背诵改写
- 局域网端口开放（HTTP + token 鉴权 + SSE 双向同步）
- 飞书 webhook 推送

## 许可

基于原 mind-map 项目（MIT 许可）二次开发。
