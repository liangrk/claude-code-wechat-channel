/**
 * shared.ts — Shared types, constants, and utility functions
 * for both wechat-bot.ts and setup.ts.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// ── Types ────────────────────────────────────────────────────────────────────

export type AccountData = {
  token: string;
  baseUrl: string;
  accountId: string;
  userId?: string;
  savedAt: string;
};

export interface QRCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

export interface QRStatusResponse {
  status: "wait" | "scaned" | "confirmed" | "expired";
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

// ── CDN & Media Types ────────────────────────────────────────────────────────

export interface CDNMedia {
  encrypt_query_param?: string;
  aes_key?: string;
  encrypt_type?: number;
}

export interface RefMessage {
  message_item?: MessageItem;
  title?: string;
}

export interface MessageItem {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string; media?: CDNMedia; encode_type?: number; playtime?: number };
  image_item?: { media?: CDNMedia; thumb_media?: CDNMedia; aeskey?: string; url?: string };
  file_item?: { media?: CDNMedia; file_name?: string; md5?: string; len?: string };
  video_item?: { media?: CDNMedia; video_size?: number; play_length?: number };
  ref_msg?: RefMessage;
}

// ── Upload URL Response ──────────────────────────────────────────────────────

export interface UploadUrlResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  upload_url?: string;
  file_token?: string;
  aes_key?: string;
  encrypt_type?: number;
  upload_size?: number;
}

export interface WeixinMessage {
  from_user_id?: string;
  to_user_id?: string;
  client_id?: string;
  session_id?: string;
  message_type?: number;
  message_state?: number;
  item_list?: MessageItem[];
  context_token?: string;
  create_time_ms?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const BOT_TYPE = "3";
export const LONG_POLL_TIMEOUT_MS = 35_000;
export const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export const MSG_ITEM_TEXT = 1;
export const MSG_ITEM_IMAGE = 2;
export const MSG_ITEM_VOICE = 3;
export const MSG_ITEM_FILE = 4;
export const MSG_ITEM_VIDEO = 5;

// ilink 协议版本号，需与官方 @tencent-weixin/openclaw-weixin 保持一致
export const CHANNEL_VERSION = "1.0.3";

export function buildBaseInfo(): { channel_version: string } {
  return { channel_version: CHANNEL_VERSION };
}

// ── Paths ────────────────────────────────────────────────────────────────────

export function getHomeDir(): string {
  return os.homedir();
}

export function getCredentialsDir(): string {
  return path.join(getHomeDir(), ".claude", "channels", "wechat");
}

export function getCredentialsFile(): string {
  return path.join(getCredentialsDir(), "account.json");
}

export function getSyncBufFile(): string {
  return path.join(getCredentialsDir(), "sync_buf.txt");
}

export function getContextTokensFile(): string {
  return path.join(getCredentialsDir(), "context_tokens.json");
}

export function getLockPidFile(): string {
  return path.join(getCredentialsDir(), "lock.pid");
}

export function getSessionsFile(): string {
  return path.join(getCredentialsDir(), "sessions.json");
}

// ── Credentials I/O ─────────────────────────────────────────────────────────

export function loadCredentials(): AccountData | null {
  try {
    const file = getCredentialsFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

export function saveCredentials(data: AccountData): void {
  const dir = getCredentialsDir();
  const file = getCredentialsFile();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best-effort on platforms that don't support chmod
  }
}

// ── WeChat ilink API helpers ────────────────────────────────────────────────

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

export function buildHeaders(token?: string, body?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin(),
  };
  if (body) {
    headers["Content-Length"] = String(Buffer.byteLength(body, "utf-8"));
  }
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export async function apiFetch(params: {
  baseUrl: string;
  endpoint: string;
  body: string;
  token?: string;
  timeoutMs: number;
}): Promise<string> {
  const base = params.baseUrl.endsWith("/")
    ? params.baseUrl
    : `${params.baseUrl}/`;
  const url = new URL(params.endpoint, base).toString();
  const headers = buildHeaders(params.token, params.body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: params.body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      process.stderr.write(`[shared] API error: HTTP ${res.status} — ${text.slice(0, 500)}\n`);
      throw new Error(`HTTP ${res.status}`);
    }
    return text;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function fetchQRCode(baseUrl: string): Promise<QRCodeResponse> {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(
    `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`,
    base,
  );
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`QR fetch failed: ${res.status}`);
  return (await res.json()) as QRCodeResponse;
}

export async function pollQRStatus(
  baseUrl: string,
  qrcode: string,
): Promise<QRStatusResponse> {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    base,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const res = await fetch(url.toString(), {
      headers: { "iLink-App-ClientVersion": "1" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`QR status failed: ${res.status}`);
    return (await res.json()) as QRStatusResponse;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "wait" };
    }
    throw err;
  }
}

// ── Ping API (connectivity test) ────────────────────────────────────────────

export interface PingResult {
  ok: boolean;
  ret?: number;
  errcode?: number;
  errmsg?: string;
  latencyMs?: number;
  error?: string;
}

export async function pingApi(
  baseUrl: string,
  token: string,
): Promise<PingResult> {
  const start = Date.now();
  try {
    const raw = await apiFetch({
      baseUrl,
      endpoint: "ilink/bot/getupdates",
      body: JSON.stringify({
        get_updates_buf: "",
        base_info: { channel_version: CHANNEL_VERSION },
      }),
      token,
      timeoutMs: 10_000,
    });
    const resp = JSON.parse(raw) as {
      ret?: number;
      errcode?: number;
      errmsg?: string;
    };
    const latency = Date.now() - start;
    const isErr =
      (resp.ret !== undefined && resp.ret !== 0) ||
      (resp.errcode !== undefined && resp.errcode !== 0);
    if (isErr) {
      return {
        ok: false,
        ret: resp.ret,
        errcode: resp.errcode,
        errmsg: resp.errmsg,
        latencyMs: latency,
      };
    }
    return { ok: true, latencyMs: latency };
  } catch (err) {
    return { ok: false, error: String(err), latencyMs: Date.now() - start };
  }
}

// ── Upload URL API ───────────────────────────────────────────────────────────

export async function getUploadUrl(
  baseUrl: string,
  token: string,
  params: { file_type: number; file_size: number; file_name?: string },
): Promise<UploadUrlResponse> {
  const raw = await apiFetch({
    baseUrl,
    endpoint: "ilink/bot/getuploadurl",
    body: JSON.stringify({
      base_info: buildBaseInfo(),
      ...params,
    }),
    token,
    timeoutMs: 15_000,
  });
  return JSON.parse(raw) as UploadUrlResponse;
}
