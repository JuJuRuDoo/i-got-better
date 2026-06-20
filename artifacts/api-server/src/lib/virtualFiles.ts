const store = new Map<string, string>();
const deletedPaths = new Set<string>();
const customFiles = new Map<string, { name: string; size: number }>();

function key(serverId: number, path: string) {
  return `${serverId}::${path}`;
}

const DEFAULTS: Record<string, string> = {
  "eula.txt": "eula=true",
  "ops.json": "[]",
  "whitelist.json": "[]",
  "banned-players.json": "[]",
  "banned-ips.json": "[]",
};

const PROTECTED = new Set([
  "server.jar", "eula.txt", "server.properties",
  "ops.json", "whitelist.json", "banned-players.json", "banned-ips.json",
  "mods", "world", "logs", "config", "logs/latest.log",
]);

export function getFile(serverId: number, path: string): string | null {
  const k = key(serverId, path);
  if (store.has(k)) return store.get(k)!;
  if (path in DEFAULTS) return DEFAULTS[path];
  return null;
}

export function setFile(serverId: number, path: string, content: string) {
  store.set(key(serverId, path), content);
}

export function deleteFile(serverId: number, path: string): boolean {
  if (PROTECTED.has(path)) return false;
  const k = key(serverId, path);
  store.delete(k);
  deletedPaths.add(k);
  customFiles.delete(k);
  return true;
}

export function createFile(serverId: number, path: string, content: string, size?: number) {
  const k = key(serverId, path);
  store.set(k, content);
  const name = path.split("/").pop() ?? path;
  customFiles.set(k, { name, size: size ?? content.length });
}

export function renameFile(serverId: number, oldPath: string, newPath: string): boolean {
  if (PROTECTED.has(oldPath)) return false;
  const oldKey = key(serverId, oldPath);
  const content = store.get(oldKey);
  if (content === undefined) return false;
  store.delete(oldKey);
  const newKey = key(serverId, newPath);
  store.set(newKey, content);
  const meta = customFiles.get(oldKey);
  if (meta) {
    customFiles.delete(oldKey);
    customFiles.set(newKey, { ...meta, name: newPath.split("/").pop() ?? newPath });
  }
  return true;
}

export function listCustomFiles(serverId: number): Array<{ name: string; path: string; size: number }> {
  const results: Array<{ name: string; path: string; size: number }> = [];
  for (const [k, meta] of customFiles.entries()) {
    if (k.startsWith(`${serverId}::`)) {
      const path = k.slice(`${serverId}::`.length);
      results.push({ name: meta.name, path, size: meta.size });
    }
  }
  return results;
}

export const EDITABLE_PATHS = new Set([
  "eula.txt",
  "server.properties",
  "ops.json",
  "whitelist.json",
  "banned-players.json",
  "banned-ips.json",
]);
