import { createWriteStream, mkdirSync } from "fs";
import path from "path";
import { modsDir, ensureDirs } from "./jarDownloader.js";

async function streamToFile(url: string, dest: string): Promise<number> {
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

const MODRINTH_BASE = "https://api.modrinth.com/v2";
const CURSE_BASE = "https://api.curse.tools/v1/cf";

const CURSE_LOADER_MAP: Record<string, number> = {
  forge: 1,
  fabric: 4,
  neoforge: 6,
  quilt: 5,
};

export interface ModDownloadResult {
  filePath: string;
  filename: string;
  fileSize: number;
  downloadUrl: string;
}

export async function downloadModrinthMod(
  serverId: number,
  projectId: string,
  gameVersion?: string | null,
  loader?: string | null
): Promise<ModDownloadResult> {
  ensureDirs(serverId);

  const params = new URLSearchParams();
  if (gameVersion) params.set("game_versions", JSON.stringify([gameVersion]));
  if (loader) params.set("loaders", JSON.stringify([loader]));

  const res = await fetch(`${MODRINTH_BASE}/project/${projectId}/version?${params}`);
  if (!res.ok) throw new Error(`Modrinth API error ${res.status} for project ${projectId}`);

  const versions = (await res.json()) as Array<{
    version_number: string;
    files: Array<{ url: string; filename: string; primary: boolean; size: number }>;
  }>;

  const version = versions[0];
  if (!version) throw new Error(`No compatible Modrinth version found for ${projectId}`);

  const file = version.files.find((f) => f.primary) ?? version.files[0];
  if (!file) throw new Error(`No files in Modrinth version for ${projectId}`);

  const dest = path.join(modsDir(serverId), file.filename);
  const size = await streamToFile(file.url, dest);

  return { filePath: dest, filename: file.filename, fileSize: size, downloadUrl: file.url };
}

export async function downloadCurseForgeMod(
  serverId: number,
  modId: string,
  gameVersion?: string | null,
  loader?: string | null
): Promise<ModDownloadResult> {
  ensureDirs(serverId);

  const params = new URLSearchParams({ pageSize: "1" });
  if (gameVersion) params.set("gameVersion", gameVersion);
  if (loader && CURSE_LOADER_MAP[loader]) {
    params.set("modLoaderType", String(CURSE_LOADER_MAP[loader]));
  }

  const filesRes = await fetch(`${CURSE_BASE}/mods/${modId}/files?${params}`);
  if (!filesRes.ok) throw new Error(`CurseForge API error ${filesRes.status} for mod ${modId}`);

  const data = (await filesRes.json()) as {
    data: Array<{ id: number; fileName: string; downloadUrl: string | null; fileLength: number }>;
  };

  const file = data.data?.[0];
  if (!file) throw new Error(`No CurseForge files for mod ${modId}`);

  const fileId = file.id;
  const downloadUrl =
    file.downloadUrl ??
    `https://edge.forgecdn.net/files/${Math.floor(fileId / 1000)}/${fileId % 1000}/${file.fileName}`;

  const dest = path.join(modsDir(serverId), file.fileName);
  const size = await streamToFile(downloadUrl, dest);

  return { filePath: dest, filename: file.fileName, fileSize: size, downloadUrl };
}
