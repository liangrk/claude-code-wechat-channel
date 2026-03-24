#!/usr/bin/env bun
/**
 * WeChat Bot — Standalone mode (no MCP channel dependency).
 *
 * Bridges WeChat messages to Claude Code via `claude -p` subprocess.
 * Works with any API key (including third-party like GLM), without OAuth.
 *
 * Flow:
 *   WeChat → ClawBot → ilink API → bot process → claude -p → stdout → bot process → ilink API → WeChat
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn, execSync } from "node:child_process";

import {
  type AccountData,
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
import { downloadAndDecryptBuffer } from "./media.js";
import { SessionManager } from "./session-manager.js";
import { Scheduler, type LoopTask } from "./scheduler.js";

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_REPLY_LENGTH = 4096;
const MAX_SENDER_ID_LENGTH = 256;
const SEND_RETRY_COUNT = 2;
const SEND_RETRY_DELAY_MS = 1_000;
const CONTEXT_TOKEN_MAX_ENTRIES = 500;
const CONTEXT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LONG_POLL_TIMEOUT_MIN_MS = 10_000;
const LONG_POLL_TIMEOUT_MAX_MS = 60_000;
const CLAUDE_TIMEOUT_MS = 120_000; // 2 min for claude -p

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[wechat-bot] ${msg}\n`);
}

function logError(msg: string) {
  process.stderr.write(`[wechat-bot] ERROR: ${msg}\n`);
}

// ── Message type constants ───────────────────────────────────────────────────

const MSG_TYPE_USER = 1;
const MSG_TYPE_BOT = 2;
const MSG_STATE_FINISH = 2;

interface GetUpdatesResp {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

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
      // best-effort
    }
  } catch {
    // best-effort
  }
}

function evictContextTokens(): void {
  const now = Date.now();
  for (const [key, entry] of contextTokenCache.entries()) {
    if (now - entry.lastAccessed > CONTEXT_TOKEN_TTL_MS) {
      contextTokenCache.delete(key);
    }
  }
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

// ── Session Management ───────────────────────────────────────────────────────

const SESSIONS_FILE = path.join(getCredentialsDir(), "sessions.json");

function loadSessions(): Record<string, string> {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveSessions(sessions: Record<string, string>): void {
  try {
    const dir = getCredentialsDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions), "utf-8");
    try {
      fs.chmodSync(SESSIONS_FILE, 0o600);
    } catch {
      // best-effort
    }
  } catch {
    // best-effort
  }
}

function clearSession(sessions: Record<string, string>, senderId: string): void {
  delete sessions[senderId];
  saveSessions(sessions);
}

// ── Instance Lock ────────────────────────────────────────────────────────────

const LOCK_STALE_TIMEOUT_MS = 10 * 60 * 1000;

function getLockFileAge(lockFile: string): number {
  try {
    const stat = fs.statSync(lockFile);
    return Date.now() - stat.mtimeMs;
  } catch {
    return Infinity;
  }
}

function isLikelyWechatBot(pid: number): boolean {
  try {
    const isWin = process.platform === "win32";
    const cmd = isWin
      ? `wmic process where "ProcessId=${pid}" get CommandLine /FORMAT:LIST 2>NUL`
      : `cat /proc/${pid}/cmdline 2>/dev/null || ps -p ${pid} -o command= 2>/dev/null`;
    const output = execSync(cmd, { encoding: "utf-8", timeout: 3000 });
    return output.toLowerCase().includes("wechat-bot") || output.toLowerCase().includes("wechat-channel");
  } catch {
    return true;
  }
}

function acquireLock(): boolean {
  const lockFile = getLockPidFile();
  try {
    fs.mkdirSync(getCredentialsDir(), { recursive: true });
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (err: any) {
      if (err.code === "EEXIST") {
        try {
          const existingPid = parseInt(fs.readFileSync(lockFile, "utf-8").trim(), 10);
          if (!isNaN(existingPid)) {
            process.kill(existingPid, 0);
            const age = getLockFileAge(lockFile);
            if (age > LOCK_STALE_TIMEOUT_MS) {
              log(`锁文件已过期 (${Math.round(age / 60_000)} 分钟前创建)，尝试清理...`);
            } else if (isLikelyWechatBot(existingPid)) {
              logError(`另一个实例已在运行 (PID ${existingPid})，退出。`);
              return false;
            } else {
              log(`PID ${existingPid} 存活但不是 wechat 进程 (可能 PID 复用)，清理锁文件...`);
            }
          }
        } catch {
          // Process not running — stale lock
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

/**
 * Send a long message by splitting it into chunks that fit within MAX_REPLY_LENGTH.
 * Splits on paragraph boundaries first, then line boundaries.
 */
