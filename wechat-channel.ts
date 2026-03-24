#!/usr/bin/env bun
/**
 * Claude Code WeChat Channel Plugin
 *
 * Bridges WeChat messages into a Claude Code session via the Channels MCP protocol.
 * Uses the official WeChat ClawBot ilink API (same as @tencent-weixin/openclaw-weixin).
 *
 * Flow:
 *   1. QR login via ilink/bot/get_bot_qrcode + get_qrcode_status
 *   2. Long-poll ilink/bot/getupdates for incoming WeChat messages
 *   3. Forward messages to Claude Code as <channel> events
 *   4. Expose a reply tool so Claude can send messages back via ilink/bot/sendmessage
 */

import crypto from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import { execSync } from "node:child_process";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  type AccountData,
  type CDNMedia,
  type MessageItem,
  type WeixinMessage,
  DEFAULT_BASE_URL,
  CHANNEL_VERSION,
  LONG_POLL_TIMEOUT_MS,
  MSG_ITEM_TEXT,
  MSG_ITEM_IMAGE,
  MSG_ITEM_VOICE,
  MSG_ITEM_FILE,
  MSG_ITEM_VIDEO,
  buildBaseInfo,
  loadCredentials,
  saveCredentials,
  getCredentialsDir,
  getSyncBufFile,
  getContextTokensFile,
  getLockPidFile,
  apiFetch,
  fetchQRCode,
  pollQRStatus,
} from "./shared.js";
import { TypingManager } from "./typing.js";
import { downloadAndDecryptBuffer, uploadMediaToCdn, readLocalFile } from "./media.js";

// ── Config ────────────────────────────────────────────────────────────────────

const CHANNEL_NAME = "wechat";

const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_REPLY_LENGTH = 4096;
const MAX_SENDER_ID_LENGTH = 256;
const SEND_RETRY_COUNT = 2;
const SEND_RETRY_DELAY_MS = 1_000;
const CONTEXT_TOKEN_MAX_ENTRIES = 500;
const CONTEXT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LONG_POLL_TIMEOUT_MIN_MS = 10_000;
const LONG_POLL_TIMEOUT_MAX_MS = 60_000;

// ── Logging (stderr only — stdout is MCP stdio) ─────────────────────────────

function log(msg: string) {
  process.stderr.write(`[wechat-channel] ${msg}\n`);
}

function logError(msg: string) {
  process.stderr.write(`[wechat-channel] ERROR: ${msg}\n`);
}

// ── WeChat Message Types ─────────────────────────────────────────────────────

export interface GetUpdatesResp {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

// Message type constants
const MSG_TYPE_USER = 1;
const MSG_TYPE_BOT = 2;
const MSG_STATE_FINISH = 2;

// ── Context Token Cache (LRU with TTL) ──────────────────────────────────────

interface ContextTokenEntry {
  token: string;
  lastAccessed: number;
}

const contextTokenCache = new Map<string, ContextTokenEntry>();

function loadContextTokens(): void {
  try {
    const file = getContextTokensFile();
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, { token: string; ts: number }>;
    const now = Date.now();
    for (const [key, entry] of Object.entries(data)) {
      if (now - entry.ts < CONTEXT_TOKEN_TTL_MS) {
        contextTokenCache.set(key, { token: entry.token, lastAccessed: entry.ts });
      }
    }
    log(`加载 context_token 缓存: ${contextTokenCache.size} 条`);
  } catch {
    // ignore corrupt file
  }
}

function saveContextTokens(): void {
  try {
    const dir = getCredentialsDir();
    const file = getContextTokensFile();
    fs.mkdirSync(dir, { recursive: true });
    const data: Record<string, { token: string; ts: number }> = {};
    for (const [key, entry] of contextTokenCache.entries()) {
      data[key] = { token: entry.token, ts: entry.lastAccessed };
    }
    fs.writeFileSync(file, JSON.stringify(data), "utf-8");
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // best-effort on platforms that don't support chmod
    }
  } catch {
    // best-effort
  }
}

