/**
 * media.ts — AES-128-ECB encryption/decryption + CDN upload/download for WeChat ilink API.
 *
 * Handles the encrypted media pipeline used by WeChat ClawBot:
 *   - Download: CDN GET → AES decrypt → plaintext buffer
 *   - Upload: plaintext buffer → AES encrypt → CDN POST → file_token
 */

import crypto from "node:crypto";
import fs from "node:fs";

import {
  type CDNMedia,
  type UploadUrlResponse,
  CDN_BASE_URL,
  getUploadUrl,
} from "./shared.js";

// ── AES-128-ECB + PKCS7 ────────────────────────────────────────────────────

function pkcs7Pad(buf: Buffer, blockSize: number = 16): Buffer {
  const padLen = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(padLen, padLen)]);
}

function pkcs7Unpad(buf: Buffer): Buffer {
  const padLen = buf[buf.length - 1];
  if (padLen === 0 || padLen > 16) return buf;
  // Verify all padding bytes
  for (let i = buf.length - padLen; i < buf.length; i++) {
    if (buf[i] !== padLen) return buf;
  }
  return buf.subarray(0, buf.length - padLen);
}

/**
 * Parse an AES key from WeChat API.
 * Two formats:
 *   1. base64(16 raw bytes) — the key itself
 *   2. base64(hex string of 16 bytes) — need to decode hex first
 */
export function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, "base64");

  // If 16 bytes → raw key
  if (decoded.length === 16) return decoded;

  // If longer → treat as base64-encoded hex string
  const hexStr = decoded.toString("utf-8").trim();
  if (/^[0-9a-fA-F]{32}$/.test(hexStr)) {
    return Buffer.from(hexStr, "hex");
  }

  // Fallback: try first 16 bytes
  return decoded.subarray(0, 16);
}

export function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const padded = pkcs7Pad(plaintext);
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}

export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return pkcs7Unpad(decrypted);
}

// ── CDN Download ────────────────────────────────────────────────────────────

/**
 * Download an encrypted file from CDN and decrypt it.
 * Returns the plaintext buffer, or null on failure.
 */
export async function downloadAndDecryptBuffer(
  media: CDNMedia,
): Promise<Buffer | null> {
  if (!media.encrypt_query_param || !media.aes_key) return null;

  try {
    const url = `${CDN_BASE_URL}?${media.encrypt_query_param}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_DOWNLOAD_SIZE) return null;

    const arrayBuf = await res.arrayBuffer();
    const encrypted = Buffer.from(arrayBuf);
    if (encrypted.length > MAX_DOWNLOAD_SIZE) return null;

    const key = parseAesKey(media.aes_key);

    return decryptAesEcb(encrypted, key);
  } catch {
    return null;
  }
}

// ── CDN Upload ──────────────────────────────────────────────────────────────

/**
 * Upload an encrypted buffer to CDN via the given upload URL.
 * Retries once on failure.
 */
async function uploadBufferToCdn(
  uploadUrl: string,
  encrypted: Buffer,
): Promise<boolean> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(uploadUrl, {
        method: "POST",
        body: encrypted,
        headers: {
          "Content-Type": "application/octet-stream",
        },
      });
      if (res.ok) return true;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }
  }
  return false;
}

/**
 * Full upload pipeline:
 *   1. Call getuploadurl to get CDN URL + AES key
 *   2. Encrypt the plaintext buffer
 *   3. POST encrypted data to CDN
 *   4. Return the file_token for use in sendmessage
 */
export async function uploadMediaToCdn(
  baseUrl: string,
  token: string,
  params: { file_type: number; file_size: number; file_name?: string },
  plaintext: Buffer,
): Promise<UploadUrlResponse | null> {
  try {
    // Step 1: Get upload URL and AES key
    const uploadInfo = await getUploadUrl(baseUrl, token, params);
    if (!uploadInfo.upload_url || !uploadInfo.aes_key) {
      return uploadInfo;
    }

    // Step 2: Encrypt
    const key = parseAesKey(uploadInfo.aes_key);
    const encrypted = encryptAesEcb(plaintext, key);

    // Step 3: Upload to CDN
    const success = await uploadBufferToCdn(uploadInfo.upload_url, encrypted);
    if (!success) return null;

    return uploadInfo;
  } catch {
    return null;
  }
}

// ── File I/O Helpers ────────────────────────────────────────────────────────

/**
 * Read a local file and return its buffer.
 */
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

export function readLocalFile(filePath: string): Buffer | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_DOWNLOAD_SIZE) {
      process.stderr.write(`[media] File too large: ${filePath} (${stat.size} bytes)\n`);
      return null;
    }
    if (stat.size === 0) {
      process.stderr.write(`[media] File is empty: ${filePath}\n`);
      return null;
    }
    return fs.readFileSync(filePath);
  } catch (err) {
    process.stderr.write(`[media] Failed to read file ${filePath}: ${String(err)}\n`);
    return null;
  }
}
