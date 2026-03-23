#!/usr/bin/env node

/**
 * Claude Code WeChat Channel — CLI entry point
 *
 * Usage:
 *   npx claude-code-wechat-channel setup   — WeChat QR login
 *   npx claude-code-wechat-channel start   — Start channel server (used by .mcp.json)
 *   npx claude-code-wechat-channel install — Write .mcp.json to current directory
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "dist");

function getBunPath() {
  try {
    return execSync("which bun", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function getNodePath() {
  return process.execPath;
}

function runScript(script, args = []) {
  const scriptPath = resolve(DIST_DIR, script);
  if (!existsSync(scriptPath)) {
    console.error(`Error: ${scriptPath} not found. Package may be corrupted.`);
    process.exit(1);
  }

  // Prefer bun for performance, fall back to node
  const bun = getBunPath();
  const runtime = bun || getNodePath();
  const result = spawnSync(runtime, [scriptPath, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

function getCredentialsDir() {
  return join(os.homedir(), ".claude", "channels", "wechat");
}

function getCredentialsFile() {
  return join(getCredentialsDir(), "account.json");
}

async function status() {
  const credFile = getCredentialsFile();

  if (!existsSync(credFile)) {
    console.log("Status: NOT CONFIGURED");
    console.log("");
    console.log("No account credentials found.");
    console.log("Run: npx claude-code-wechat-channel setup");
    process.exit(1);
  }

  let account;
  try {
    account = JSON.parse(readFileSync(credFile, "utf-8"));
  } catch {
    console.log("Status: ERROR");
    console.log("");
    console.log("Failed to parse account.json. It may be corrupted.");
    console.log(`File: ${credFile}`);
    console.log("Fix: Remove the file and run setup again.");
    process.exit(1);
  }

  console.log("Account Information:");
  console.log(`  Bot ID:    ${account.accountId ?? "N/A"}`);
  console.log(`  User ID:   ${account.userId ?? "N/A"}`);
  console.log(`  Base URL:  ${account.baseUrl ?? "N/A"}`);
  console.log(`  Token:     ${account.token ? account.token.slice(0, 8) + "..." : "MISSING"}`);

  if (account.savedAt) {
    const ageMs = Date.now() - new Date(account.savedAt).getTime();
    const ageHours = (ageMs / 3600_000).toFixed(1);
    console.log(`  Saved at:  ${account.savedAt} (${ageHours}h ago)`);
  }

  if (!account.token) {
    console.log("");
    console.log("Status: MISSING TOKEN");
    console.log("The account.json is missing the bot_token.");
    console.log("Fix: Run setup again: npx claude-code-wechat-channel setup");
    process.exit(1);
  }

  // Test API connectivity
  console.log("");
  console.log("Testing API connectivity...");

  const body = JSON.stringify({
    get_updates_buf: "",
    base_info: { channel_version: "1.0.2" },
  });

  const base = (account.baseUrl || "https://ilinkai.weixin.qq.com").replace(/\/$/, "") + "/";
  const url = base + "ilink/bot/getupdates";

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        AuthorizationType: "ilink_bot_token",
        Authorization: `Bearer ${account.token}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const latency = Date.now() - start;
    const text = await res.text();

    if (!res.ok) {
      console.log(`Status: API ERROR (HTTP ${res.status}, ${latency}ms)`);
      console.log(`  Response: ${text.slice(0, 300)}`);
      console.log("");
      console.log("Possible causes:");
      console.log("  - Bot token is invalid or expired");
      console.log("  - Network/firewall blocking the request");
      console.log("Fix: Run setup again: npx claude-code-wechat-channel setup");
      process.exit(1);
    }

    let resp;
    try {
      resp = JSON.parse(text);
    } catch {
      console.log(`Status: UNEXPECTED RESPONSE (${latency}ms)`);
      console.log(`  Response: ${text.slice(0, 300)}`);
      process.exit(1);
    }

    const isErr =
      (resp.ret !== undefined && resp.ret !== 0) ||
      (resp.errcode !== undefined && resp.errcode !== 0);

    if (isErr) {
      if (resp.ret === -14 || resp.errcode === -14) {
        console.log(`Status: SESSION EXPIRED (${latency}ms)`);
        console.log("  The WeChat session has expired.");
        console.log("");
        console.log("Fix: Run setup to re-login: npx claude-code-wechat-channel setup");
        process.exit(1);
      }
      console.log(`Status: API ERROR (${latency}ms)`);
      console.log(`  ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""}`);
      console.log("");
      console.log("Possible causes:");
      console.log("  - ClawBot is not activated in WeChat");
      console.log("  - Bot token is invalid");
      console.log("Fix: Run setup again: npx claude-code-wechat-channel setup");
      process.exit(1);
    }

    console.log(`Status: OK (${latency}ms)`);
    console.log("  API is reachable and session is valid.");
    console.log("");
    console.log("The WeChat channel is ready to use.");
    console.log("If messages aren't being received by Claude Code, check:");
    console.log("  1. Claude Code is running with MCP connected");
    console.log("  2. Messages are sent to the ClawBot in WeChat");
  } catch (err) {
    const elapsed = Date.now() - start;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      console.log(`Status: TIMEOUT (${elapsed}ms)`);
      console.log("  The API request timed out.");
      console.log("");
      console.log("Possible causes:");
      console.log("  - Network connectivity issues");
      console.log("  - Firewall blocking access to ilinkai.weixin.qq.com");
    } else {
      console.log(`Status: NETWORK ERROR (${elapsed}ms)`);
      console.log(`  ${err.message}`);
      console.log("");
      console.log("Possible causes:");
      console.log("  - No internet connection");
      console.log("  - DNS resolution failure");
      console.log("  - Firewall blocking the request");
    }
    process.exit(1);
  }
}

function install() {
  const mcpConfig = {
    mcpServers: {
      wechat: {
        command: "npx",
        args: ["-y", "@liangrk/claude-code-wechatbot", "start"],
      },
    },
  };

  const mcpPath = resolve(process.cwd(), ".mcp.json");
  const tmpPath = mcpPath + ".tmp";

  function atomicWrite(filePath, content) {
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, filePath);
  }

  if (existsSync(mcpPath)) {
    try {
      const existing = JSON.parse(readFileSync(mcpPath, "utf-8"));
      existing.mcpServers = existing.mcpServers || {};
      existing.mcpServers.wechat = mcpConfig.mcpServers.wechat;
      atomicWrite(mcpPath, JSON.stringify(existing, null, 2) + "\n");
      console.log(`Updated: ${mcpPath}`);
    } catch (err) {
      console.error(`Warning: Failed to update existing .mcp.json: ${err}`);
      atomicWrite(mcpPath, JSON.stringify(mcpConfig, null, 2) + "\n");
      console.log(`Created: ${mcpPath}`);
    }
  } else {
    atomicWrite(mcpPath, JSON.stringify(mcpConfig, null, 2) + "\n");
    console.log(`Created: ${mcpPath}`);
  }

  console.log(`
Next steps:
  1. Run: npx claude-code-wechat-channel setup
  2. Then: claude --dangerously-skip-permissions
`);
}

function help() {
  console.log(`
  Claude Code WeChat Channel

  Usage: npx claude-code-wechat-channel <command>

  Commands:
    setup     WeChat QR login (scan to authenticate)
    start     Start the channel MCP server
    status    Check account and API connectivity
    install   Write .mcp.json to current directory
    help      Show this help message
`);
}

const command = process.argv[2];

switch (command) {
  case "setup":
    runScript("setup.js");
    break;
  case "start":
    runScript("wechat-channel.js");
    break;
  case "status":
    status();
    break;
  case "install":
    install();
    break;
  case "help":
  case "--help":
  case "-h":
    help();
    break;
  default:
    if (command) {
      console.error(`Unknown command: ${command}`);
    }
    help();
    process.exit(command ? 1 : 0);
}
