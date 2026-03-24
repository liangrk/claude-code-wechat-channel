/**
 * session-manager.ts — Claude Agent SDK V2 session management.
 *
 * Manages persistent Claude sessions per WeChat user using the
 * @anthropic-ai/claude-agent-sdk V2 API (unstable_v2_createSession / resumeSession).
 * Falls back to spawn mode when SDK is unavailable.
 *
 * Permission handling: Tools are auto-approved by default (matching spawn mode
 * behavior with --dangerously-skip-permissions). Interactive permission confirmation
 * via WeChat is not supported because canUseTool runs inside the SDK subprocess
 * and blocking for user input would deadlock the stream iterator.
 */

import fs from "node:fs";
import { getSessionsFile, getCredentialsDir } from "./shared.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionRecord {
  sessionId: string;
  createdAt: number;
  lastUsedAt: number;
}

interface SessionEntry {
  session: SDKSession;
  sessionId: string;
  lastUsedAt: number;
}

// SDK types (dynamically loaded — avoid compile-time dependency)
interface SDKSession {
  readonly sessionId: string;
  send(message: string): Promise<void>;
  stream(): AsyncGenerator<SDKMessage, void>;
  close(): void;
}

interface SDKMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: { content: Array<{ type: string; text?: string }> };
  result?: string;
}

interface ClaudeAgentSDK {
  unstable_v2_createSession(opts: SessionOptions): SDKSession;
  unstable_v2_resumeSession(sessionId: string, opts: SessionOptions): SDKSession;
}

interface SessionOptions {
  model: string;
  maxTurns?: number;
  permissionMode?: string;
  allowDangerouslySkipPermissions?: boolean;
  canUseTool?: (toolName: string, toolInput: unknown) => boolean | Promise<boolean>;
  env?: Record<string, string>;
}

// ── Config ────────────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SDK_REPLY_TIMEOUT_MS = 120_000; // 2 minutes
const DEFAULT_MODEL = "claude-sonnet-4-6";

// ── Dependencies callback interface ───────────────────────────────────────────

