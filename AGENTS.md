## 项目概况

基于 Electron 的轻量翻译工具，使用 electron-vite 构建。

- 技术栈：Electron + React + Tailwind CSS + TypeScript
- 目录结构：`src/main/`（主进程）、`src/preload/`（预加载）、`src/renderer/src/`（渲染进程）
- electron-vite 构建输出：`out/`
- Windows 安装包输出：`release/`

## 环境说明

当前环境为 WSL2，本应用目前为 Win10/11 开发，所以任何构建命令、打包命令，都应直接告诉用户执行命令，由用户手工在宿主机上执行。

## 常用命令

- `pnpm dev` — 启动开发模式
- `pnpm typecheck` — 类型检查
- `pnpm build:win` — 清理 `release/` 后构建 Windows 安装包

## 版本信息

当前版本：`1.1.3`

## 发布流程

1. 更新 `package.json` 中的 `version` 字段
2. 提交并推送代码
3. 提醒用户在宿主机执行 `pnpm build:win` 打包安装文件，确保 `release/` 下生成对应版本号的安装文件；等待用户确认打包完成
4. 创建并推送 tag：`git tag v<version> && git push origin v<version>`
5. 提醒用户在宿主机执行 `gh release create v<version> --title "v<version>" --notes "Release notes"` 发布 release

**注意：`pnpm build:win` 和 `gh release create` 均由用户在宿主机上执行，AI 不可代为执行。发布前必须确认用户已在宿主机上完成打包。**
