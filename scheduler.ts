/**
 * scheduler.ts — 轻量级定时调度器
 *
 * 管理定时提醒任务，支持 cron 表达式。
 * 任务持久化到 loops.json，进程重启后恢复。
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { getCredentialsDir, getLoopsFile } from "./shared.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoopTask {
  id: string;
  senderId: string;
  message: string;
  cron: string;
  nextRun: number;
  enabled: boolean;
  createdAt: number;
}

export type LoopCallback = (task: LoopTask) => void;

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[scheduler] ${msg}\n`);
}

// ── Cron utilities ───────────────────────────────────────────────────────────

/**
 * 解析 5 字段 cron 表达式，计算下一次执行时间戳 (ms)。
 * 支持: 分 时 日 月 周
 * 特殊值: *  ,  -  /
 * 不支持: @yearly, @daily 等
 */
function parseCronFields(cron: string): number[] | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  return parts.map((part, fieldIdx) => {
    const ranges = [
      [0, 59], // minute
      [0, 23], // hour
      [1, 31], // day
      [1, 12], // month
      [0, 6],  // weekday (0=Sun)
    ];
    const [min, max] = ranges[fieldIdx]!;

    if (part === "*") return -1; // wildcard

    // Handle step: */N or a/N
    if (part.includes("/")) {
      const [base, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) return null;
      const start = base === "*" ? min : parseInt(base, 10);
      if (isNaN(start) || start < min || start > max) return null;
      return step;
    }

    // Handle range: a-b
    if (part.includes("-")) {
      const [loStr, hiStr] = part.split("-");
      const lo = parseSingle(loStr);
      const hi = parseSingle(hiStr);
      if (lo === null || hi === null) return null;
      if (lo < min || hi > max) return null;
      return -(lo * 100 + hi); // encode as negative range
    }

    // Handle comma: a,b,c
    if (part.includes(",")) {
      return part.split(",").map(parseSingle).reduce((acc, v) => {
        if (v === null || v < min || v > max) return null;
        if (acc === null) return null;
        return acc | (1 << v);
      }, 0 as number | null) ?? null;
    }

    // Single value
    const val = parseSingle(part);
    if (val === null || val < min || val > max) return null;
    return val;
  });
}

function parseSingle(s: string): number | null {
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? null : n;
}

function matchesField(value: number, parsed: number, fieldIdx: number): boolean {
  const ranges = [
    [0, 59], [0, 23], [1, 31], [1, 12], [0, 6],
  ];
  const [min] = ranges[fieldIdx]!;

  if (parsed === -1) return true; // wildcard
  if (parsed >= 0 && parsed <= 59 && fieldIdx === 0) {
    // Simple value match for minute
    return value === parsed;
  }
  if (parsed >= 0 && fieldIdx === 1) {
    return value === parsed;
  }
  if (parsed >= 0) {
    return value === parsed;
  }
  // Negative range
  if (parsed < 0) {
    const abs = Math.abs(parsed);
    const lo = Math.floor(abs / 100);
    const hi = abs % 100;
    return value >= lo && value <= hi;
  }
  // Bitmask (comma-separated)
  return (parsed & (1 << value)) !== 0;
}

/**
 * 计算下一次执行时间 (Date)。
 * 从 now + 1min 开始扫描，最多扫描 366 天。
 */