export interface SessionManagerDeps {
  sendMessage: (to: string, text: string, contextToken: string) => Promise<void>;
  getContextToken: (userId: string) => string | undefined;
}

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[session-manager] ${msg}\n`);
}

function logError(msg: string) {
  process.stderr.write(`[session-manager] ERROR: ${msg}\n`);
}

// ── SessionManager ────────────────────────────────────────────────────────────

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private records = new Map<string, SessionRecord>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private recordsDirty = false;
  private sdkAvailable = false;
  private sdkModule: ClaudeAgentSDK | null = null;
  private deps: SessionManagerDeps;
  private model: string;
  private maxTurns: number;

  constructor(
    deps: SessionManagerDeps,
    options?: { model?: string; maxTurns?: number },
  ) {
    this.deps = deps;
    this.model = options?.model || process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    this.maxTurns = options?.maxTurns
      ?? parseInt(process.env.CLAUDE_MAX_TURNS || "5", 10);
    this.loadRecords();
  }

  // ── SDK probe ───────────────────────────────────────────────────────────

  async probeSdk(): Promise<boolean> {
    if (process.env.CLAUDE_SDK_MODE === "spawn") {
      log("CLAUDE_SDK_MODE=spawn，强制使用 spawn 模式");
      return false;
    }
    try {
      this.sdkModule = await import("@anthropic-ai/claude-agent-sdk") as ClaudeAgentSDK;
      if (typeof this.sdkModule.unstable_v2_createSession === "function") {
        this.sdkAvailable = true;
        this.startIdleTimer();
        log(`使用 Claude Agent SDK V2 模式 (model=${this.model}, maxTurns=${this.maxTurns})`);
        return true;
      }
      log("SDK 不包含 V2 API，回退到 spawn 模式");
      return false;
    } catch (err) {
      log(`SDK 未安装或加载失败，回退到 spawn 模式: ${String(err)}`);
      return false;
    }
  }

  get isSdkMode(): boolean {
    return this.sdkAvailable;
  }

  // ── Core: send message and get reply ────────────────────────────────────

  async sendMessage(senderId: string, content: string): Promise<string> {
    if (!this.sdkAvailable) {
      throw new Error("SDK not available");
    }

    let entry: SessionEntry;
    try {
      entry = await this.getOrCreateSession(senderId);
    } catch (err) {
      logError(`创建/恢复 session 失败: ${String(err)}`);
      return "抱歉，处理消息时出现了问题，请稍后再试。";
    }

    const senderName = senderId.split("@")[0] || senderId;
    const prompt = `[微信消息] 来自: ${senderName}\n${content}\n\n请用中文回复，不要使用 Markdown 格式。`;

    try {
      await entry.session.send(prompt);
    } catch (err) {
      logError(`session.send 失败: ${String(err)}`);
      this.destroySession(senderId);
      return "抱歉，发送消息到 Claude 失败了，请稍后再试。";
    }

    // Use clearTimeout to avoid timer leak (CRITICAL fix)
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), SDK_REPLY_TIMEOUT_MS);
    });

    try {
      const reply = await Promise.race([
        this.collectReply(entry.session, senderId),
        timeoutPromise,
      ]);

      clearTimeout(timer!);

      entry.lastUsedAt = Date.now();
      this.updateRecord(senderId, entry.sessionId);

      log(`SDK 回复 (${senderId}): ${reply.slice(0, 80)}...`);
      return reply;
    } catch (err) {
      clearTimeout(timer!);
      if (err instanceof Error && err.message === "timeout") {
        logError(`SDK 回复超时 (${SDK_REPLY_TIMEOUT_MS / 1000}s)`);
      } else {
        logError(`stream 异常: ${String(err)}`);
      }
      this.destroySession(senderId);
      return "抱歉，处理消息时出现了问题，请稍后再试。";
    }
  }

  // ── Stream collection ──────────────────────────────────────────────────

  private async collectReply(
    session: SDKSession,
    senderId: string,
  ): Promise<string> {
    const textParts: string[] = [];

    for await (const msg of session.stream()) {
      // Save session_id if present
      if (msg.session_id) {
        const entry = this.sessions.get(senderId);
        if (entry && entry.sessionId !== msg.session_id) {
          entry.sessionId = msg.session_id;
          this.updateRecord(senderId, msg.session_id);
        }
      }

      // Collect assistant text
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            textParts.push(block.text);
          }
        }
      }

      // Log control_request events (Bug #176 fallback)
      if (msg.type === "control_request") {
        log(`control_request 事件 (senderId=${senderId})`);
      }
    }

    return textParts.join("") || "（无回复内容）";
  }

  // ── Session lifecycle ───────────────────────────────────────────────────

  private async getOrCreateSession(senderId: string): Promise<SessionEntry> {
    // Check active sessions
    const active = this.sessions.get(senderId);
    if (active) {
      active.lastUsedAt = Date.now();
      return active;
    }

    // Check records for resumable session
    const record = this.records.get(senderId);
    if (record?.sessionId) {
      try {
        const entry = this.resumeSession(senderId, record.sessionId);
        return entry;
      } catch (err) {
        log(`恢复 session 失败: ${String(err)}，创建新 session`);
        this.records.delete(senderId);
        this.markRecordsDirty();
      }
    }

    // Create new session
    return this.createSession(senderId);
  }

  private createSession(senderId: string): SessionEntry {
    const sessionOpts: SessionOptions = {
      model: this.model,
      maxTurns: this.maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      env: this.buildEnv(),
    };

    const session: SDKSession = this.sdkModule!.unstable_v2_createSession(sessionOpts);

    const entry: SessionEntry = {
      session,
      sessionId: session.sessionId,
      lastUsedAt: Date.now(),
    };

    this.sessions.set(senderId, entry);
    this.updateRecord(senderId, session.sessionId);

    log(`创建新 SDK session: ${senderId} → ${session.sessionId.slice(0, 8)}...`);
    return entry;
  }

  private resumeSession(
    senderId: string,
    sessionId: string,
  ): SessionEntry {
    const sessionOpts: SessionOptions = {
      model: this.model,
      maxTurns: this.maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      env: this.buildEnv(),
    };

    const session: SDKSession = this.sdkModule!.unstable_v2_resumeSession(
      sessionId,
      sessionOpts,
    );

    const entry: SessionEntry = {
      session,
      sessionId,
      lastUsedAt: Date.now(),
    };

    this.sessions.set(senderId, entry);
    this.updateRecord(senderId, sessionId);

    log(`恢复 session (已保留上下文): ${senderId} → ${sessionId.slice(0, 8)}...`);
    return entry;
  }

  private destroySession(senderId: string): void {
    const entry = this.sessions.get(senderId);
    if (entry) {
      try {
        entry.session.close();
      } catch {
        // best-effort close
      }
      this.sessions.delete(senderId);
    }
  }

  async clearSession(senderId: string): Promise<void> {
    this.destroySession(senderId);
    this.records.delete(senderId);
    this.markRecordsDirty();
  }

  async closeAll(): Promise<void> {
    for (const [senderId] of this.sessions) {
      this.destroySession(senderId);
    }
    this.sessions.clear();
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    // Flush any pending record writes
    this.flushRecords();
  }

  // ── Idle timeout ───────────────────────────────────────────────────────

  private startIdleTimer(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      for (const [senderId, entry] of this.sessions) {
        if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
          try {
            entry.session.close();
          } catch {
            // best-effort
          }
          this.sessions.delete(senderId);
          log(`session 空闲关闭，上下文已保留: ${senderId}`);
        }
      }
    }, 60_000); // Check every minute
  }

  // ── Env construction ───────────────────────────────────────────────────

  private buildEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    if (process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.ANTHROPIC_BASE_URL) {
      env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
    }
    return env;
  }

  // ── Persistence (debounced writes) ─────────────────────────────────────

  loadRecords(): void {
    try {
      const file = getSessionsFile();
      if (!fs.existsSync(file)) return;
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));

      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string") {
          // Old format (plain sessionId string) — skip, new session will be created
          log(`迁移旧格式 session 记录: ${key}`);
          continue;
        }
        const record = value as SessionRecord;
        if (record.sessionId) {
          this.records.set(key, record);
        }
      }

      log(`加载 session 记录: ${this.records.size} 条`);
    } catch (err) {
      logError(`加载 session 记录失败: ${String(err)}`);
    }
  }

  private markRecordsDirty(): void {
    if (this.recordsDirty) return;
    this.recordsDirty = true;
    this.saveTimer = setTimeout(() => {
      this.flushRecords();
    }, 2_000);
  }

  private flushRecords(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.recordsDirty) return;
    this.recordsDirty = false;
    this.saveRecordsNow();
  }

  private saveRecordsNow(): void {
    try {
      const dir = getCredentialsDir();
      const file = getSessionsFile();
      fs.mkdirSync(dir, { recursive: true });
      const data: Record<string, SessionRecord> = {};
      for (const [key, record] of this.records) {
        data[key] = record;
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

  private updateRecord(senderId: string, sessionId: string): void {
    const existing = this.records.get(senderId);
    this.records.set(senderId, {
      sessionId,
      createdAt: existing?.createdAt || Date.now(),
      lastUsedAt: Date.now(),
    });
    this.markRecordsDirty();
  }
}
