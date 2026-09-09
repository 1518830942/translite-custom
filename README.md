# Translite Custom

基于 [GmwEnterprise/translite](https://github.com/GmwEnterprise/translite) 的桌面翻译工具，上游基线为 `563f270`（1.1.4）。支持 Windows x64 和 Apple 芯片 Mac，保留上游代码与来源，并新增一键取词翻译、窗口唤醒修正和英文音标。

## 下载与使用

1. 在 [Releases](https://github.com/1518830942/translite-custom/releases) 下载 Windows x64 安装包，或 Apple 芯片 Mac 测试版的 `mac-arm64.dmg` / `mac-arm64.zip`。
2. Windows 10/11 x64 运行安装程序；Apple 芯片 Mac 打开 DMG 后将 Translite 拖入“应用程序”。使用者无需安装 Node.js 或开发工具。
3. 首次启动填写自己的 OpenAI 兼容 API Base URL、API Key 和模型名称。
4. 在浏览器等应用选中文字，Windows 按下并松开 **Alt+E**，Mac 使用 **Control+D**（不是 Command+D），自动复制、弹窗并翻译。

macOS 首次一键取词时会请求“辅助功能”权限。请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 Translite，然后再次按快捷键。该权限仅用于模拟 `Command+C` 复制当前选择；未授权时应用只显示窗口，不会读取旧剪贴板内容。

新安装在 Windows 默认 `Alt+E`，在 Mac 默认 `Control+D`。已有安装保留保存的快捷键；Mac 升级后如仍使用旧快捷键，可在菜单中重新录制 Control+D。安装包不包含任何 API 密钥、公司配置、翻译记录或个人账户信息。

## 定制功能

- 自动复制当前选中文字，不必先按 Ctrl+C；复制失败时不翻译旧剪贴板。
- 翻译窗口已打开或最小化时，支持恢复及平台原生前台激活。
- 翻译中再次取词，保留最新一条待翻译内容。
- 单个英文单词显示英式、美式 IPA 音标，与翻译共用一次 API 请求。
- 软件名等专有名词可提供拼读参考；音标来自 AI，推测读音不是官方读法。无结果时显示“暂无音标”。
- 音标与译文分开显示，点击译文仍只复制译文。
- 保留中文、英文、日文目标语言、润色、解释、置顶、托盘和主题设置。

自动复制依赖来源应用支持 Windows 的 Ctrl+C 或 macOS 的 Command+C。系统权限高于本软件的窗口可能无法自动取词。当前安装包未做商业代码签名；直接分发 Mac 包时，用户可能需要按住 Control 点击应用并选择“打开”。

配置位于 Electron 的 `userData` 目录（Windows 为 `%APPDATA%\translite`，macOS 为 `~/Library/Application Support/translite`）；请求及回复保存在用户目录下的 `.translite/ai-requests`，其中可能包含翻译原文。上述数据均不属于安装包或源码仓库。Windows 卸载器沿用上游设置，会删除应用配置；需要时请先自行备份。

## 开发与打包

通用环境：Node.js 22.19+、pnpm 11.19.0。Windows 构建需要系统自带的 .NET Framework 4.x C# 编译器；Mac 构建必须在 Apple 芯片 Mac 上运行，并安装 Xcode Command Line Tools（用于 `swiftc`）。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:win
```

Windows 安装包输出到 `release/`。`build:win` 会先从 `src/native/SelectionCopy.cs` 编译取词与激活助手，无需提交生成的 EXE。

在 Apple 芯片 Mac 上构建 arm64 DMG 和 ZIP：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:mac
```

产物为 `release/translite-custom-<version>-mac-arm64.dmg` 和同名 ZIP。构建命令会用 `swiftc` 将 `src/native/SelectionCopy.swift` 编译为 arm64 原生取词助手；生成的二进制不提交到仓库。当前配置生成未签名、未公证的本地测试包。正式分发前应配置 Apple Developer ID、Hardened Runtime 和公证。

```powershell
pnpm dev
node scripts/test-phonetics.cjs
node scripts/test-window-raise.cjs
# 先执行 build:win 或 electron-vite build，再测试真实 Electron 界面（模拟 API）
node node_modules/electron/cli.js scripts/test-clipboard.cjs
```

`scripts/test-live-phonetics.cjs` 是手动的真实 API 检查：会读取本机配置，向已配置的服务发送 hello 和 Aseprite 两次请求。它不会自动运行，也不包含凭证。

## 来源与许可证

上游：[GmwEnterprise/translite](https://github.com/GmwEnterprise/translite)。上游 README 声明 MIT 许可证，本定制版延续该声明。Translite 的原有代码与图标来源于上游，本仓库不代表上游官方发布。