async function sendLongMessage(
  baseUrl: string,
  token: string,
  to: string,
  text: string,
  contextToken: string,
): Promise<void> {
  if (text.length <= MAX_REPLY_LENGTH) {
    await sendTextMessageWithRetry(baseUrl, token, to, text, contextToken);
    return;
  }

  // Split into chunks
  const chunks: string[] = [];
  const remaining = text;

  // First try splitting on double newlines (paragraphs)
  const paragraphs = remaining.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_REPLY_LENGTH) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      // If single paragraph is too long, split on single newlines
      if (para.length > MAX_REPLY_LENGTH) {
        const lines = para.split(/\n/);
        for (const line of lines) {
          if (current.length + line.length + 1 > MAX_REPLY_LENGTH) {
            if (current) {
              chunks.push(current);
            }
            current = line;
          } else {
            current = current ? current + "\n" + line : line;
          }
        }
      } else {
        current = para;
      }
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current) {
    chunks.push(current);
  }

  log(`消息拆分为 ${chunks.length} 段发送 (总长度 ${text.length})`);

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      // Delay between chunks to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }
    log(`发送第 ${i + 1}/${chunks.length} 段 (${chunks[i]!.length} 字符)`);
    await sendTextMessageWithRetry(baseUrl, token, to, chunks[i]!, contextToken);
  }
}

// ── Message Extraction ───────────────────────────────────────────────────────

async function extractContentFromMessage(msg: WeixinMessage): Promise<string> {
  if (!msg.item_list?.length) return "";

  for (const item of msg.item_list) {
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

    if (item.type === MSG_ITEM_VOICE && item.voice_item?.text) {
      return `[语音] ${item.voice_item.text}`;
    }

    if (item.type === MSG_ITEM_IMAGE && item.image_item?.media) {
      const buf = await downloadAndDecryptBuffer(item.image_item.media);
      if (buf) {
        const MAX_IMAGE_SIZE = 512 * 1024;
        if (buf.length > MAX_IMAGE_SIZE) {
          return `[图片] (图片过大: ${(buf.length / 1024).toFixed(0)}KB，已跳过)`;
        }
        const ext = detectImageExtension(buf);
        const b64 = buf.toString("base64");
        return `[图片] data:image/${ext};base64,${b64}`;
      }
      return "[图片] (无法下载或解密)";
    }

    if (item.type === MSG_ITEM_FILE && item.file_item) {
      const fi = item.file_item;
      const parts: string[] = ["[文件]"];
      if (fi.file_name) parts.push(`名称: ${fi.file_name}`);
      if (fi.len) parts.push(`大小: ${formatFileSize(fi.len)}`);
      return parts.join(" ");
    }

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

// ── Claude Code subprocess ──────────────────────────────────────────────────

/**
 * Call `claude -p` to get a reply for a WeChat message (spawn fallback).
 * Returns the reply text, or an error message string on failure.
 */
async function claudeReplySpawn(
  senderId: string,
  content: string,
  sessions: Record<string, string>,
  account: AccountData,
): Promise<string> {
  const sessionId = sessions[senderId];
  const senderName = senderId.split("@")[0] || senderId;

  const prompt = `[微信消息] 来自: ${senderName}\n${content}\n\n请用中文回复，不要使用 Markdown 格式。`;

  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
    "--max-turns",
    "5",
  ];

  if (sessionId) {
    args.unshift("--resume", sessionId);
  }

  log(`调用 claude ${sessionId ? `--resume ${sessionId.slice(0, 8)}...` : "(新会话)"} — ${content.slice(0, 50)}...`);

  return new Promise<string>((resolve) => {
    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      logError(`claude -p 超时 (${CLAUDE_TIMEOUT_MS / 1000}s)`);
      resolve("抱歉，回复超时了，请稍后再试。");
    }, CLAUDE_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0 || !stdout.trim()) {
        const errSnippet = stderr.slice(0, 200) || `exit code ${code}`;
        logError(`claude -p 失败: ${errSnippet}`);
        resolve("抱歉，处理消息时出现了问题，请稍后再试。");
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());

        // Extract session_id if this was a new session
        if (!sessionId && result.session_id) {
          sessions[senderId] = result.session_id;
          saveSessions(sessions);
          log(`保存新会话: ${senderId} → ${result.session_id.slice(0, 8)}...`);
        }

        let reply: string;

        if (result.subtype === "error_max_turns") {
          // Claude hit the turn limit — extract whatever text was generated
          const partial = result.result || result.output || "";
          if (partial && typeof partial === "string" && partial.length > 0 && !partial.startsWith("{")) {
            reply = partial;
            log(`claude 回复 (max_turns, partial): ${reply.slice(0, 80)}...`);
          } else {
            reply = "（回复被截断，请尝试将问题拆分为更小的部分）";
            logError(`claude error_max_turns: 无可用文本内容`);
          }
        } else {
          reply = result.result ?? result.text ?? result.output ?? "";
          if (!reply || typeof reply !== "string") {
            reply = JSON.stringify(result);
          }
          log(`claude 回复: ${reply.slice(0, 80)}...`);
        }

        resolve(reply);
      } catch {
        // If not valid JSON, use raw stdout
        const rawReply = stdout.trim().slice(0, MAX_REPLY_LENGTH);
        log(`claude 回复 (raw): ${rawReply.slice(0, 80)}...`);
        resolve(rawReply);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      logError(`claude -p 启动失败: ${err.message}`);
      resolve("抱歉，Claude Code 未安装或无法启动。请确保 claude 命令可用。");
    });
  });
}

