const MAX_LOGS = 1000;

interface ProcessState {
  status: "stopped" | "downloading" | "starting" | "running" | "stopping" | "error";
  logs: string[];
  startTime?: Date;
  timer?: ReturnType<typeof setInterval>;
  tickCount: number;
}

const states = new Map<number, ProcessState>();

function ts() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function addLog(state: ProcessState, line: string) {
  state.logs.push(line);
  if (state.logs.length > MAX_LOGS) state.logs.shift();
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const PLAYER_NAMES = ["Steve", "Alex", "Notch", "Herobrine", "xXx_Player_xXx", "CoolMiner99", "BuilderPro"];
const RANDOM_EVENTS = [
  (_sid: number, _cfg: ServerConfig) =>
    `[${ts()}] [Server thread/INFO]: ${PLAYER_NAMES[randomInt(0, PLAYER_NAMES.length - 1)]} joined the game`,
  (_sid: number, _cfg: ServerConfig) =>
    `[${ts()}] [Server thread/INFO]: ${PLAYER_NAMES[randomInt(0, PLAYER_NAMES.length - 1)]} left the game`,
  (_sid: number, _cfg: ServerConfig) =>
    `[${ts()}] [Server thread/INFO]: Running autosave...`,
  (_sid: number, _cfg: ServerConfig) =>
    `[${ts()}] [Server thread/INFO]: Saved the game`,
  (_sid: number, _cfg: ServerConfig) =>
    `[${ts()}] [Server thread/INFO]: Keeping entity tick rate at 20 tps`,
  (_sid: number, cfg: ServerConfig) =>
    `[${ts()}] [Server thread/INFO]: Difficulty: ${cfg.difficulty}`,
];

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
}

function buildStartupLogs(cfg: ServerConfig): string[] {
  const lines: string[] = [];
  const t = ts();
  lines.push(`[${t}] [main/INFO]: Loading libraries, please wait...`);
  if (cfg.serverType !== "vanilla") {
    lines.push(`[${t}] [main/INFO]: ${cfg.serverType.charAt(0).toUpperCase() + cfg.serverType.slice(1)} loader ${cfg.loaderVersion ?? "latest"} for Minecraft ${cfg.gameVersion}`);
    lines.push(`[${t}] [main/INFO]: Loading mods from /mods`);
  }
  lines.push(`[${t}] [main/INFO]: Preparing level "world"`);
  lines.push(`[${t}] [main/INFO]: Preparing start region for dimension minecraft:overworld`);
  lines.push(`[${t}] [main/INFO]: Time elapsed: ${randomInt(1200, 4800)} ms`);
  lines.push(`[${t}] [main/INFO]: Preparing start region for dimension minecraft:the_nether`);
  lines.push(`[${t}] [main/INFO]: Preparing start region for dimension minecraft:the_end`);
  lines.push(`[${t}] [Server thread/INFO]: Done (${randomInt(3, 12)}s)! For help, type "help"`);
  lines.push(`[${t}] [Server thread/INFO]: Starting remote control listener`);
  lines.push(`[${t}] [Server thread/INFO]: RCON running on 0.0.0.0:25575`);
  lines.push(`[${t}] [Server thread/INFO]: Server listening on port 25565`);
  return lines;
}

export function getState(serverId: number) {
  return states.get(serverId) ?? { status: "stopped", logs: [], tickCount: 0 };
}

export function getLogs(serverId: number): string[] {
  return states.get(serverId)?.logs ?? [];
}

export function getStatus(serverId: number): string {
  return states.get(serverId)?.status ?? "stopped";
}

export function initDownloading(serverId: number): void {
  const existing = states.get(serverId);
  const state: ProcessState = {
    status: "downloading",
    logs: existing?.logs ?? [],
    startTime: new Date(),
    tickCount: 0,
  };
  states.set(serverId, state);
}

export function appendLog(serverId: number, line: string): void {
  const state = states.get(serverId);
  if (state) addLog(state, line);
}

export function markError(serverId: number, message: string): void {
  const state = states.get(serverId);
  if (state) {
    state.status = "error";
    addLog(state, `[${ts()}] [main/ERROR]: ${message}`);
  }
}

export async function startServer(serverId: number, cfg: ServerConfig): Promise<void> {
  const existing = states.get(serverId);
  if (existing && (existing.status === "running" || existing.status === "starting")) return;

  const state: ProcessState = existing ?? {
    status: "starting",
    logs: [],
    startTime: new Date(),
    tickCount: 0,
  };

  state.status = "starting";
  state.startTime = new Date();
  states.set(serverId, state);

  addLog(state, `[${ts()}] [main/INFO]: Starting Minecraft ${cfg.gameVersion} server (${cfg.serverType})`);
  addLog(state, `[${ts()}] [main/INFO]: Java path: /usr/bin/java  Memory: ${cfg.memory}M`);

  const startupLogs = buildStartupLogs(cfg);
  let i = 0;

  const startupTimer = setInterval(() => {
    if (i < startupLogs.length) {
      addLog(state, startupLogs[i++]);
    } else {
      clearInterval(startupTimer);
      state.status = "running";
      addLog(state, `[${ts()}] [Server thread/INFO]: Server is now accepting connections on port 25565`);

      const runTimer = setInterval(() => {
        const s = states.get(serverId);
        if (!s || s.status !== "running") {
          clearInterval(runTimer);
          return;
        }
        s.tickCount++;
        if (s.tickCount % randomInt(8, 20) === 0) {
          const fn = RANDOM_EVENTS[randomInt(0, RANDOM_EVENTS.length - 1)];
          addLog(s, fn(serverId, cfg));
        }
      }, 5000);

      state.timer = runTimer;
    }
  }, 300);
}

