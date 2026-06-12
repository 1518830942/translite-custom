## 项目概况

基于 Electron 的轻量翻译工具，使用 electron-vite 构建。

- 技术栈：Electron + React + Tailwind CSS + TypeScript
- 目录结构：`src/main/`（主进程）、`src/preload/`（预加载）、`src/renderer/src/`（渲染进程）
- electron-vite 构建输出：`out/`
- Windows 安装包输出：`release/`

## 环境说明

当前环境为 Windows 原生（Win10/11），AI 可直接执行构建、打包等命令。

## 常用命令

- `pnpm dev` — 启动开发模式（需由用户手动启动）
- `pnpm typecheck` — 类型检查
- `pnpm build:win` — 清理 `release/` 后构建 Windows 安装包

## 发布流程

1. 更新 `package.json` 中的 `version` 字段
2. 提交并推送代码
3. 创建并推送 tag：`git tag v<version> && git push origin v<version>`
4. 执行 `pnpm build:win` 构建安装包
5. 执行 `gh release create v<version> release/translite-<version>-setup.exe --title "v<version>" --notes "Release notes"` 创建 release 并上传安装包

## 开发环境配置 (Windows)

### 系统要求

- Windows 10 或更高版本
- [Node.js](https://nodejs.org/) (建议 LTS 版本)
- [pnpm](https://pnpm.io/) 包管理器

### 常用开发命令

```bash
# 安装依赖
pnpm install

# 启动开发模式
pnpm dev

# 类型检查
pnpm typecheck

# 构建 Windows 安装包 (在项目根目录执行)
pnpm build:win
```

### 调试技巧

- 开发模式下，Electron DevTools 可通过 `Ctrl+Shift+I` 打开。
- 检查日志输出，排查常见问题。

