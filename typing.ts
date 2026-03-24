/**
 * typing.ts — Typing indicator management for WeChat ilink API.
 *
 * Provides TypingManager which caches typing_tickets per sender
 * and sends typing start/cancel via POST /ilink/bot/sendtyping.
 * Failures are silently swallowed so they never block message flow.
 */

import { apiFetch, buildBaseInfo } from "./shared.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface TypingTicket {
  ticket: string;
  expiresAt: number;
}

interface GetConfigResponse {
  ret?: number;
  errcode?: number;
  typing_ticket?: string;
}

// ── TypingManager ────────────────────────────────────────────────────────────

const TYPING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TYPING_BACKOFF_BASE_MS = 5_000; // 5s initial, exponential
const TYPING_MAX_BACKOFF_MS = 30_000;

export class TypingManager {
  private tickets = new Map<string, TypingTicket>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private failCounts = new Map<string, number>();
  private config = { botId: "", token: "", baseUrl: "" };

  configure(botId: string, token: string, baseUrl: string): void {
    this.config = { botId, token, baseUrl };
  }

  private getTicket(senderId: string): string | undefined {
    const entry = this.tickets.get(senderId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.tickets.delete(senderId);
      return undefined;
    }
    return entry.ticket;
  }

  private setTicket(senderId: string, ticket: string): void {
    this.tickets.set(senderId, { ticket, expiresAt: Date.now() + TYPING_TTL_MS });
  }

  private getBackoffMs(senderId: string): number {
    const count = this.failCounts.get(senderId) ?? 0;
    return Math.min(TYPING_BACKOFF_BASE_MS * Math.pow(2, count), TYPING_MAX_BACKOFF_MS);
  }

  private async fetchConfig(senderId: string): Promise<string | null> {
    try {
      const raw = await apiFetch({
        baseUrl: this.config.baseUrl,
        endpoint: "ilink/bot/getconfig",
        body: JSON.stringify({
          base_info: buildBaseInfo(),
          bot_id: this.config.botId,
          user_id: senderId,
        }),
        token: this.config.token,
        timeoutMs: 10_000,
      });
      const resp = JSON.parse(raw) as GetConfigResponse;
      if (resp.typing_ticket) {
        this.setTicket(senderId, resp.typing_ticket);
        this.failCounts.set(senderId, 0);
        return resp.typing_ticket;
      }
    } catch {
      // silent
    }
    return null;
  }

  async sendTyping(senderId: string, status: 1 | 2): Promise<void> {
    if (!this.config.token) return;

    // status=2 (cancel): clear keepalive timer
    if (status === 2) {
      const timer = this.timers.get(senderId);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(senderId);
      }
    }

    let ticket = this.getTicket(senderId);
    if (!ticket) {
      ticket = await this.fetchConfig(senderId);
      if (!ticket) return;
    }

    try {
      await apiFetch({
        baseUrl: this.config.baseUrl,
        endpoint: "ilink/bot/sendtyping",
        body: JSON.stringify({
          base_info: buildBaseInfo(),
          typing_ticket: ticket,
          status,
        }),
        token: this.config.token,
        timeoutMs: 5_000,
      });
      this.failCounts.set(senderId, 0);
    } catch {
      // Exponential backoff on failure
      const count = (this.failCounts.get(senderId) ?? 0) + 1;
      this.failCounts.set(senderId, count);
      // Invalidate ticket on repeated failures
      if (count >= 3) {
        this.tickets.delete(senderId);
        this.failCounts.delete(senderId);
      }
    }
  }

  startKeepalive(senderId: string): void {
    // Clear any existing timer
    const existing = this.timers.get(senderId);
    if (existing) clearInterval(existing);

    const intervalMs = this.getBackoffMs(senderId);
    const timer = setInterval(() => {
      this.sendTyping(senderId, 1);
    }, intervalMs);

    this.timers.set(senderId, timer);
  }

  stopKeepalive(senderId: string): void {
    const timer = this.timers.get(senderId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(senderId);
    }
  }

  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}