// ── SessionManager (SDK mode) ──────────────────────────────────────────────

let sessionManager: SessionManager | null = null;

// ── Scheduler (定时任务) ────────────────────────────────────────────────────

const scheduler = new Scheduler();

/**
 * Unified reply function: uses SDK mode if available, falls back to spawn.
 */
async function claudeReply(
  senderId: string,
  content: string,
  sessions: Record<string, string>,
  account: AccountData,
): Promise<string> {
  if (sessionManager?.isSdkMode) {
    return sessionManager.sendMessage(senderId, content);
  }
  return claudeReplySpawn(senderId, content, sessions, account);
}

// ── Built-in Commands ───────────────────────────────────────────────────────

const LOOP_KEYWORDS = [
  "提醒", "定时", "每天", "每隔", "重复", "循环",
  "日程", "闹钟", "几点", "分钟后", "小时后", "秒后",
  "倒计时", "定时器", "叫醒", "打卡",
];

function hasLoopIntent(text: string): boolean {
  return LOOP_KEYWORDS.some((kw) => text.includes(kw));
}

// ── Loop Mode: ask Claude to parse natural language into cron ───────────────

interface LoopParseResult {
  action: "loop_add";
  cron: string;
  message: string;
  next_text: string;
}

async function claudeReplyLoopMode(
  senderId: string,
  content: string,
  sessions: Record<string, string>,
  account: AccountData,
): Promise<{ reply: string; task?: LoopTask }> {
  const senderName = senderId.split("@")[0] || senderId;
  const loopPrompt = `用户想要设置定时提醒。请将用户的自然语言描述转换为标准 cron 表达式。

当前时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}

用户消息: ${content}

请严格按照以下 JSON 格式回复，不要包含任何其他内容：
{"action":"loop_add","cron":"标准5字段cron表达式","message":"提醒内容（简短）","next_text":"已设置的中文确认描述"}

cron 格式: 分 时 日 月 周（如 "0 9 * * *" 表示每天9点，"*/30 * * * *" 表示每30分钟）

如果用户的请求无法转换为定时任务（如时间不明确），请直接用中文回复原因，不要返回 JSON。`;

  const sessionId = sessions[senderId];
  const args = [
    "-p",
    loopPrompt,
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
    "--max-turns",
    "5",
  ];
  if (sessionId) {
    args.unshift("--resume", sessionId);
  }

  log(`[loop] 调用 Claude 解析定时意图: ${content.slice(0, 50)}...`);

  return new Promise((resolve) => {
    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "" },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ reply: "抱歉，解析定时请求超时了。" });
    }, 60_000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || !stdout.trim()) {
        resolve({ reply: "抱歉，解析定时请求失败了。" });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());

        // Handle error_max_turns
        if (result.subtype === "error_max_turns") {
          const partial = result.result || result.output || "";
          if (partial && typeof partial === "string" && !partial.startsWith("{")) {
            resolve({ reply: partial });
          } else {
            resolve({ reply: "抱歉，解析定时请求时被截断了，请重试。" });
          }
          return;
        }

        const text = result.result ?? result.text ?? result.output ?? "";

        // Try to parse as loop_add JSON
        try {
          const inner = JSON.parse(typeof text === "string" ? text : JSON.stringify(text));
          if (inner.action === "loop_add" && inner.cron && inner.message) {
            const task = scheduler.add(senderId, inner.cron, inner.message);
            if (task) {
              resolve({ reply: inner.next_text || `已设置定时任务 [${task.id}]: ${inner.cron} — ${inner.message}`, task });
              return;
            } else {
              resolve({ reply: `无法解析 cron 表达式: ${inner.cron}，请换一种说法试试。` });
              return;
            }
          }
        } catch {
          // Not a loop_add JSON — return as normal text reply
        }

        resolve({ reply: text || "抱歉，无法理解您的定时请求，请重试。" });
      } catch {
        resolve({ reply: stdout.trim().slice(0, MAX_REPLY_LENGTH) });
      }
    });

    child.on("error", () => {
      clearTimeout(timeout);
      resolve({ reply: "Claude Code 未安装或无法启动。" });
    });
  });
}

