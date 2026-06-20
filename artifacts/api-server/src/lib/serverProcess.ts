import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { db, serverLogsTable, serversTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const MAX_LOGS = 2000;
const MAX_PERSISTED_LOGS = 300;

const BASE_PORT = 25565;
const MAX_PORT_RANGE = 500;

function getPort(serverId: number): number {
  return BASE_PORT + (serverId % MAX_PORT_RANGE);
}

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

function buildServerProperties(cfg: ServerConfig): string {
  const base = cfg.serverProperties ?? "";
  const props: Record<string, string> = {};

  for (const line of base.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0 && !line.startsWith("#")) {
      props[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
    }
  }

  const port = getPort(cfg.id);

  props["max-players"] = String(cfg.maxPlayers);
  props["difficulty"] = cfg.difficulty;
  props["gamemode"] = cfg.gamemode;
  props["enable-rcon"] = "false";
  props["online-mode"] = "false";

  if (cfg.motd) props["motd"] = cfg.motd;

  // IMPORTANT FIX
  props["server-port"] = String(port);
  props["server-ip"] = "";

  return "# server.properties\n" +
    Object.entries(props).map(([k, v]) => `${k}=${v}`).join("\n") +
    "\n";
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
    "-jar",
    "server.jar",
    "--nogui",
  ];

  const javaBin = resolveJavaBin();

  const proc = spawn(javaBin, javaArgs, {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  const state: ProcessState = {
    proc,
    logs: [],
    startedAt: new Date(),
  };

  processes.set(serverId, state);
  stoppedLogs.delete(serverId);

  const port = getPort(serverId);

  // Store port in DB (CRITICAL for TCP routing)
  await db.update(serversTable)
    .set({
      status: "running",
      port,
      updatedAt: new Date()
    })
    .where(eq(serversTable.id, serverId));

  let buffer = "";

  const handleChunk = (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      pushLog(serverId, state, line);
    }
  };

  proc.stdout?.on("data", handleChunk);
  proc.stderr?.on("data", handleChunk);

  proc.on("exit", async (code, signal) => {
    const exitMsg = `[Server exited code=${code ?? "?"} signal=${signal ?? "none"}]`;

    state.logs.push(exitMsg);
    processes.delete(serverId);
    stoppedLogs.set(serverId, [...state.logs]);

    await db.update(serversTable)
      .set({ status: "stopped", port: null, onlinePlayers: 0, updatedAt: new Date() })
      .where(eq(serversTable.id, serverId));
  });
}

export function sendCommand(serverId: number, command: string): boolean {
  const state = processes.get(serverId);
  if (!state?.proc.stdin) return false;

  state.proc.stdin.write(command.trim() + "\n");
  return true;
}

export function stopServer(serverId: number): void {
  const state = processes.get(serverId);
  if (!state) return;

  state.proc.stdin?.write("stop\n");

  setTimeout(() => {
    if (processes.has(serverId)) {
      state.proc.kill("SIGTERM");
    }
  }, 10000);
}
