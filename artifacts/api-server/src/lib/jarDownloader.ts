import { createWriteStream, mkdirSync } from "fs";
import { stat } from "fs/promises";
import path from "path";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "server-data");

export function serverDir(serverId: number): string {
  return path.join(DATA_DIR, "servers", String(serverId));
}

export function serverJarPath(serverId: number): string {
  return path.join(serverDir(serverId), "server.jar");
}

export function modsDir(serverId: number): string {
  return path.join(serverDir(serverId), "mods");
}

export function ensureDirs(serverId: number): void {
  mkdirSync(serverDir(serverId), { recursive: true });
  mkdirSync(modsDir(serverId), { recursive: true });
}

async function streamToFile(url: string, dest: string, onProgress?: (bytes: number) => void): Promise<number> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  if (!res.body) throw new Error("No response body");

  mkdirSync(path.dirname(dest), { recursive: true });
  const ws = createWriteStream(dest);
  const reader = res.body.getReader();
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      ws.write(Buffer.from(value));
      bytes += value.length;
      onProgress?.(bytes);
    }
  } finally {
    reader.releaseLock();
    ws.end();
  }

  await new Promise<void>((resolve, reject) => {
    ws.on("finish", resolve);
    ws.on("error", reject);
  });

  return bytes;
}

async function getVanillaJarUrl(gameVersion: string): Promise<string> {
  const manifestRes = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");
  if (!manifestRes.ok) throw new Error("Failed to fetch Mojang version manifest");
  const manifest = (await manifestRes.json()) as {
    versions: Array<{ id: string; url: string }>;
  };
  const entry = manifest.versions.find((v) => v.id === gameVersion);
  if (!entry) throw new Error(`Minecraft version ${gameVersion} not found in Mojang manifest`);

  const versionRes = await fetch(entry.url);
  if (!versionRes.ok) throw new Error(`Failed to fetch version metadata for ${gameVersion}`);
  const versionData = (await versionRes.json()) as {
    downloads: { server: { url: string } };
  };
  return versionData.downloads.server.url;
}

async function getPaperJarUrl(gameVersion: string): Promise<string> {
  const buildsRes = await fetch(
    `https://api.papermc.io/v2/projects/paper/versions/${gameVersion}/builds`
  );
  if (!buildsRes.ok) throw new Error(`No Paper builds found for ${gameVersion}`);
  const data = (await buildsRes.json()) as {
    builds: Array<{
      build: number;
      downloads: { application: { name: string } };
    }>;
  };
  const latest = data.builds[data.builds.length - 1];
  if (!latest) throw new Error(`Empty Paper build list for ${gameVersion}`);
  const name = latest.downloads.application.name;
  return `https://api.papermc.io/v2/projects/paper/versions/${gameVersion}/builds/${latest.build}/downloads/${name}`;
}

async function getPurpurJarUrl(gameVersion: string): Promise<string> {
  return `https://api.purpurmc.org/v2/purpur/${gameVersion}/latest/download`;
}

async function getFabricJarUrl(gameVersion: string, loaderVersion?: string | null): Promise<string> {
  let loader = loaderVersion;
  if (!loader) {
    const res = await fetch("https://meta.fabricmc.net/v2/versions/loader");
    if (!res.ok) throw new Error("Failed to get Fabric loader versions");
    const loaders = (await res.json()) as Array<{ version: string; stable: boolean }>;
    loader = (loaders.find((l) => l.stable) ?? loaders[0])?.version;
    if (!loader) throw new Error("No Fabric loader versions available");
  }

  const instRes = await fetch("https://meta.fabricmc.net/v2/versions/installer");
  if (!instRes.ok) throw new Error("Failed to get Fabric installer versions");
  const installers = (await instRes.json()) as Array<{ version: string; stable: boolean }>;
  const installer = (installers.find((l) => l.stable) ?? installers[0])?.version;
  if (!installer) throw new Error("No Fabric installer versions available");

  return `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${loader}/${installer}/server/jar`;
}

async function getNeoForgeJarUrl(gameVersion: string, loaderVersion?: string | null): Promise<string> {
  if (loaderVersion) {
    return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
  }
  const res = await fetch(
    `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`
  );
  if (!res.ok) throw new Error("Failed to get NeoForge versions");
  const data = (await res.json()) as { versions: string[] };
  const mcMajor = gameVersion.split(".").slice(0, 2).join(".");
  const matching = (data.versions ?? [])
    .filter((v) => v.startsWith(mcMajor))
    .sort()
    .reverse();
  const latest = matching[0];
  if (!latest) throw new Error(`No NeoForge versions for ${gameVersion}`);
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${latest}/neoforge-${latest}-installer.jar`;
}

export interface DownloadResult {
  path: string;
  size: number;
}

export async function downloadServerJar(
  serverId: number,
  serverType: string,
  gameVersion: string,
  loaderVersion?: string | null,
  onProgress?: (downloaded: number) => void
): Promise<DownloadResult> {
  ensureDirs(serverId);
  const dest = serverJarPath(serverId);
  const type = serverType.toLowerCase();

  let url: string;
  switch (type) {
    case "vanilla":
      url = await getVanillaJarUrl(gameVersion);
      break;
    case "paper":
      url = await getPaperJarUrl(gameVersion);
      break;
    case "purpur":
      url = await getPurpurJarUrl(gameVersion);
      break;
    case "fabric":
      url = await getFabricJarUrl(gameVersion, loaderVersion);
      break;
    case "neoforge":
      url = await getNeoForgeJarUrl(gameVersion, loaderVersion);
      break;
    case "forge":
      url = await getVanillaJarUrl(gameVersion);
      break;
    default:
      url = await getVanillaJarUrl(gameVersion);
  }

  const size = await streamToFile(url, dest, onProgress);
  return { path: dest, size };
}

export async function getJarInfo(serverId: number): Promise<{ exists: boolean; size: number }> {
  try {
    const s = await stat(serverJarPath(serverId));
    return { exists: true, size: s.size };
  } catch {
    return { exists: false, size: 0 };
  }
}
