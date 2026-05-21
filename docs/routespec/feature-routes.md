# Feature Route Map

## Project Overview

- Application type: Electron 桌面翻译工具（React + Tailwind）
- Build tool: electron-vite
- Main entry: `src/main/index.ts` → `src/renderer/src/main.tsx` → `src/renderer/src/App.tsx`
- Core directories: `src/main/`, `src/preload/`, `src/renderer/src/`
- Test entry: none

## Module Index

- Electron Main: 窗口管理, 全局快捷键, IPC 通信, 翻译引擎
- UI Components: 输入面板, 结果面板, 工具栏, 设置弹窗, 提示词配置弹窗
- Lib: 语言检测, 翻译调用, 设置存储
- Build/Release: Windows 安装包构建与发布

## Build/Release

### Windows 安装包构建

- Description: `pnpm build:win` 先清理 `release/`，再执行 electron-vite 构建与 electron-builder Windows 打包；安装包输出到 `release/`
- Entry: `package.json` (`scripts.build:win`)
- Core: `package.json` (`build:win` 脚本), `electron-builder.yml` (`directories.output`, `win.artifactName`)
- Notes: 当前安装包命名格式为 `${name}-${version}-setup.${ext}`；发布前需确认用户已在宿主机完成对应版本号安装包打包

## Electron Main

### 窗口管理

- Description: 无边框置顶小窗创建、右下偏中默认定位、窗口位置/大小持久化、最小尺寸、关闭行为选择、托盘显隐控制
- Entry: `src/main/index.ts:7` (`getDefaultBounds` / `createWindow`)
- Core: `src/main/index.ts:7-100` (BrowserWindow 配置、窗口 bounds 存储、托盘与关闭行为)
- Notes: 窗口 bounds 存储在 electron-store 的 `windowBounds`；关闭行为存储在 `closeBehavior`

### 全局快捷键

- Description: 默认 `Alt+1` 全局呼出/隐藏翻译窗口，显示窗口时读取系统剪贴板纯文本并写入输入区，支持在设置菜单中修改快捷键
- Entry: `src/main/index.ts` (`registerGlobalShortcut` / `globalShortcut.register`)
- Core: `src/main/index.ts` (快捷键读取、规范化、注册与重新注册、剪贴板文本读取), `src/renderer/src/App.tsx` (接收剪贴板文本并写入输入区), `src/renderer/src/components/ShortcutSettingsModal.tsx` (快捷键配置弹窗)
- Notes: store 键 `globalShortcut`；快捷键修改通过 `shortcut:set` IPC 注册，注册失败时保留原快捷键；剪贴板注入通过 `input:setFromClipboard` 事件

### IPC 通信

- Description: preload 暴露 `window.api`，主进程注册 IPC handlers
- Entry: `src/preload/index.ts` (contextBridge 暴露 API)
- Core: `src/main/ipc-handlers.ts`
- Notes: 通道包括 `store:get/set`, `window:setAlwaysOnTop`, `window:close`, `window:quit`, `shortcut:set`, `input:setFromClipboard`, `translate:start/chunk/done/error/abort`

### 翻译引擎

- Description: 可插拔翻译源架构，当前内置 AI 翻译源（OpenAI 兼容 API），支持翻译/润色/解释三种模式，SSE 流式返回结果；三种模式的系统提示词均可配置，使用 `{{变量名}}` 模板语法
- Entry: `src/main/translate/index.ts`（注册表）, `src/main/ipc-handlers.ts`（translate:start handler + 提示词初始化）
- Core: `src/main/translate/sources/openai-compatible.ts`（OpenAI Compatible 实现：fetch + SSE 解析、mode 分发、模板变量渲染）, `src/main/translate/types.ts`（TranslateMode 类型）
- Notes: store 键 `apiBaseURL`、`apiKey`、`apiModel`、`translatePrompt`、`polishPrompt`、`explainPrompt`；默认源 id `openai-compatible`；`translate:start` IPC 传递 `mode` 字段；模板变量包括 `{{from}}`、`{{to}}`、`{{fromName}}`、`{{toName}}`、`{{greetingFrom}}`、`{{greetingTo}}`；应用启动时自动初始化默认提示词

## UI Components

### 输入面板

- Description: textarea 输入区，右下角三个图标按钮（翻译/润色/解释），hover 显示说明，空白内容和处理中不触发
- Entry: `src/renderer/src/components/InputPanel.tsx`
- Core: `src/renderer/src/App.tsx` (`handleSubmit` 接收 mode 参数)

### 结果面板

- Description: 翻译结果展示 + 流式打字光标 + 复制按钮
- Entry: `src/renderer/src/components/ResultPanel.tsx`
- Core: `src/renderer/src/App.tsx:88`

### 工具栏

- Description: 底部工具栏 — 置顶开关
- Entry: `src/renderer/src/components/Toolbar.tsx`
- Core: `src/renderer/src/App.tsx:89-95`

### 标题栏

- Description: 可拖拽标题栏 + 左上角菜单（设置翻译源、设置互译语言、设置翻译/润色/解释提示词、设置快捷键、设置关闭行为、退出应用）+ 关闭按钮
- Entry: `src/renderer/src/components/TitleBar.tsx`

### 语言设置弹窗

- Description: 设置默认互译语言对（英语、日语、韩语、中文、法语、德语），持久化到 electron-store 的 `languagePair`
- Entry: `src/renderer/src/components/LanguageSettingsModal.tsx`
- Core: `src/renderer/src/App.tsx` (读取/保存 `languagePair`，翻译时按语言对自动双向翻译)

### 关闭行为弹窗

- Description: 首次点击关闭按钮且未设置时选择关闭到托盘或退出应用，选择后持久化；后续点击关闭按钮直接执行已保存行为
- Entry: `src/renderer/src/components/CloseBehaviorModal.tsx`
- Core: `src/renderer/src/App.tsx` (读取/保存 `closeBehavior` 并调用 `window:close`)

### 设置弹窗

- Description: 翻译源配置弹窗（选择翻译源、OpenAI BaseURL、API Key、Model），首次启动无 API Key 时自动弹出
- Entry: `src/renderer/src/components/SettingsModal.tsx`
- Core: `src/renderer/src/App.tsx`（读取/保存 `apiBaseURL`、`apiKey`、`apiModel`）

### 提示词配置弹窗

- Description: 翻译/润色/解释三种模式的系统提示词编辑弹窗，无边框编辑器 + `{{变量名}}` 模板高亮 + 自定义滚动条，编辑器大小随窗口自适应；组件自行从 store 加载/保存提示词
- Entry: `src/renderer/src/components/PromptSettingsModal.tsx`
- Core: `src/renderer/src/App.tsx`（三个弹窗的显示控制），`src/renderer/src/styles/index.css`（`.highlight-editor` 滚动条样式）

## Lib

### 语言检测

- Description: CJK 字符占比 >30% 判定为中文，否则英文
- Entry: `src/renderer/src/lib/lang-detect.ts`

### 翻译调用

- Description: 封装 `window.api.translate` 的流式调用，支持 `mode` 参数（translate/polish/explain），回调 onChunk
- Entry: `src/renderer/src/lib/translate.ts`

### 设置存储

- Description: 封装 electron-store 的 IPC 读写
- Entry: `src/renderer/src/lib/store.ts`

### 类型声明

- Description: `window.api` 的 TypeScript 类型声明
- Entry: `src/preload/index.d.ts`
