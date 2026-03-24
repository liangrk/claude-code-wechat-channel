# Claude Code WeChat Bot

通过微信 ClawBot 与 Claude Code 对话。在微信中发送消息，Bot 调用 Claude 处理后自动回复。

## 前置要求

- Node.js >= 18
- `ANTHROPIC_API_KEY` 环境变量（支持第三方兼容 API，如 GLM/智谱）
- 微信 iOS 或 Android 最新版（需支持 ClawBot）

## 安装

```bash
npm install -g @liangrk/claude-code-wechatbot
```

或直接使用 npx（无需安装）：

```bash
npx @liangrk/claude-code-wechatbot setup
npx @liangrk/claude-code-wechatbot bot
```

## 使用

### 1. 扫码登录

```bash
npx @liangrk/claude-code-wechatbot setup
```

终端显示二维码，用微信扫描并确认。凭据保存到 `~/.claude/channels/wechat/account.json`。

### 2. 启动 Bot

```bash
npx @liangrk/claude-code-wechatbot bot
```

启动后 Bot 会持续监听微信消息。在微信中找到 ClawBot 对话，直接发消息即可。

### 3. 检查状态

```bash
npx @liangrk/claude-code-wechatbot status
```

检查账号凭据和 API 连通性。

### 内置命令（微信中发送）

- `/help` — 显示帮助
- `/clear` — 清空上下文，开始新会话

## 运行模式

### Spawn 模式（默认）

通过 `claude -p` 子进程调用 Claude Code，需要系统 PATH 中有 Claude Code >= 2.1.80。

### SDK V2 模式（推荐）

使用 `@anthropic-ai/claude-agent-sdk` 为每个用户维护持久会话，支持上下文保留和会话恢复。

```bash
npm install @anthropic-ai/claude-agent-sdk
```

安装后 Bot 会自动检测并启用 SDK 模式，无需额外配置。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | API Key（必需） | — |
| `ANTHROPIC_BASE_URL` | API 基础 URL（第三方 API 时设置） | — |
| `CLAUDE_MODEL` | 模型名称 | `claude-sonnet-4-6` |
| `CLAUDE_MAX_TURNS` | 单次对话最大轮次（SDK 模式） | `5` |
| `CLAUDE_SDK_MODE` | 设为 `spawn` 强制使用 spawn 模式 | 自动检测 |

## 支持的消息类型

- 文本消息
- 语音消息（自动转文字）
- 图片消息（发送给 Claude 视觉分析）
- 文件消息（显示文件名和大小）
- 视频消息（显示时长）

## 故障排查

### 会话过期

```
npx @liangrk/claude-code-wechatbot status
```

如果提示 `SESSION EXPIRED`，重新运行 `setup` 扫码登录。

### 消息收不到

1. 确认 Bot 进程正在运行
2. 确认消息发送给了 ClawBot（不是普通联系人）
3. 用 `status` 命令检查 API 连通性

## License

MIT
