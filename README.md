# Zmind-map 源代码

基于 [wanglin2/mind-map](https://github.com/wanglin2/mind-map) 二次开发的桌面思维导图应用。

## 项目结构

```
├── mind-map/              # 前端源码（Vue.js）
│   ├── web/               # Web 应用
│   │   ├── src/           # 源代码
│   │   ├── public/        # 静态资源
│   │   └── package.json   # 依赖配置
│   ├── simple-mind-map/   # 核心思维导图库
│   ├── copy.js            # 构建复制脚本
│   └── index.html
├── electron-app/          # Electron 桌面端
│   ├── main.js            # 主进程
│   ├── preload.js         # 预加载脚本
│   ├── build/             # 图标资源
│   └── package.json       # 打包配置
├── sync-build.js          # 构建同步脚本
└── zmind-map-changes.md   # 与原项目的对比分析报告
```

## 开发环境搭建

### 1. 安装前端依赖并构建

```bash
cd mind-map/web
npm install
npm run build
```

### 2. 同步构建产物到 Electron 目录

```bash
# 回到项目根目录
cd ../..
node sync-build.js
```

### 3. 安装 Electron 依赖

```bash
cd electron-app
npm install
```

### 4. 开发模式运行

```bash
npm start
```

### 5. 打包安装程序

```bash
npm run pack
```

打包产物输出至 `electron-app/release2/`。

## 环境要求

- Node.js >= 16
- npm >= 8
- Windows x64（打包目标平台）

## 注意事项

- 如遇到 OpenSSL 兼容性问题，设置环境变量：`set NODE_OPTIONS=--openssl-legacy-provider`
- 首次构建需要分别在前端目录和 Electron 目录执行 `npm install`
- `app2/dist/` 目录是前端构建产物，由 `sync-build.js` 生成，不包含在源码中
