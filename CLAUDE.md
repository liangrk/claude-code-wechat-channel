# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Requirement

- Always respond in Chinese (中文).
- All commit messages, comments, and documentation should be written in Chinese unless the content is inherently English (e.g., code identifiers, API endpoints).

## Project Overview

This is a standalone WeChat Bot that bridges WeChat messages to Claude Code. Users log in via WeChat QR code, and the bot long-polls WeChat's ilink API to forward messages through `claude -p` subprocess, then sends Claude's replies back through WeChat.

**Message flow**: WeChat (iOS/Android) → WeChat ClawBot → ilink API → bot process → `claude -p` → stdout → bot process → ilink API → WeChat

## Build Commands

```bash
# Build (bundles TypeScript + deps into dist/)
bun run build

# Build individual files
bun build setup.ts --target node --outfile dist/setup.js
bun build wechat-bot.ts --target node --outfile dist/wechat-bot.js

# Run CLI commands
npx claude-code-wechat-channel setup   # QR code WeChat login
npx claude-code-wechat-channel bot     # Start standalone bot mode
npx claude-code-wechat-channel status  # Check account and API connectivity

# Publish (runs build automatically)
npm publish
```

No test suite or linter is configured.

## Architecture

**Flat source structure** (no `src/` directory):

- **`cli.mjs`** — CLI entry point. Parses subcommands (`setup`, `bot`, `status`) and dispatches accordingly.
- **`wechat-bot.ts`** — Standalone bot implementation. Receives WeChat messages via ilink API long-polling, processes them through `claude -p` subprocess, and sends replies back via ilink API. Works with any API key (including third-party like GLM). Each user gets an independent Claude Code session (managed via `sessions.json`). Supports built-in commands (`/help`, `/clear`).
- **`setup.ts`** — QR code login flow. Calls ilink API to generate/scan QR codes and persists credentials.
- **`shared.ts`** — Shared types (MessageItem, CDNMedia, WeixinMessage), constants, and utility functions used by all modules. Includes `buildBaseInfo()`, `getUploadUrl()`, and hardcoded `CHANNEL_VERSION` (ilink protocol version, currently `"1.0.3"`).
- **`typing.ts`** — Typing indicator manager. Manages `typing_ticket` cache with 24h TTL, sends typing start/cancel via `ilink/bot/sendtyping`, with exponential backoff and silent degradation.
- **`media.ts`** — AES-128-ECB encryption/decryption for WeChat CDN media. Handles encrypted image/file download and upload pipeline (`getuploadurl` → encrypt → CDN POST).

**Runtime state** (stored in `~/.claude/channels/wechat/`):
- `account.json` — Bot credentials (`bot_token`, `ilink_bot_id`, `baseurl`, `ilink_user_id`), file permissions set to 0600
- `sync_buf.txt` — Last polled update buffer ID for resuming after restart
- `context_tokens.json` — Cached context tokens for replying to users
- `sessions.json` — Maps `sender_id → claude session_id` for multi-user conversation isolation

**In-memory state**:
- `context_token` cache: maps `sender_id → context_token` extracted from inbound messages, required to send replies back via the ilink API

**WeChat ilink API details**:
- Base URL: `https://ilinkai.weixin.qq.com`
- `channel_version`: hardcoded as `"1.0.3"` (ilink protocol version, must match official `@tencent-weixin/openclaw-weixin`)
- Auth: Bearer token with custom headers (`AuthorizationType: ilink_bot_token`, `X-WECHAT-UIN`)
- Long-poll timeout: 35s (adaptive, server may override)
- Error recovery: max 3 consecutive failures → exponential backoff; errcode -14 → session expired, 1h pause
- CDN base URL: `https://novac2c.cdn.weixin.qq.com/c2c` for encrypted media download/upload

## Key Technical Constraints

- Requires Bun for building (Node.js >= 18 or Bun >= 1.0 for runtime)
- WeChat ClawBot supports iOS and Android (subject to gradual rollout)
- Output is bundled into single JS files (no external node_modules needed at runtime)
- WeChat doesn't render markdown — all replies must be plain text
- Voice messages (type=3) are transcribed to text; text (type=1), voice, image (type=2), file (type=4), and video (type=5) are supported
- Images are downloaded from CDN, AES-decrypted, and sent to Claude as base64 data URIs (leveraging Claude's vision capability)
- Files and videos show metadata (filename, size, duration) as text descriptions

## Common Issues

### Messages not received

1. Run `npx claude-code-wechat-channel status` to check API connectivity
2. If "SESSION EXPIRED": run `setup` again to re-login
3. If "OK" but no messages: verify bot process is running
4. Ensure messages are sent to the ClawBot in WeChat (not a regular contact)

### Session expired (errcode -14)

The ilink bot token expires periodically. The bot will log "会话已过期" and pause for 1 hour before retrying. To fix immediately, run `setup` again.

### Build fails

Ensure Bun is installed: `bun --version`. If using Node.js for runtime only, you still need Bun for building.