function evictContextTokens(): void {
  const now = Date.now();
  // Evict expired entries
  for (const [key, entry] of contextTokenCache.entries()) {
    if (now - entry.lastAccessed > CONTEXT_TOKEN_TTL_MS) {
      contextTokenCache.delete(key);
    }
  }
  // Evict oldest if still over max
  if (contextTokenCache.size > CONTEXT_TOKEN_MAX_ENTRIES) {
    const entries = [...contextTokenCache.entries()].sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed,
    );
    const toRemove = entries.length - CONTEXT_TOKEN_MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      contextTokenCache.delete(entries[i]![0]);
    }
  }
}

function cacheContextToken(userId: string, token: string): void {
  contextTokenCache.set(userId, { token, lastAccessed: Date.now() });
  evictContextTokens();
  saveContextTokens();
}

function getCachedContextToken(userId: string): string | undefined {
  const entry = contextTokenCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() - entry.lastAccessed > CONTEXT_TOKEN_TTL_MS) {
    contextTokenCache.delete(userId);
    return undefined;
  }
  entry.lastAccessed = Date.now();
  return entry.token;
}

// ── Instance Lock ────────────────────────────────────────────────────────────

const LOCK_STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function getLockFileAge(lockFile: string): number {
  try {
    const stat = fs.statSync(lockFile);
    return Date.now() - stat.mtimeMs;
  } catch {
    return Infinity;
  }
}

function isLikelyWechatChannel(pid: number): boolean {
  try {
    const isWin = process.platform === "win32";
    const cmd = isWin
      ? `wmic process where "ProcessId=${pid}" get CommandLine /FORMAT:LIST 2>NUL`
      : `cat /proc/${pid}/cmdline 2>/dev/null || ps -p ${pid} -o command= 2>/dev/null`;
    const output = execSync(cmd, { encoding: "utf-8", timeout: 3000 });
    return output.toLowerCase().includes("wechat-channel");
  } catch {
    // Cannot determine — assume it is to be safe
    return true;
  }
}

function acquireLock(): boolean {
  const lockFile = getLockPidFile();
  try {
    fs.mkdirSync(getCredentialsDir(), { recursive: true });

    // Use exclusive create to avoid TOCTOU race
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (err: any) {
      if (err.code === "EEXIST") {
        // Lock file exists — check if the process is still alive
        try {
          const existingPid = parseInt(fs.readFileSync(lockFile, "utf-8").trim(), 10);
          if (!isNaN(existingPid)) {
            process.kill(existingPid, 0);

            // Process is alive — check if the lock is stale (older than 10 min)
            const age = getLockFileAge(lockFile);
            if (age > LOCK_STALE_TIMEOUT_MS) {
              log(`锁文件已过期 (${Math.round(age / 60_000)} 分钟前创建)，尝试清理...`);
            } else if (isLikelyWechatChannel(existingPid)) {
              // Process is alive, lock is fresh, and it looks like our process
              logError(`另一个实例已在运行 (PID ${existingPid})，退出。`);
              return false;
            } else {
              // Process is alive but doesn't look like wechat-channel (PID reused)
              log(`PID ${existingPid} 存活但不是 wechat-channel 进程 (可能 PID 复用)，清理锁文件...`);
            }
          }
        } catch {
          // Process not running — stale lock, try to remove and retry
        }
        try {
          fs.unlinkSync(lockFile);
          const fd = fs.openSync(lockFile, "wx");
          fs.writeSync(fd, String(process.pid));
          fs.closeSync(fd);
          log("清理过期锁文件并重新获取锁");
          return true;
        } catch {
          logError("无法清理过期锁文件");
          return false;
        }
      }
      logError(`无法创建锁文件: ${String(err)}`);
      return false;
    }
  } catch (err) {
    logError(`无法获取锁文件: ${String(err)}`);
    return false;
  }
}

function releaseLock(): void {
  try {
    const lockFile = getLockPidFile();
    if (fs.existsSync(lockFile)) {
      const pid = fs.readFileSync(lockFile, "utf-8").trim();
      if (pid === String(process.pid)) {
        fs.unlinkSync(lockFile);
      }
    }
  } catch {
    // best-effort
  }
}