const HELP_TEXT = [
  "可用命令：",
  "/help — 显示此帮助",
  "/clear — 清空对话上下文，开始新会话",
  "/loop — 查看定时任务",
  "/loop rm <ID> — 删除定时任务",
  "/loop off — 暂停所有定时任务",
  "/loop on — 恢复所有定时任务",
  "",
  "定时提醒：直接用自然语言描述即可，如：",
  "  \"每天早上9点提醒我喝水\"",
  "  \"每30分钟检查邮件\"",
  "  \"下周一下午3点开会\"",
  "",
  "其他消息会直接发送给 Claude 处理。",
].join("\n");

// ── Long-poll loop ──────────────────────────────────────────────────────────

function computeBackoffMs(failures: number): number {
  const base = Math.pow(2, failures) * 2000;
  const jitter = Math.floor(Math.random() * 1000);
  return Math.min(base + jitter, 60_000);
}

const typingManager = new TypingManager();

async function processMessages(
  msgs: WeixinMessage[] | undefined,
  account: AccountData,
  sessions: Record<string, string>,
  manager: SessionManager | null,
): Promise<void> {
  for (const msg of msgs ?? []) {
    const senderId = msg.from_user_id ?? "unknown";
    const types = msg.item_list?.map((i) => i.type).join(",") ?? "none";
    log(`入站消息: from=${senderId} msg_type=${msg.message_type} items=[${types}]`);

    if (msg.message_type !== MSG_TYPE_USER) continue;

    // Cache context token for reply
    if (msg.context_token) {
      cacheContextToken(senderId, msg.context_token);
    }

    const content = await extractContentFromMessage(msg);
    if (!content) {
      const itemTypes = msg.item_list?.map((i) => i.type).join(",") ?? "none";
      log(`过滤消息: from=${senderId} item_types=[${itemTypes}] (无可用内容)`);
      continue;
    }

    log(`收到消息: from=${senderId} content=${content.slice(0, 80)}...`);

    // Handle built-in commands
    const trimmed = content.trim();
    if (trimmed === "/clear") {
      if (manager?.isSdkMode) {
        await manager.clearSession(senderId);
      } else {
        clearSession(sessions, senderId);
      }
      const contextToken = getCachedContextToken(senderId);
      if (contextToken) {
        try {
          await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, "上下文已清空，下次消息将开始新会话。", contextToken);
        } catch (err) {
          logError(`发送 /clear 回复失败: ${String(err)}`);
        }
      }
      continue;
    }

    if (trimmed === "/help") {
      const contextToken = getCachedContextToken(senderId);
      if (contextToken) {
        try {
          await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, HELP_TEXT, contextToken);
        } catch (err) {
          logError(`发送 /help 回复失败: ${String(err)}`);
        }
      }
      continue;
    }

    // Handle /loop commands
    if (trimmed === "/loop" || trimmed.startsWith("/loop ")) {
      const sub = trimmed.slice(5).trim();
      const contextToken = getCachedContextToken(senderId);
      let reply = "";

      if (sub === "" || sub === "list") {
        reply = Scheduler.formatTaskList(scheduler.list(senderId));
      } else if (sub.startsWith("rm ") || sub.startsWith("del ")) {
        const id = sub.slice(3).trim();
        if (scheduler.remove(id)) {
          reply = `已删除任务 ${id}`;
        } else {
          reply = `未找到任务 ${id}，使用 /loop list 查看所有任务`;
        }
      } else if (sub === "off") {
        const count = scheduler.disableAll(senderId);
        reply = count > 0 ? `已暂停 ${count} 个任务` : "没有需要暂停的任务";
      } else if (sub === "on") {
        const count = scheduler.enableAll(senderId);
        reply = count > 0 ? `已恢复 ${count} 个任务` : "没有需要恢复的任务";
      } else {
        reply = `未知命令: /loop ${sub}\n${HELP_TEXT}`;
      }

      if (contextToken) {
        try {
          await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, reply, contextToken);
        } catch (err) {
          logError(`发送 /loop 回复失败: ${String(err)}`);
        }
      }
      continue;
    }

    // Detect loop/schedule intent from natural language
    if (hasLoopIntent(trimmed)) {
      await typingManager.sendTyping(senderId, 1);
      typingManager.startKeepalive(senderId);
      try {
        const { reply: loopReply } = await claudeReplyLoopMode(senderId, trimmed, sessions, account);
        await typingManager.sendTyping(senderId, 2);
        typingManager.stopKeepalive(senderId);
        const contextToken = getCachedContextToken(senderId);
        if (contextToken) {
          await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, loopReply, contextToken);
        }
      } catch (err) {
        logError(`处理定时意图失败: ${String(err)}`);
        await typingManager.sendTyping(senderId, 2);
        typingManager.stopKeepalive(senderId);
      }
      continue;
    }

    // Send typing indicator
    await typingManager.sendTyping(senderId, 1);
    typingManager.startKeepalive(senderId);

    try {
      const reply = await claudeReply(senderId, content, sessions, account);

      // Cancel typing
      await typingManager.sendTyping(senderId, 2);
      typingManager.stopKeepalive(senderId);

      // Send reply back to WeChat (long messages are auto-split)
      const contextToken = getCachedContextToken(senderId);
      if (contextToken) {
        await sendLongMessage(account.baseUrl, account.token, senderId, reply, contextToken);
      } else {
        logError(`无法回复 ${senderId}: 缺少 context_token`);
      }
    } catch (err) {
      logError(`处理消息失败: ${String(err)}`);
      await typingManager.sendTyping(senderId, 2);
      typingManager.stopKeepalive(senderId);

      // Send error message back to user
      const contextToken = getCachedContextToken(senderId);
      if (contextToken) {
        try {
          await sendTextMessageWithRetry(account.baseUrl, account.token, senderId, "抱歉，处理消息时出现了问题，请稍后再试。", contextToken);
        } catch {
          // ignore
        }
      }
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
    logError(`连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，等待 ${delay / 1000}s`);
  }
  await new Promise((r) => setTimeout(r, delay));
  return consecutiveFailures;
}

