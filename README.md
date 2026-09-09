# Translite Custom

基于 [GmwEnterprise/translite](https://github.com/GmwEnterprise/translite) 的 Windows 定制版，上游基线为 `563f270`（1.1.4）。保留上游代码与来源，新增一键取词翻译、窗口唤醒修正和英文音标。

## 下载与使用

1. 在 [Releases](https://github.com/1518830942/translite-custom/releases/latest) 下载 `translite-custom-1.2.0-win-x64-setup.exe`。
2. 在 Windows 10/11 x64 电脑上安装，无需安装 Node.js 或开发工具。
3. 首次启动填写自己的 OpenAI 兼容 API Base URL、API Key 和模型名称。
4. 在浏览器等应用选中文字，按下并松开 **Alt+E**，自动复制、弹窗并翻译。

新安装默认快捷键为 `Alt+E`，已有安装保留保存的快捷键。可在软件菜单中修改。安装包不包含任何 API 密钥、公司配置、翻译记录或个人账户信息。

## 定制功能

- 自动复制当前选中文字，不必先按 Ctrl+C；复制失败时不翻译旧剪贴板。
- 翻译窗口已打开或最小化时，支持恢复和 Windows 原生前台激活。
- 翻译中再次取词，保留最新一条待翻译内容。
- 单个英文单词显示英式、美式 IPA 音标，与翻译共用一次 API 请求。
- 软件名等专有名词可提供拼读参考；音标来自 AI，推测读音不是官方读法。无结果时显示“暂无音标”。
- 音标与译文分开显示，点击译文仍只复制译文。
- 保留中文、英文、日文目标语言、润色、解释、置顶、托盘和主题设置。

自动复制依赖来源应用支持 Ctrl+C。系统权限高于本软件的窗口可能无法自动取词。当前安装包未做商业代码签名。

配置保存在 `%APPDATA%\translite`；上游逻辑会将请求及回复保存在 `%USERPROFILE%\.translite\ai-requests`，其中可能包含翻译原文。上述数据均不属于安装包或源码仓库。卸载器沿用上游设置，会删除应用配置；需要时请先自行备份。

## 开发与打包

环境：Windows x64、Node.js 22.19+、pnpm 11.19.0、Windows 自带的 .NET Framework 4.x C# 编译器。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:win
```

安装包输出到 `release/`。`build:win` 会先从 `src/native/SelectionCopy.cs` 编译取词与激活助手，无需提交生成的 EXE。打包仅收录编译产物、运行依赖和指定图标/原生助手。

```powershell
pnpm dev
node scripts/test-phonetics.cjs
node scripts/test-window-raise.cjs
# 先执行 build:win 或 electron-vite build，再测试真实 Electron 界面（模拟 API）
node node_modules/electron/cli.js scripts/test-clipboard.cjs
```

`scripts/test-live-phonetics.cjs` 是手动的真实 API 检查：会读取本机配置，向已配置的服务发送 hello 和 Aseprite 两次请求。它不会自动运行，也不包含凭证。

## Apple 芯片 Mac

当前版本只发布 Windows x64，**尚未支持或验证 macOS**。界面、翻译和音标可复用；完整的一键取词体验还需要：

- 将 Windows `user32` / C# 助手替换为 macOS 自动复制与窗口激活实现。
- 处理辅助功能授权、Command+C、快捷键与跨桌面/全屏窗口行为。
- 配置 macOS arm64 的 DMG/ZIP 打包，并在 Apple 芯片 Mac 上验证。
- 面向他人分发时规划 Developer ID 签名与公证。

这属于平台适配，不需要重写整个应用；当前 `build:mac` 会明确提示尚不支持。

## 来源与许可证

上游：[GmwEnterprise/translite](https://github.com/GmwEnterprise/translite)。上游 README 声明 MIT 许可证，本定制版延续该声明。Translite 的原有代码与图标来源于上游，本仓库不代表上游官方发布。
