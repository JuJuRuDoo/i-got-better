import { db, serverFilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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

export const EDITABLE_PATHS = new Set([
  "eula.txt",
  "server.properties",
  "ops.json",
  "whitelist.json",
  "banned-players.json",
  "banned-ips.json",
]);

export async function getFile(serverId: number, filePath: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(serverFilesTable)
    .where(and(eq(serverFilesTable.serverId, serverId), eq(serverFilesTable.path, filePath)))
    .limit(1);
  if (rows[0]) return rows[0].content;
  if (filePath in DEFAULTS) return DEFAULTS[filePath];
  return null;
}

export async function setFile(serverId: number, filePath: string, content: string): Promise<void> {
  const existing = await db
    .select({ id: serverFilesTable.id })
    .from(serverFilesTable)
    .where(and(eq(serverFilesTable.serverId, serverId), eq(serverFilesTable.path, filePath)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(serverFilesTable)
      .set({ content, updatedAt: new Date() })
      .where(eq(serverFilesTable.id, existing[0].id));
  } else {
    await db.insert(serverFilesTable).values({ serverId, path: filePath, content });
  }
}

export async function deleteFile(serverId: number, filePath: string): Promise<boolean> {
  if (PROTECTED.has(filePath)) return false;
  const rows = await db
    .select({ id: serverFilesTable.id })
    .from(serverFilesTable)
    .where(and(eq(serverFilesTable.serverId, serverId), eq(serverFilesTable.path, filePath)))
    .limit(1);
  if (!rows[0]) return false;
  await db.delete(serverFilesTable).where(eq(serverFilesTable.id, rows[0].id));
  return true;
}

export async function createFile(serverId: number, filePath: string, content: string): Promise<void> {
  const existing = await db
    .select({ id: serverFilesTable.id })
    .from(serverFilesTable)
    .where(and(eq(serverFilesTable.serverId, serverId), eq(serverFilesTable.path, filePath)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(serverFilesTable)
      .set({ content, updatedAt: new Date() })
      .where(eq(serverFilesTable.id, existing[0].id));
  } else {
    await db.insert(serverFilesTable).values({ serverId, path: filePath, content });
  }
}

export async function renameFile(serverId: number, oldPath: string, newPath: string): Promise<boolean> {
  if (PROTECTED.has(oldPath)) return false;
  const rows = await db
    .select()
    .from(serverFilesTable)
    .where(and(eq(serverFilesTable.serverId, serverId), eq(serverFilesTable.path, oldPath)))
    .limit(1);
  if (!rows[0]) return false;
  await db
    .update(serverFilesTable)
    .set({ path: newPath, updatedAt: new Date() })
    .where(eq(serverFilesTable.id, rows[0].id));
  return true;
}

export async function listCustomFiles(serverId: number): Promise<Array<{ name: string; path: string; size: number }>> {
  const defaultPaths = new Set([...Object.keys(DEFAULTS), ...PROTECTED]);
  const rows = await db
    .select()
    .from(serverFilesTable)
    .where(eq(serverFilesTable.serverId, serverId));
  return rows
    .filter((r) => !defaultPaths.has(r.path))
    .map((r) => ({
      name: r.path.split("/").pop() ?? r.path,
      path: r.path,
      size: r.content.length,
    }));
}