export function getNextCronRun(cron: string): number | null {
  const fields = parseCronFields(cron);
  if (!fields || fields.some((f) => f === null)) return null;

  const now = new Date();
  const start = new Date(now.getTime() + 60_000); // at least 1 min from now
  start.setSeconds(0, 0);

  const maxIter = 366 * 24 * 60; // 1 year of minutes
  const cursor = new Date(start);

  for (let i = 0; i < maxIter; i++) {
    const m = cursor.getMinutes();
    const h = cursor.getHours();
    const d = cursor.getDate();
    const mon = cursor.getMonth() + 1;
    const w = cursor.getDay();

    if (
      matchesField(m, fields[0]!, 0) &&
      matchesField(h, fields[1]!, 1) &&
      matchesField(d, fields[2]!, 2) &&
      matchesField(mon, fields[3]!, 3) &&
      matchesField(w, fields[4]!, 4)
    ) {
      return cursor.getTime();
    }

    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

// ── Scheduler ────────────────────────────────────────────────────────────────

export class Scheduler {
  private tasks: Map<string, LoopTask> = new Map();
  private callback: LoopCallback | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {}

  /** Load persisted tasks from disk */
  load(): void {
    const file = getLoopsFile();
    try {
      if (!fs.existsSync(file)) return;
      const data = JSON.parse(fs.readFileSync(file, "utf-8")) as LoopTask[];
      const now = Date.now();
      for (const task of data) {
        if (!task.id || !task.senderId) continue;
        // Recalculate nextRun for recurring tasks that have passed
        if (task.enabled && task.nextRun < now) {
          const next = getNextCronRun(task.cron);
          if (next) {
            task.nextRun = next;
          } else {
            task.enabled = false;
          }
        }
        this.tasks.set(task.id, task);
      }
      log(`加载 ${this.tasks.size} 个定时任务`);
    } catch (err) {
      log(`加载定时任务失败: ${String(err)}`);
    }
  }

  /** Persist tasks to disk */
  save(): void {
    try {
      const dir = getCredentialsDir();
      fs.mkdirSync(dir, { recursive: true });
      const data = [...this.tasks.values()];
      fs.writeFileSync(getLoopsFile(), JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      log(`保存定时任务失败: ${String(err)}`);
    }
  }

  /** Set the callback for firing tasks */
  onFire(cb: LoopCallback): void {
    this.callback = cb;
  }

  /** Add a new task */
  add(senderId: string, cron: string, message: string): LoopTask | null {
    const nextRun = getNextCronRun(cron);
    if (!nextRun) {
      log(`无效的 cron 表达式: ${cron}`);
      return null;
    }

    const task: LoopTask = {
      id: crypto.randomBytes(4).toString("hex"),
      senderId,
      message,
      cron,
      nextRun,
      enabled: true,
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    this.save();
    log(`添加定时任务: ${task.id} cron=${cron} next=${new Date(nextRun).toISOString()}`);
    return task;
  }

  /** Remove a task by ID */
  remove(id: string): boolean {
    const removed = this.tasks.delete(id);
    if (removed) this.save();
    return removed;
  }

  /** Remove all tasks for a sender */
  removeBySender(senderId: string): number {
    let count = 0;
    for (const [id, task] of this.tasks) {
      if (task.senderId === senderId) {
        this.tasks.delete(id);
        count++;
      }
    }
    if (count > 0) this.save();
    return count;
  }

  /** List tasks for a sender */
  list(senderId: string): LoopTask[] {
    return [...this.tasks.values()].filter((t) => t.senderId === senderId);
  }

  /** Enable all tasks for a sender */
  enableAll(senderId: string): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.senderId === senderId && !task.enabled) {
        const next = getNextCronRun(task.cron);
        if (next) {
          task.nextRun = next;
          task.enabled = true;
          count++;
        }
      }
    }
    if (count > 0) this.save();
    return count;
  }

  /** Disable all tasks for a sender */
  disableAll(senderId: string): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.senderId === senderId && task.enabled) {
        task.enabled = false;
        count++;
      }
    }
    if (count > 0) this.save();
    return count;
  }

  /** Check for due tasks and fire them */
  tick(): void {
    const now = Date.now();
    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;
      if (task.nextRun > now) continue;

      log(`触发定时任务: ${task.id} sender=${task.senderId} msg=${task.message.slice(0, 30)}`);

      // Fire callback
      if (this.callback) {
        try {
          this.callback(task);
        } catch (err) {
          log(`定时任务回调失败: ${String(err)}`);
        }
      }

      // Schedule next run for recurring tasks
      const next = getNextCronRun(task.cron);
      if (next) {
        task.nextRun = next;
        this.save();
      } else {
        // Cron expression can't resolve next run — disable
        task.enabled = false;
        this.save();
        log(`定时任务 ${task.id} 无法计算下次执行时间，已禁用`);
      }
    }
  }

  /** Start the tick interval */
  start(intervalMs: number = 30_000): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), intervalMs);
    log(`定时调度器已启动 (间隔 ${intervalMs / 1000}s)`);
  }

  /** Stop the tick interval */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Format task list for display */
  static formatTaskList(tasks: LoopTask[]): string {
    if (tasks.length === 0) return "暂无定时任务。";

    const lines = tasks.map((t) => {
      const status = t.enabled ? "启用" : "暂停";
      const next = t.enabled
        ? new Date(t.nextRun).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "-";
      return `  [${t.id}] ${status} | ${t.cron} | 下次: ${next} | ${t.message}`;
    });

    return `定时任务 (${tasks.length}):\n${lines.join("\n")}`;
  }
}