// ── Input Validation ─────────────────────────────────────────────────────────

const DANGEROUS_CHARS = /[\x00-\x1f\x7f]/;

function validateSenderId(senderId: string): boolean {
  if (!senderId || typeof senderId !== "string") return false;
  if (senderId.length > MAX_SENDER_ID_LENGTH) return false;
  if (DANGEROUS_CHARS.test(senderId)) return false;
  return true;
}

function truncateText(text: string, maxLen: number = MAX_REPLY_LENGTH): string {
  if (text.length <= maxLen) return text;
  log(`消息超长 (${text.length} 字符)，截断至 ${maxLen}`);
  return text.slice(0, maxLen);
}

// ── Message Extraction ───────────────────────────────────────────────────────

/**
 * Extract content from a WeChat message. Handles text, voice, image, file, and video.
 * Returns a string suitable for sending to Claude Code.
 */
async function extractContentFromMessage(msg: WeixinMessage): Promise<string> {
  if (!msg.item_list?.length) return "";

  for (const item of msg.item_list) {
    // Text message
    if (item.type === MSG_ITEM_TEXT && item.text_item?.text) {
      const text = item.text_item.text;
      const ref = item.ref_msg;
      if (!ref) return text;

      const parts: string[] = [];
      if (ref.title) parts.push(ref.title);

      if (ref.message_item) {
        const refItem = ref.message_item;
        if (refItem.text_item?.text) {
          parts.push(refItem.text_item.text);
        } else if (refItem.voice_item?.text) {
          parts.push(refItem.voice_item.text);
        }
      }

      if (!parts.length) return text;
      return `[引用: ${parts.join(" | ")}]\n${text}`;
    }

    // Voice message (transcribed text)
    if (item.type === MSG_ITEM_VOICE && item.voice_item?.text) {
      return `[语音] ${item.voice_item.text}`;
    }

    // Image message — download, decrypt, and send as base64 data URI
    if (item.type === MSG_ITEM_IMAGE && item.image_item?.media) {
      const buf = await downloadAndDecryptBuffer(item.image_item.media);
      if (buf) {
        const MAX_IMAGE_SIZE = 512 * 1024; // 512 KB
        if (buf.length > MAX_IMAGE_SIZE) {
          return `[图片] (图片过大: ${(buf.length / 1024).toFixed(0)}KB，已跳过)`;
        }
        const ext = detectImageExtension(buf);
        const b64 = buf.toString("base64");
        return `[图片] data:image/${ext};base64,${b64}`;
      }
      return "[图片] (无法下载或解密)";
    }

    // File message — show filename and size
    if (item.type === MSG_ITEM_FILE && item.file_item) {
      const fi = item.file_item;
      const parts: string[] = ["[文件]"];
      if (fi.file_name) parts.push(`名称: ${fi.file_name}`);
      if (fi.len) parts.push(`大小: ${formatFileSize(fi.len)}`);
      return parts.join(" ");
    }

    // Video message — show metadata
    if (item.type === MSG_ITEM_VIDEO && item.video_item) {
      const vi = item.video_item;
      const parts: string[] = ["[视频]"];
      if (vi.video_size) parts.push(`大小: ${formatFileSize(String(vi.video_size))}`);
      if (vi.play_length) parts.push(`时长: ${vi.play_length}秒`);
      return parts.join(" ");
    }
  }
  return "";
}

function detectImageExtension(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xFF && buf[1] === 0xD8) return "jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "gif";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "webp";
  return "png";
}

function formatFileSize(sizeStr: string): string {
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes)) return sizeStr;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── getUpdates / sendMessage ─────────────────────────────────────────────────

async function getUpdates(
  baseUrl: string,
  token: string,
  getUpdatesBuf: string,
  timeoutMs: number,
): Promise<GetUpdatesResp> {
  try {
    const raw = await apiFetch({
      baseUrl,
      endpoint: "ilink/bot/getupdates",
      body: JSON.stringify({
        get_updates_buf: getUpdatesBuf,
        base_info: buildBaseInfo(),
      }),
      token,
      timeoutMs,
    });
    return JSON.parse(raw) as GetUpdatesResp;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ret: 0, msgs: [], get_updates_buf: getUpdatesBuf };
    }
    throw err;
  }
}