export function sendCommand(serverId: number, command: string): void {
  const state = states.get(serverId);
  if (!state || state.status !== "running") return;
  const cmd = command.trim();
  addLog(state, `[${ts()}] [Server thread/INFO]: [CONSOLE] /${cmd}`);
  const parts = cmd.toLowerCase().split(/\s+/);
  const verb = parts[0];
  if (verb === "help") {
    addLog(state, `[${ts()}] [Server thread/INFO]: --- Help (page 1 of 1) ---`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /list — List online players`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /say <msg> — Broadcast message`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /op <player> — Grant operator`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /deop <player> — Revoke operator`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /whitelist <add|remove|list> — Whitelist`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /ban <player> — Ban player`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /kick <player> — Kick player`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /seed — Show world seed`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /time set <day|night|noon> — Set time`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /weather <clear|rain|thunder> — Set weather`);
    addLog(state, `[${ts()}] [Server thread/INFO]: /stop — Stop the server`);
  } else if (verb === "list") {
    addLog(state, `[${ts()}] [Server thread/INFO]: There are 0 of a max of 20 players online:`);
  } else if (verb === "say") {
    const msg = cmd.slice(4).trim();
    addLog(state, `[${ts()}] [Server thread/INFO]: [Server] ${msg || "(empty message)"}`);
  } else if (verb === "stop") {
    stopServer(serverId);
  } else if (verb === "seed") {
    addLog(state, `[${ts()}] [Server thread/INFO]: Seed: [${Math.floor(Math.random() * 9_999_999_999)}]`);
  } else if (verb === "op") {
    const player = parts[1] ?? "";
    if (player) addLog(state, `[${ts()}] [Server thread/INFO]: Made ${player} a server operator`);
    else addLog(state, `[${ts()}] [Server thread/WARN]: Usage: /op <player>`);
  } else if (verb === "deop") {
    const player = parts[1] ?? "";
    if (player) addLog(state, `[${ts()}] [Server thread/INFO]: Made ${player} no longer a server operator`);
    else addLog(state, `[${ts()}] [Server thread/WARN]: Usage: /deop <player>`);
  } else if (verb === "kick") {
    const player = parts[1] ?? "";
    if (player) addLog(state, `[${ts()}] [Server thread/INFO]: Kicked ${player} from the game`);
    else addLog(state, `[${ts()}] [Server thread/WARN]: Usage: /kick <player>`);
  } else if (verb === "ban") {
    const player = parts[1] ?? "";
    if (player) addLog(state, `[${ts()}] [Server thread/INFO]: Banned player ${player}`);
    else addLog(state, `[${ts()}] [Server thread/WARN]: Usage: /ban <player>`);
  } else if (verb === "whitelist") {
    const sub = parts[1];
    if (sub === "list") addLog(state, `[${ts()}] [Server thread/INFO]: There are 0 whitelisted players`);
    else if (sub === "add") addLog(state, `[${ts()}] [Server thread/INFO]: Added ${parts[2] ?? "?"} to the whitelist`);
    else if (sub === "remove") addLog(state, `[${ts()}] [Server thread/INFO]: Removed ${parts[2] ?? "?"} from the whitelist`);
    else addLog(state, `[${ts()}] [Server thread/WARN]: Usage: /whitelist <add|remove|list>`);
  } else if (verb === "time") {
    const sub = parts[1];
    const val = parts[2] ?? sub;
    if (sub === "set") addLog(state, `[${ts()}] [Server thread/INFO]: Set the time to ${val}`);
    else if (sub === "query") addLog(state, `[${ts()}] [Server thread/INFO]: The time is 6000`);
    else addLog(state, `[${ts()}] [Server thread/WARN]: Usage: /time set <day|night|noon|midnight>`);
  } else if (verb === "weather") {
    const sub = parts[1] ?? "clear";
    addLog(state, `[${ts()}] [Server thread/INFO]: Changing to ${sub} weather`);
  } else if (verb === "difficulty") {
    const sub = parts[1];
    if (sub) addLog(state, `[${ts()}] [Server thread/INFO]: Set difficulty to ${sub}`);
    else addLog(state, `[${ts()}] [Server thread/INFO]: The difficulty is Easy`);
  } else if (verb === "gamemode") {
    const sub = parts[1] ?? "";
    const player = parts[2] ?? "CONSOLE";
    if (sub) addLog(state, `[${ts()}] [Server thread/INFO]: Set ${player}'s game mode to ${sub} Mode`);
    else addLog(state, `[${ts()}] [Server thread/WARN]: Usage: /gamemode <survival|creative|adventure|spectator>`);
  } else {
    addLog(state, `[${ts()}] [Server thread/WARN]: Unknown or incomplete command, see '/help'`);
  }
}

export function stopServer(serverId: number): void {
  const state = states.get(serverId);
  if (!state || state.status === "stopped") return;

  if (state.timer) clearInterval(state.timer);
  state.status = "stopping";

  addLog(state, `[${ts()}] [Server thread/INFO]: Stopping the server`);
  addLog(state, `[${ts()}] [Server thread/INFO]: Saving players`);
  addLog(state, `[${ts()}] [Server thread/INFO]: Saving worlds`);
  addLog(state, `[${ts()}] [Server thread/INFO]: Saving chunks for level 'ServerLevel[world]'/minecraft:overworld`);
  addLog(state, `[${ts()}] [Server thread/INFO]: ThreadedAnvilChunkStorage (world): All chunks are saved`);

  setTimeout(() => {
    const s = states.get(serverId);
    if (s) {
      s.status = "stopped";
      addLog(s, `[${ts()}] [Server thread/INFO]: Server stopped.`);
    }
  }, 1500);
}