async function startPolling(
  account: AccountData,
  sessions: Record<string, string>,
  manager: SessionManager | null,
): Promise<never> {
  const { baseUrl, token } = account;
  let getUpdatesBuf = "";
  let consecutiveFailures = 0;
  let longPollTimeout = LONG_POLL_TIMEOUT_MS;
  let emptyPollCount = 0;

  // Load cached sync buf
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
  log("开始监听微信消息 (独立 Bot 模式)...");

  while (true) {
    try {
      const resp = await getUpdates(baseUrl, token, getUpdatesBuf, longPollTimeout);

      const msgCount = resp.msgs?.length ?? 0;
      log(`getUpdates: ret=${resp.ret ?? 0} errcode=${resp.errcode ?? 0} msgs=${msgCount} buf=${resp.get_updates_buf?.length ?? getUpdatesBuf.length}b timeout=${longPollTimeout}ms`);

      const isError =
        (resp.ret !== undefined && resp.ret !== 0) ||
        (resp.errcode !== undefined && resp.errcode !== 0);
      if (isError) {
        if (resp.ret === -14 || resp.errcode === -14) {
          logError("会话已过期 (errcode -14)，请重新运行 setup 登录");
          logError("1 小时后重试...");
          await new Promise((r) => setTimeout(r, 3600_000));
          continue;
        }

        consecutiveFailures++;
        logError(`getUpdates 失败: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""}`);
        const delay = computeBackoffMs(consecutiveFailures);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logError(`连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，等待 ${delay / 1000}s`);
          consecutiveFailures = 0;
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      consecutiveFailures = 0;

      if (resp.longpolling_timeout_ms && resp.longpolling_timeout_ms >= LONG_POLL_TIMEOUT_MIN_MS && resp.longpolling_timeout_ms <= LONG_POLL_TIMEOUT_MAX_MS) {
        longPollTimeout = resp.longpolling_timeout_ms;
      }

      // Process messages
      await processMessages(resp.msgs, account, sessions, manager);

      // Heartbeat log
      if (msgCount === 0) {
        emptyPollCount++;
        if (emptyPollCount % 10 === 0) {
          log(`心跳: 长轮询正常 (已空轮询 ${emptyPollCount} 次)`);
        }
      } else {
        emptyPollCount = 0;
      }

      // Save sync buf
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

  let sessions = loadSessions();
  log(`加载会话: ${Object.keys(sessions).length} 个用户`);

  // Account placeholder — assigned after login/credential check
  let account: AccountData | null = null;

  // Initialize SessionManager (SDK mode)
  const managerDeps = {
    sendMessage: async (to: string, text: string, contextToken: string) => {
      if (!account) return;
      await sendTextMessageWithRetry(
        account.baseUrl,
        account.token,
        to,
        text,
        contextToken,
      );
    },
    getContextToken: getCachedContextToken,
  };

  sessionManager = new SessionManager(managerDeps);
  const sdkMode = await sessionManager.probeSdk();

  if (sdkMode) {
    log("使用 Claude Agent SDK V2 模式");
  } else {
    log("使用 spawn 模式 (claude -p 子进程)");
  }

  // Cleanup on exit
  const cleanup = () => {
    typingManager.stopAll();
    scheduler.stop();
    sessionManager?.closeAll();
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

  // Check for saved credentials
  account = loadCredentials();

  if (!account) {
    log("未找到已保存的凭据，启动微信扫码登录...");

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
            log("已扫码，请在微信中确认...");
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
          log("微信连接成功！");
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

  typingManager.configure(account.accountId, account.token, account.baseUrl);

  // Initialize scheduler
  scheduler.load();
  scheduler.onFire(async (task: LoopTask) => {
    const contextToken = getCachedContextToken(task.senderId);
    if (contextToken) {
      try {
        log(`[scheduler] 发送定时提醒: ${task.id} → ${task.senderId}`);
        await sendTextMessageWithRetry(account.baseUrl, account.token, task.senderId, `⏰ ${task.message}`, contextToken);
      } catch (err) {
        logError(`[scheduler] 发送定时提醒失败: ${String(err)}`);
      }
    } else {
      logError(`[scheduler] 无法发送提醒 ${task.id}: 缺少 context_token`);
    }
  });
  scheduler.start(30_000);

  // Start long-poll (runs forever)
  await startPolling(account, sessions, sessionManager);
}

main().catch((err) => {
  logError(`Fatal: ${String(err)}`);
  process.exit(1);
});
