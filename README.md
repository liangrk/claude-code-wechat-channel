# Claude Code WeChat Bot

将微信消息桥接到 Claude Code 会话的独立 Bot。

基于微信官方 ClawBot ilink API（与 `@tencent-weixin/openclaw-weixin` 使用相同协议），让你在微信中直接与 Claude Code 对话。

## 工作原理

**Spawn 模式**（默认回退）：

```
微信 (iOS/Android) → WeChat ClawBot → ilink API → bot 进程 → claude -p → stdout → bot 进程 → ilink API → 微信
```

**SDK V2 模式**（推荐，需安装 `@anthropic-ai/claude-agent-sdk`）：

```
微信 → WeChat ClawBot → ilink API → bot 进程 → Claude Agent SDK (持久会话) → bot 进程 → ilink API → 微信
```

SDK V2 模式使用 `unstable_v2_createSession` / `resumeSession` API，为每个微信用户维护持久的 Claude 会话，支持上下文保留和会话恢复，无需每次调用子进程。

## 前置要求

- [Node.js](https://nodejs.org) >= 18（或 [Bun](https://bun.sh) >= 1.0）
- `ANTHROPIC_API_KEY`（或第三方兼容 API key，如 GLM/智谱）
- 微信 iOS 或 Android 最新版（需支持 ClawBot 插件）

**模式相关要求**：
- **Spawn 模式**：需要系统 PATH 中有 [Claude Code](https://claude.com/claude-code) >= 2.1.80
- **SDK V2 模式**：需要安装 `@anthropic-ai/claude-agent-sdk`（无需 `claude` 命令）

## 快速开始

**已发布版本（npm）：**

```bash
npx @liangrk/claude-code-wechatbot setup
npx @liangrk/claude-code-wechatbot bot
```

**未发布版本（本地源码）：**

```bash
git clone https://github.com/liangrk/claude-code-wechat-channel.git
cd claude-code-wechat-channel
npm install
npm run build
node cli.mjs setup
node cli.mjs bot
```

**启用 SDK V2 模式（推荐）：**

```bash
# 安装 SDK（npm 自动安装为 optionalDependencies，也可手动安装）
npm install @anthropic-ai/claude-agent-sdk
```

打开微信，找到 ClawBot 对话，发送消息即可与 Claude Code 对话。

内置命令：
- `/help` — 显示帮助
- `/clear` — 清空对话上下文，开始新会话

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API Key（必需） | — |
| `ANTHROPIC_BASE_URL` | API 基础 URL（支持第三方兼容 API） | — |
| `CLAUDE_SDK_MODE` | 设为 `spawn` 强制使用 spawn 模式 | 自动检测 |
| `CLAUDE_MODEL` | Claude 模型名称 | `claude-sonnet-4-6` |
| `CLAUDE_MAX_TURNS` | 单次对话最大轮次（SDK 模式） | `5` |

## 命令说明

### npm 发布版本

| 命令 | 说明 |
|------|------|
| `npx @liangrk/claude-code-wechatbot setup` | 微信扫码登录 |
| `npx @liangrk/claude-code-wechatbot bot` | 启动 Bot 模式 |
| `npx @liangrk/claude-code-wechatbot status` | 检查账号和 API 连接状态 |
| `npx @liangrk/claude-code-wechatbot help` | 显示帮助 |

### 未发布版本（本地源码）

将上述命令中的 `npx @liangrk/claude-code-wechatbot` 替换为 `node cli.mjs` 即可，例如：

```bash
node cli.mjs setup   # 微信扫码登录
node cli.mjs bot     # 启动 Bot 模式
node cli.mjs status  # 检查连接状态
```

### 停止服务

Bot 没有内置 stop 命令，通过终止进程来停止：

```bash
wmic process where "commandline like '%%wechat-bot%%'" delete
```

## 安装

```bash
npm install -g @liangrk/claude-code-wechatbot
```

全局安装后可直接使用 `claude-code-wechat-channel` 命令，无需每次 `npx`。

## 技术细节

### 消息处理

- **消息接收**: 通过 `ilink/bot/getupdates` 长轮询获取微信消息
- **消息发送**: 通过 `ilink/bot/sendmessage` 发送回复
- **认证**: 使用 `ilink/bot/get_bot_qrcode` QR 码登录获取 Bearer Token
- **支持消息类型**: 文本消息、语音消息（自动转文字）、图片消息、文件消息、视频消息
- **错误恢复**: 连续失败 3 次后指数退避，最大 60s
- **实例锁**: 防止多个实例同时运行
- **会话隔离**: 每个用户独立的 Claude Code 会话

### SDK V2 模式

- **自动检测**: 启动时自动检测 SDK 是否可用，不可用时回退到 spawn 模式
- **持久会话**: 使用 `unstable_v2_createSession` 创建会话，`resumeSession` 恢复会话
- **上下文保留**: 会话 ID 持久化到 `sessions.json`，进程重启后可恢复上下文
- **空闲超时**: 30 分钟无活动后自动关闭 SDK session（上下文保留，下次自动恢复）
- **权限处理**: 默认自动批准工具调用（`bypassPermissions`），与 spawn 模式行为一致

### 架构

```
cli.mjs              — CLI 入口，解析子命令
setup.ts             — 微信扫码登录流程
wechat-bot.ts        — 主 Bot 实现，消息收发和长轮询
session-manager.ts   — SDK V2 会话管理（创建/恢复/空闲清理/持久化）
typing.ts            — 输入中状态指示器管理
media.ts             — AES-128-ECB 加解密，CDN 媒体下载/上传
shared.ts            — 共享类型、常量和工具函数
```

## 注意事项

- 微信 ClawBot 支持 iOS 和 Android（逐步开放中）
- 每个 ClawBot 只能连接一个 bot 实例
- 微信不支持 Markdown 渲染，回复会自动转为纯文本

## License

MIT