function generateClientId(): string {
  return `claude-wechat:${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function sendTextMessage(
  baseUrl: string,
  token: string,
  to: string,
  text: string,
  contextToken: string,
): Promise<string> {
  const truncatedText = truncateText(text);
  const clientId = generateClientId();
  await apiFetch({
    baseUrl,
    endpoint: "ilink/bot/sendmessage",
    body: JSON.stringify({
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: clientId,
        message_type: MSG_TYPE_BOT,
        message_state: MSG_STATE_FINISH,
        item_list: [{ type: MSG_ITEM_TEXT, text_item: { text: truncatedText } }],
        context_token: contextToken,
      },
      base_info: buildBaseInfo(),
    }),
    token,
    timeoutMs: 15_000,
  });
  return clientId;
}

async function sendTextMessageWithRetry(
  baseUrl: string,
  token: string,
  to: string,
  text: string,
  contextToken: string,
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= SEND_RETRY_COUNT; attempt++) {
    try {
      return await sendTextMessage(baseUrl, token, to, text, contextToken);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < SEND_RETRY_COUNT) {
        log(`发送失败 (第 ${attempt + 1} 次)，${SEND_RETRY_DELAY_MS / 1000}s 后重试...`);
        await new Promise((r) => setTimeout(r, SEND_RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
}

// ── MCP Channel Server ──────────────────────────────────────────────────────

const mcp = new Server(
  { name: CHANNEL_NAME, version: CHANNEL_VERSION },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: [
      `Messages from WeChat users arrive as <channel source="wechat" sender="..." sender_id="...">`,
      "Reply using the wechat_reply tool. You MUST pass the sender_id from the inbound tag.",
      "Messages are from real WeChat users via the WeChat ClawBot interface.",
      "Users may send text, voice (auto-transcribed), images (base64 data URI), files, and videos.",
      "Respond naturally in Chinese unless the user writes in another language.",
      "Keep replies concise — WeChat is a chat app, not an essay platform.",
      "Strip markdown formatting (WeChat doesn't render it). Use plain text.",
      "To send an image back, use the wechat_send_image tool with a local file path.",
    ].join("\n"),
  },
);

// Tool: reply to WeChat
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "wechat_reply",
      description: "Send a text reply back to the WeChat user",
      inputSchema: {
        type: "object" as const,
        properties: {
          sender_id: {
            type: "string",
            description:
              "The sender_id from the inbound <channel> tag (xxx@im.wechat format)",
          },
          text: {
            type: "string",
            description: "The plain-text message to send (no markdown)",
          },
        },
        required: ["sender_id", "text"],
      },
    },
    {
      name: "wechat_send_image",
      description: "Send an image back to the WeChat user by uploading a local file",
      inputSchema: {
        type: "object" as const,
        properties: {
          sender_id: {
            type: "string",
            description:
              "The sender_id from the inbound <channel> tag (xxx@im.wechat format)",
          },
          file_path: {
            type: "string",
            description: "Absolute path to a local image file (PNG, JPEG, GIF, or WebP)",
          },
        },
        required: ["sender_id", "file_path"],
      },
    },
  ],
}));

let activeAccount: AccountData | null = null;
const typingManager = new TypingManager();

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "wechat_reply") {
    const { sender_id, text } = req.params.arguments as {
      sender_id: string;
      text: string;
    };

    // P0 — Input validation
    if (!validateSenderId(sender_id)) {
      return {
        content: [
          {
            type: "text" as const,
            text: "error: invalid sender_id format",
          },
        ],
      };
    }
    if (!text || typeof text !== "string") {
      return {
        content: [
          {
            type: "text" as const,
            text: "error: text is required and must be a string",
          },
        ],
      };
    }

    if (!activeAccount) {
      return {
        content: [{ type: "text" as const, text: "error: not logged in" }],
      };
    }
    const contextToken = getCachedContextToken(sender_id);
    if (!contextToken) {
      return {
        content: [
          {
            type: "text" as const,
            text: `error: no context_token for ${sender_id}. The user may need to send a message first.`,
          },
        ],
      };
    }
    try {
      // Cancel typing indicator on reply
      await typingManager.sendTyping(sender_id, 2);
      await sendTextMessageWithRetry(
        activeAccount.baseUrl,
        activeAccount.token,
        sender_id,
        text,
        contextToken,
      );
      return { content: [{ type: "text" as const, text: "sent" }] };
    } catch (err) {
      logError(`发送回复失败: ${String(err)}`);
      return {
        content: [
          { type: "text" as const, text: `send failed: ${String(err)}` },
        ],
      };
    }
  }

  if (req.params.name === "wechat_send_image") {
    const { sender_id, file_path } = req.params.arguments as {
      sender_id: string;
      file_path: string;
    };

    if (!validateSenderId(sender_id)) {
      return {
        content: [
          { type: "text" as const, text: "error: invalid sender_id format" },
        ],
      };
    }
    if (!file_path || typeof file_path !== "string") {
      return {
        content: [
          { type: "text" as const, text: "error: file_path is required and must be a string" },
        ],
      };
    }

    if (!activeAccount) {
      return {
        content: [{ type: "text" as const, text: "error: not logged in" }],
      };
    }
    const contextToken = getCachedContextToken(sender_id);
    if (!contextToken) {
      return {
        content: [
          {
            type: "text" as const,
            text: `error: no context_token for ${sender_id}. The user may need to send a message first.`,
          },
        ],
      };
    }

    try {
      // Cancel typing on send
      await typingManager.sendTyping(sender_id, 2);

      const buf = readLocalFile(file_path);
      if (!buf) {
        const displayName = file_path.split(/[\\/]/).pop() ?? file_path;
        return {
          content: [
            { type: "text" as const, text: `error: cannot read file: ${displayName}` },
          ],
        };
      }

      const ext = detectImageExtension(buf);
      const fileName = file_path.split(/[\\/]/).pop() || `image.${ext}`;

      const uploadResult = await uploadMediaToCdn(
        activeAccount.baseUrl,
        activeAccount.token,
        { file_type: 2, file_size: buf.length, file_name: fileName },
        buf,
      );

      if (!uploadResult?.file_token) {
        return {
          content: [
            { type: "text" as const, text: "error: upload failed — no file_token returned" },
          ],
        };
      }

      const clientId = generateClientId();
      await apiFetch({
        baseUrl: activeAccount.baseUrl,
        endpoint: "ilink/bot/sendmessage",
        body: JSON.stringify({
          msg: {
            from_user_id: "",
            to_user_id: sender_id,
            client_id: clientId,
            message_type: MSG_TYPE_BOT,
            message_state: MSG_STATE_FINISH,
            item_list: [
              {
                type: MSG_ITEM_IMAGE,
                image_item: {
                  file_token: uploadResult.file_token,
                  aeskey: uploadResult.aes_key,
                  encrypt_type: uploadResult.encrypt_type ?? 1,
                },
              },
            ],
            context_token: contextToken,
          },
          base_info: buildBaseInfo(),
        }),
        token: activeAccount.token,
        timeoutMs: 30_000,
      });

      return { content: [{ type: "text" as const, text: "image sent" }] };
    } catch (err) {
      logError(`发送图片失败: ${String(err)}`);
      return {
        content: [
          { type: "text" as const, text: `send image failed: ${String(err)}` },
        ],
      };
    }
  }

  throw new Error(`unknown tool: ${req.params.name}`);
});

// ── Long-poll loop ──────────────────────────────────────────────────────────

function computeBackoffMs(failures: number): number {
  const base = Math.pow(2, failures) * 2000;
  const jitter = Math.floor(Math.random() * 1000);
  return Math.min(base + jitter, 60_000);
}

async function processMessages(msgs: WeixinMessage[] | undefined): Promise<void> {
  for (const msg of msgs ?? []) {
    // Only process user messages (not bot messages)
    if (msg.message_type !== MSG_TYPE_USER) continue;

    const senderId = msg.from_user_id ?? "unknown";

    // Cache context token for reply
    if (msg.context_token) {
      cacheContextToken(senderId, msg.context_token);
    }

    // Send typing indicator (start)
    await typingManager.sendTyping(senderId, 1);
    typingManager.startKeepalive(senderId);

    const content = await extractContentFromMessage(msg);
    if (!content) {
      const types = msg.item_list?.map((i) => i.type).join(",") ?? "none";
      log(`过滤消息: from=${senderId} item_types=[${types}] (无可用内容)`);
      await typingManager.sendTyping(senderId, 2);
      typingManager.stopKeepalive(senderId);
      continue;
    }

    log(`收到消息: from=${senderId} content=${content.slice(0, 80)}...`);

    // Push to Claude Code session
    try {
      await mcp.notification({
        method: "notifications/claude/channel",
        params: {
          content,
          meta: {
            sender: senderId.split("@")[0] || senderId,
            sender_id: senderId,
          },
        },
      });
    } catch (err) {
      logError(`推送消息到 Claude Code 失败: ${String(err)}`);
    }
  }
}

async function handlePollError(
  err: unknown,
  consecutiveFailures: number,
): Promise<number> {
  consecutiveFailures++;
  logError(`轮询异常: ${String(err)}`);
  const delay = computeBackoffMs(consecutiveFailures);
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    logError(
      `连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，等待 ${delay / 1000}s`,
    );
  }
  await new Promise((r) => setTimeout(r, delay));
  return consecutiveFailures;
}

async function startPolling(account: AccountData): Promise<never> {
  const { baseUrl, token } = account;
  let getUpdatesBuf = "";
  let consecutiveFailures = 0;
  let longPollTimeout = LONG_POLL_TIMEOUT_MS;
  let emptyPollCount = 0;

  // Load cached sync buf if available
  const syncBufFile = getSyncBufFile();
  try {
    if (fs.existsSync(syncBufFile)) {
      getUpdatesBuf = fs.readFileSync(syncBufFile, "utf-8");
      log(`恢复上次同步状态 (${getUpdatesBuf.length} bytes)`);
    }
  } catch (err) {
    log(`加载同步状态失败: ${String(err)}`);
  }

  // Load persisted context tokens
  loadContextTokens();

  // Log credential age
  if (account.savedAt) {
    try {
      const ageMs = Date.now() - new Date(account.savedAt).getTime();
      const ageHours = Math.round(ageMs / 3600_000);
      log(`凭据保存于 ${account.savedAt}，距今 ${ageHours} 小时`);
    } catch {
      // ignore
    }
  }

  log(`channel_version: ${CHANNEL_VERSION}`);
  log("开始监听微信消息...");

  while (true) {
    try {
      const resp = await getUpdates(baseUrl, token, getUpdatesBuf, longPollTimeout);

      // Diagnostic logging
      const msgCount = resp.msgs?.length ?? 0;
      log(`getUpdates: ret=${resp.ret ?? 0} errcode=${resp.errcode ?? 0} msgs=${msgCount} buf=${resp.get_updates_buf?.length ?? getUpdatesBuf.length}b timeout=${longPollTimeout}ms`);

      // Handle API errors
      const isError =
        (resp.ret !== undefined && resp.ret !== 0) ||
        (resp.errcode !== undefined && resp.errcode !== 0);
      if (isError) {
        // Session expired (errcode -14)
        if (resp.ret === -14 || resp.errcode === -14) {
          logError("会话已过期 (errcode -14)，请重新运行 setup 登录");
          logError("1 小时后重试...");
          await new Promise((r) => setTimeout(r, 3600_000));
          continue;
        }

        consecutiveFailures++;
        logError(
          `getUpdates 失败: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""}`,
        );
        const delay = computeBackoffMs(consecutiveFailures);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logError(`连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，等待 ${delay / 1000}s`);
          consecutiveFailures = 0;
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      consecutiveFailures = 0;

      // Adapt long-poll timeout from server
      if (resp.longpolling_timeout_ms && resp.longpolling_timeout_ms >= LONG_POLL_TIMEOUT_MIN_MS && resp.longpolling_timeout_ms <= LONG_POLL_TIMEOUT_MAX_MS) {
        longPollTimeout = resp.longpolling_timeout_ms;
      }

      // Process messages FIRST, then save sync buf
      await processMessages(resp.msgs);

      // Heartbeat log every 10 empty polls (~5-6 min)
      if (msgCount === 0) {
        emptyPollCount++;
        if (emptyPollCount % 10 === 0) {
          log(`心跳: 长轮询正常 (已空轮询 ${emptyPollCount} 次)`);
        }
      } else {
        emptyPollCount = 0;
      }

      // Save sync buf AFTER successful message processing
      if (resp.get_updates_buf) {
        const oldLen = getUpdatesBuf.length;
        getUpdatesBuf = resp.get_updates_buf;
        if (oldLen !== getUpdatesBuf.length) {
          log(`sync_buf 更新: ${oldLen}b → ${getUpdatesBuf.length}b`);
        }
        try {
          fs.mkdirSync(getCredentialsDir(), { recursive: true });
          fs.writeFileSync(syncBufFile, getUpdatesBuf, "utf-8");
        } catch (err) {
          log(`保存同步状态失败: ${String(err)}`);
        }
      }
    } catch (err) {
      consecutiveFailures = await handlePollError(err, consecutiveFailures);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Acquire instance lock
  if (!acquireLock()) {
    process.exit(1);
  }

  // Cleanup on exit
  const cleanup = () => {
    typingManager.stopAll();
    releaseLock();
    saveContextTokens();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  // Connect MCP transport first (Claude Code expects stdio handshake)
  await mcp.connect(new StdioServerTransport());
  log("MCP 连接就绪");

  // Check for saved credentials
  let account = loadCredentials();

  if (!account) {
    log("未找到已保存的凭据，启动微信扫码登录...");

    // Inline QR login flow (same as setup.ts but using shared helpers)
    log("正在获取微信登录二维码...");
    const qrResp = await fetchQRCode(DEFAULT_BASE_URL);

    log("\n请使用微信扫描以下二维码：\n");
    try {
      const qrterm = await import("qrcode-terminal");
      await new Promise<void>((resolve) => {
        qrterm.default.generate(
          qrResp.qrcode_img_content,
          { small: true },
          (qr: string) => {
            process.stderr.write(qr + "\n");
            resolve();
          },
        );
      });
    } catch {
      log(`二维码链接: ${qrResp.qrcode_img_content}`);
    }

    log("等待扫码...");
    const deadline = Date.now() + 480_000;
    let scannedPrinted = false;

    while (Date.now() < deadline) {
      const status = await pollQRStatus(DEFAULT_BASE_URL, qrResp.qrcode);

      switch (status.status) {
        case "wait":
          break;
        case "scaned":
          if (!scannedPrinted) {
            log("👀 已扫码，请在微信中确认...");
            scannedPrinted = true;
          }
          break;
        case "expired":
          log("二维码已过期，请重新启动。");
          process.exit(1);
          break;
        case "confirmed": {
          if (!status.ilink_bot_id || !status.bot_token) {
            logError("登录确认但未返回 bot 信息");
            process.exit(1);
          }
          const confirmedAccount: AccountData = {
            token: status.bot_token,
            baseUrl: status.baseurl || DEFAULT_BASE_URL,
            accountId: status.ilink_bot_id,
            userId: status.ilink_user_id,
            savedAt: new Date().toISOString(),
          };
          saveCredentials(confirmedAccount);
          account = confirmedAccount;
          log("✅ 微信连接成功！");
          break;
        }
      }
      if (account) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!account) {
      logError("登录失败，退出。");
      process.exit(1);
    }
  } else {
    log(`使用已保存账号: ${account.accountId}`);
  }

  activeAccount = account;
  typingManager.configure(account.accountId, account.token, account.baseUrl);

  // Start long-poll (runs forever)
  await startPolling(account);
}

main().catch((err) => {
  logError(`Fatal: ${String(err)}`);
  process.exit(1);
});
