import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { db, serverLogsTable, serversTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const MAX_LOGS = 2000;
const MAX_PERSISTED_LOGS = 300;

interface ProcessState {
  proc: ChildProcess;
  logs: string[];
  startedAt: Date;
}

const processes = new Map<number, ProcessState>();
const stoppedLogs = new Map<number, string[]>();
export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(200);

export interface ServerConfig {
  id: number;
  serverType: string;
  gameVersion: string;
  loaderVersion: string | null;
  memory: number;
  maxPlayers: number;
  motd: string | null;
  difficulty: string;
  gamemode: string;
  serverProperties: string | null;
}

function resolveJavaBin(): string {
  if (process.env.JAVA_HOME) {
    const p = path.join(process.env.JAVA_HOME, "bin", "java");
    if (existsSync(p)) return p;
  }
  const pathDirs = (process.env.PATH ?? "").split(":");
  for (const dir of pathDirs) {
    const p = path.join(dir, "java");
    if (existsSync(p)) return p;
  }
  const fallbacks = [
    "/root/.nix-profile/bin/java",
    "/nix/var/nix/profiles/default/bin/java",
    "/usr/lib/jvm/java-21/bin/java",
    "/usr/bin/java",
  ];
  for (const p of fallbacks) {
    if (existsSync(p)) return p;
  }
  return "java";
}

export function getServerDir(serverId: number): string {
  const dataDir = process.env.DATA_DIR ?? "./server-data";
  return path.join(dataDir, "servers", String(serverId));
}

function pushLog(serverId: number, state: ProcessState, line: string) {
  const trimmed = line.replace(/\r/g, "").trimEnd();
  if (!trimmed) return;
  state.logs.push(trimmed);
  if (state.logs.length > MAX_LOGS) state.logs.shift();
  logEmitter.emit("log", serverId, trimmed);
}

async function persistLogs(serverId: number, logs: string[]) {
  try {
    const tail = logs.slice(-MAX_PERSISTED_LOGS);
    await db.delete(serverLogsTable).where(eq(serverLogsTable.serverId, serverId));
    if (tail.length > 0) {
      await db.insert(serverLogsTable).values(tail.map((line) => ({ serverId, line })));
    }
  } catch { /* non-fatal */ }
}

export async function loadLogsFromDb(serverId: number): Promise<string[]> {
  try {
    const rows = await db
      .select()
      .from(serverLogsTable)
      .where(eq(serverLogsTable.serverId, serverId))
      .orderBy(asc(serverLogsTable.id));
    return rows.map((r) => r.line);
  } catch {
    return [];
  }
}

export function getLogs(serverId: number): string[] {
  const running = processes.get(serverId);
  if (running) return running.logs;
  return stoppedLogs.get(serverId) ?? [];
}

export function getStatus(serverId: number): "running" | "stopped" {
  return processes.has(serverId) ? "running" : "stopped";
}

function buildServerProperties(cfg: ServerConfig): string {
  const base = cfg.serverProperties ?? "";
  const props: Record<string, string> = {};
  for (const line of base.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) {
      props[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  props["max-players"] = String(cfg.maxPlayers);
  props["difficulty"] = cfg.difficulty;
  props["gamemode"] = cfg.gamemode;
  if (cfg.motd) props["motd"] = cfg.motd;
  props["enable-rcon"] = "false";
  props["online-mode"] = "false";
  props["server-port"] = "25565";

  const lines = Object.entries(props).map(([k, v]) => `${k}=${v}`);
  return "# server.properties\n" + lines.join("\n") + "\n";
}

export async function startServer(serverId: number, cfg: ServerConfig): Promise<void> {
  if (processes.has(serverId)) return;

  const dir = getServerDir(serverId);
  mkdirSync(dir, { recursive: true });

  writeFileSync(path.join(dir, "eula.txt"), "eula=true\n");
  writeFileSync(path.join(dir, "server.properties"), buildServerProperties(cfg));

  const javaArgs = [
    `-Xmx${cfg.memory}M`,
    `-Xms${Math.max(512, Math.floor(cfg.memory / 2))}M`,
    "-jar", "server.jar",
    "--nogui",
  ];

  const javaBin = resolveJavaBin();

  let proc: ChildProcess;
  try {
    proc = spawn(javaBin, javaArgs, {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
  } catch (err) {
    const msg = `[ERROR] Failed to spawn java: ${String(err)}. Is Java installed?`;
    stoppedLogs.set(serverId, [msg]);
    logEmitter.emit("log", serverId, msg);
    await db
      .update(serversTable)
      .set({ status: "stopped", port: null, updatedAt: new Date() })
      .where(eq(serversTable.id, serverId));
    return;
  }

  const state: ProcessState = { proc, logs: [], startedAt: new Date() };
  processes.set(serverId, state);
  stoppedLogs.delete(serverId);

  let lineBuffer = "";
  const handleChunk = (chunk: Buffer) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      pushLog(serverId, state, line);
    }
  };

  proc.stdout?.on("data", handleChunk);
  proc.stderr?.on("data", handleChunk);

  proc.on("exit", (code, signal) => {
    if (lineBuffer.trim()) {
      pushLog(serverId, state, lineBuffer);
      lineBuffer = "";
    }
    const exitMsg = `[Server process exited — code=${code ?? "?"} signal=${signal ?? "none"}]`;
    state.logs.push(exitMsg);
    logEmitter.emit("log", serverId, exitMsg);
    processes.delete(serverId);
    stoppedLogs.set(serverId, [...state.logs]);
    void persistLogs(serverId, state.logs);
    void db
      .update(serversTable)
      .set({ status: "stopped", port: null, onlinePlayers: 0, updatedAt: new Date() })
      .where(eq(serversTable.id, serverId));
  });

  proc.on("error", (err: NodeJS.ErrnoException) => {
    const isNotFound = err.code === "ENOENT" || err.code === "EACCES";
    const msg = isNotFound
      ? `[ERROR] Java not found — make sure Java is installed and in PATH (${String(err)})`
      : `[Process error: ${String(err)}]`;
    pushLog(serverId, state, msg);
    if (isNotFound) {
      processes.delete(serverId);
      stoppedLogs.set(serverId, [...state.logs]);
      void persistLogs(serverId, state.logs);
      void db
        .update(serversTable)
        .set({ status: "stopped", port: null, onlinePlayers: 0, updatedAt: new Date() })
        .where(eq(serversTable.id, serverId));
    }
  });
}

export function sendCommand(serverId: number, command: string): boolean {
  const state = processes.get(serverId);
  if (!state || !state.proc.stdin) return false;
  state.proc.stdin.write(command.trim() + "\n");
  return true;
}

export function stopServer(serverId: number): void {
  const state = processes.get(serverId);
  if (!state) return;
  if (state.proc.stdin) {
    state.proc.stdin.write("stop\n");
  }
  setTimeout(() => {
    if (processes.has(serverId)) {
      state.proc.kill("SIGTERM");
    }
  }, 10_000);
}

export function appendLog(serverId: number, line: string): void {
  const state = processes.get(serverId);
  if (state) {
    pushLog(serverId, state, line);
  } else {
    const logs = stoppedLogs.get(serverId) ?? [];
    logs.push(line);
    stoppedLogs.set(serverId, logs);
    logEmitter.emit("log", serverId, line);
  }
}

export function initDownloading(serverId: number): void {
  if (!stoppedLogs.has(serverId)) stoppedLogs.set(serverId, []);
}

export function markError(serverId: number, message: string): void {
  const line = `[ERROR] ${message}`;
  appendLog(serverId, line);
}

export async function resetStaleServers(): Promise<void> {
  try {
    await db
      .update(serversTable)
      .set({ status: "stopped", port: null, onlinePlayers: 0, updatedAt: new Date() })
      .where(eq(serversTable.status, "running" as string));

    const allServers = await db.select({ id: serversTable.id }).from(serversTable);
    await Promise.all(
      allServers.map(async ({ id }) => {
        const logs = await loadLogsFromDb(id);
        if (logs.length > 0) stoppedLogs.set(id, logs);
      })
    );
  } catch { /* non-fatal */ }
}
