# Claude Code WeChat Channel

将微信消息桥接到 Claude Code 会话的 Channel 插件。

基于微信官方 ClawBot ilink API（与 `@tencent-weixin/openclaw-weixin` 使用相同协议），让你在微信中直接与 Claude Code 对话。

## 工作原理

```
微信 (iOS/Android) → WeChat ClawBot → ilink API → [本插件] → Claude Code Session
                                                       ↕
Claude Code ← MCP Channel Protocol ← wechat_reply / wechat_send_image tool
```

## 前置要求

- [Node.js](https://nodejs.org) >= 18（或 [Bun](https://bun.sh) >= 1.0）
- [Claude Code](https://claude.com/claude-code) >= 2.1.80
- claude.ai 账号登录或 API key（`ANTHROPIC_API_KEY`）
- 微信 iOS 或 Android 最新版（需支持 ClawBot 插件）

## 快速开始

### 1. 微信扫码登录

```bash
npx @liangrk/claude-code-wechatbot setup
```

终端会显示二维码，用微信扫描并确认。凭据保存到 `~/.claude/channels/wechat/account.json`。

### 2. 生成 MCP 配置

```bash
npx @liangrk/claude-code-wechatbot install
```

这会在当前目录生成（或更新） `.mcp.json`，指向本插件。

### 3. 启动 Claude Code + WeChat 通道

在包含 `.mcp.json` 的目录下启动 Claude Code，MCP server 会自动加载：

```bash
claude --dangerously-skip-permissions
```

### 4. 在微信中发消息

打开微信，找到 ClawBot 对话，发送消息。消息会出现在 Claude Code 终端中，Claude 的回复会自动发回微信。

## 从源码运行（本地开发）

如果无法通过 npm 安装，可以直接从源码运行：

```bash
# 1. 克隆项目并安装依赖
git clone https://github.com/liangrk/claude-code-wechat-channel.git
cd claude-code-wechat-channel
npm install

# 2. 构建
npm run build
# 或使用 bun:
# bun run build

# 3. 扫码登录
node cli.mjs setup

# 4. 检查连接状态
node cli.mjs status

# 5. 配置 Claude Code
# 在项目目录下创建 .mcp.json，内容如下（将 /path/to 替换为实际路径）：
```

`.mcp.json` 配置（本地开发用）：

```json
{
  "mcpServers": {
    "wechat": {
      "command": "node",
      "args": ["/path/to/claude-code-wechat-channel/cli.mjs", "start"]
    }
  }
}
```

然后在包含 `.mcp.json` 的目录下启动 Claude Code：

```bash
claude --dangerously-skip-permissions
```

> **注意**: 如果安装了 Bun，也可以用 `bun cli.mjs start` 替代 `node cli.mjs start`，性能更好。

## 命令说明

| 命令 | 说明 |
|------|------|
| `npx @liangrk/claude-code-wechatbot setup` | 微信扫码登录 |
| `npx @liangrk/claude-code-wechatbot start` | 启动 MCP Channel 服务器 |
| `npx @liangrk/claude-code-wechatbot status` | 检查账号和 API 连接状态 |
| `npx @liangrk/claude-code-wechatbot install` | 生成 .mcp.json 配置 |
| `npx @liangrk/claude-code-wechatbot help` | 显示帮助 |

## 安装

```bash
npm install -g @liangrk/claude-code-wechatbot
```

全局安装后可直接使用 `claude-code-wechat-channel` 命令，无需每次 `npx`。

## 技术细节

- **消息接收**: 通过 `ilink/bot/getupdates` 长轮询获取微信消息
- **消息发送**: 通过 `ilink/bot/sendmessage` 发送回复
- **认证**: 使用 `ilink/bot/get_bot_qrcode` QR 码登录获取 Bearer Token
- **协议**: 基于 MCP (Model Context Protocol) 的 Channel 扩展
- **支持消息类型**: 文本消息、语音消息（自动转文字）、图片消息、文件消息、视频消息
- **错误恢复**: 连续失败 3 次后指数退避，最大 60s
- **实例锁**: 防止多个实例同时运行

## 注意事项

- Claude Code 会自动加载 `.mcp.json` 中的 MCP server 配置
- Claude Code 会话关闭后通道也会断开
- 微信 ClawBot 支持 iOS 和 Android（逐步开放中）
- 每个 ClawBot 只能连接一个 agent 实例
- 微信不支持 Markdown 渲染，回复会自动转为纯文本

## License

MIT
