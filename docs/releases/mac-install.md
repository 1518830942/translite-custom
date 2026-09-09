Apple 芯片 Mac 测试版（arm64）。下载 DMG，打开后将 Translite 拖入“应用程序”；ZIP 提供同一个应用的压缩包。

### 使用
- 首次启动填写自己的 OpenAI 兼容 API 地址、密钥和模型。
- 选中文字，按下并松开 **Control+D**，自动取词、弹窗并翻译。
- 首次取词需在“系统设置 → 隐私与安全性 → 辅助功能”中允许 Translite。
- 已有安装保留原快捷键，可在设置中重新录制 Control+D。

### 功能
- 支持英美 IPA 音标与软件名拼读参考。
- 修复 Option 快捷键录制和关闭到托盘后点击 Dock 恢复窗口。

### 验证与限制
- GitHub macOS 环境构建，类型与平台逻辑检查通过；检查应用和取词助手的 arm64 架构，并启动打包后的 Electron 运行时。
- 尚未验证用户电脑上的辅助功能授权、浏览器选区和全屏桌面行为。
- 未进行 Developer ID 签名和 Apple 公证；首次打开可能需要在 macOS“隐私与安全性”中允许打开。
- 音标来自配置的 AI，推测读音不代表官方读法。安装包不包含任何 API 密钥或个人配置。

Windows 用户继续使用 [v1.2.0 Windows EXE](https://github.com/1518830942/translite-custom/releases/tag/v1.2.0)，本次未替换 Windows 安装包。
