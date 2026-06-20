import { Router } from "express";
import { createReadStream, existsSync } from "fs";
import { stat } from "fs/promises";
import path from "path";
import multer from "multer";
import { db, serversTable, installedModsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import {
  CreateServerBody,
  UpdateServerBody,
  GetServerParams,
  UpdateServerParams,
  DeleteServerParams,
  GetServerBySlugParams,
  StartServerParams,
  StopServerParams,
  GetServerLogsParams,
  ListServerModsParams,
  InstallModParams,
  InstallModBody,
  UninstallModParams,
} from "@workspace/api-zod";
import * as serverProcess from "../lib/serverProcess.js";
import * as virtualFiles from "../lib/virtualFiles.js";
import { downloadServerJar, getJarInfo, modsDir, pluginsDir, serverDir } from "../lib/jarDownloader.js";
import { downloadModrinthMod, downloadCurseForgeMod, downloadHangarPlugin } from "../lib/modDownloader.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const router = Router();

const MODRINTH_BASE = "https://api.modrinth.com/v2";
const CURSE_BASE = "https://api.curse.tools/v1/cf";
const CURSE_LOADER_MAP: Record<string, number> = {
  forge: 1, fabric: 4, neoforge: 6, quilt: 5,
};

type ServerRow = typeof serversTable.$inferSelect;

async function getServerWithModCount(id: number): Promise<(ServerRow & { modCount: number }) | null> {
  const rows = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  const server = rows[0];
  if (!server) return null;
  const [modCountRow] = await db
    .select({ count: count() })
    .from(installedModsTable)
    .where(eq(installedModsTable.serverId, id));
  return { ...server, modCount: Number(modCountRow?.count ?? 0) };
}

function formatServer(server: ServerRow & { modCount: number }) {
  const status = serverProcess.getStatus(server.id);
  return {
    ...server,
    status: status !== "stopped" ? status : server.status,
    modCount: server.modCount,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
    description: server.description ?? null,
    loaderVersion: server.loaderVersion ?? null,
    port: server.port ?? null,
    motd: server.motd ?? null,
    serverProperties: server.serverProperties ?? null,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// GET /api/servers/stats/summary — must be before /:id
router.get("/stats/summary", async (req, res) => {
  try {
    const [totalRow] = await db.select({ count: count() }).from(serversTable);
    const [runningRow] = await db
      .select({ count: count() })
      .from(serversTable)
      .where(eq(serversTable.status, "running"));
    const [modsRow] = await db.select({ count: count() }).from(installedModsTable);

    const versionResult = await db
      .select({ gameVersion: serversTable.gameVersion, cnt: count() })
      .from(serversTable)
      .groupBy(serversTable.gameVersion)
      .orderBy(sql`count(*) desc`)
      .limit(1);

    res.json({
      totalServers: Number(totalRow?.count ?? 0),
      runningServers: Number(runningRow?.count ?? 0),
      totalMods: Number(modsRow?.count ?? 0),
      popularVersion: versionResult[0]?.gameVersion ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get summary" });
  }
});

// GET /api/servers/by-slug/:slug — must be before /:id
router.get("/by-slug/:slug", async (req, res) => {
  const parsed = GetServerBySlugParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid slug" }); return; }
  try {
    const rows = await db.select().from(serversTable).where(eq(serversTable.slug, parsed.data.slug)).limit(1);
    const server = rows[0];
    if (!server) { res.status(404).json({ error: "Server not found" }); return; }
    const result = await getServerWithModCount(server.id);
    if (!result) { res.status(404).json({ error: "Server not found" }); return; }
    res.json(formatServer(result));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get server" });
  }
});

// GET /api/servers
router.get("/", async (req, res) => {
  try {
    const servers = await db.select().from(serversTable).orderBy(serversTable.createdAt);
    const withCounts = await Promise.all(
      servers.map(async (s) => {
        const [modCountRow] = await db.select({ count: count() }).from(installedModsTable).where(eq(installedModsTable.serverId, s.id));
        return formatServer({ ...s, modCount: Number(modCountRow?.count ?? 0) });
      })
    );
    res.json(withCounts);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list servers" });
  }
});

// POST /api/servers
router.post("/", async (req, res) => {
  const parsed = CreateServerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { name, slug, gameVersion, serverType, loaderVersion, maxPlayers, motd, memory } = parsed.data;
  const existing = await db.select().from(serversTable).where(eq(serversTable.slug, slug)).limit(1);
  if (existing[0]) { res.status(409).json({ error: "Slug already taken" }); return; }
  try {
    const [server] = await db.insert(serversTable).values({
      name, slug, gameVersion, serverType,
      loaderVersion: loaderVersion ?? null,
      maxPlayers: maxPlayers ?? 20,
      motd: motd ?? null,
      memory: memory ?? 2048,
      status: "stopped",
      onlinePlayers: 0,
      jarDownloadStatus: "pending",
    }).returning();
    res.status(201).json(formatServer({ ...server, modCount: 0 }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create server" });
  }
});

// GET /api/servers/:id
router.get("/:id", async (req, res) => {
  const parsed = GetServerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await getServerWithModCount(parsed.data.id);
    if (!result) { res.status(404).json({ error: "Server not found" }); return; }
    res.json(formatServer(result));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get server" });
  }
});

// PATCH /api/servers/:id
router.patch("/:id", async (req, res) => {
  const params = UpdateServerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateServerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    const [updated] = await db
      .update(serversTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(serversTable.id, params.data.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Server not found" }); return; }
    const result = await getServerWithModCount(updated.id);
    if (!result) { res.status(404).json({ error: "Server not found" }); return; }
    res.json(formatServer(result));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update server" });
  }
});

// DELETE /api/servers/:id
router.delete("/:id", async (req, res) => {
  const parsed = DeleteServerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    serverProcess.stopServer(parsed.data.id);
    const [deleted] = await db.delete(serversTable).where(eq(serversTable.id, parsed.data.id)).returning();
    if (!deleted) { res.status(404).json({ error: "Server not found" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete server" });
  }
});

// POST /api/servers/:id/start
router.post("/:id/start", async (req, res) => {
  const parsed = StartServerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const rows = await db.select().from(serversTable).where(eq(serversTable.id, parsed.data.id)).limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Server not found" }); return; }
    const server = rows[0];
    const props = server.serverProperties ? JSON.parse(server.serverProperties) as Record<string, unknown> : {};
    const cfg = {
      id: server.id,
      serverType: server.serverType,
      gameVersion: server.gameVersion,
      loaderVersion: server.loaderVersion,
      memory: server.memory,
      maxPlayers: server.maxPlayers,
      motd: server.motd,
      difficulty: (props.difficulty as string) ?? "easy",
      gamemode: (props.gamemode as string) ?? "survival",
    };

    const jarInfo = await getJarInfo(server.id);

    if (!jarInfo.exists) {
      serverProcess.initDownloading(server.id);
      serverProcess.appendLog(server.id, `[${new Date().toISOString().replace("T", " ").replace("Z", "")}] [main/INFO]: server.jar not found — downloading ${server.serverType} ${server.gameVersion}...`);

      await db.update(serversTable)
        .set({ status: "starting", jarDownloadStatus: "downloading", port: 25565, updatedAt: new Date() })
        .where(eq(serversTable.id, parsed.data.id));

      let lastReportedMB = 0;
      downloadServerJar(
        server.id,
        server.serverType,
        server.gameVersion,
        server.loaderVersion,
        (bytes) => {
          const mb = Math.floor(bytes / (1024 * 1024));
          if (mb > lastReportedMB) {
            lastReportedMB = mb;
            serverProcess.appendLog(server.id, `[${new Date().toISOString().replace("T", " ").replace("Z", "")}] [main/INFO]: Downloading server.jar... ${formatBytes(bytes)}`);
          }
        }
      ).then(async (result) => {
        serverProcess.appendLog(server.id, `[${new Date().toISOString().replace("T", " ").replace("Z", "")}] [main/INFO]: Download complete — ${formatBytes(result.size)}`);
        await db.update(serversTable)
          .set({ jarDownloadStatus: "ready", updatedAt: new Date() })
          .where(eq(serversTable.id, server.id));
        await serverProcess.startServer(server.id, cfg);
        await db.update(serversTable)
          .set({ status: "running", updatedAt: new Date() })
          .where(eq(serversTable.id, server.id));
      }).catch(async (err) => {
        serverProcess.markError(server.id, `Failed to download server.jar: ${String(err)}`);
        await db.update(serversTable)
          .set({ status: "stopped", jarDownloadStatus: "error", port: null, updatedAt: new Date() })
          .where(eq(serversTable.id, server.id));
        req.log.error(err, "JAR download failed");
      });
    } else {
      await serverProcess.startServer(parsed.data.id, cfg);
      await db.update(serversTable)
        .set({ status: "starting", port: 25565, updatedAt: new Date() })
        .where(eq(serversTable.id, parsed.data.id));
    }

    const result = await getServerWithModCount(parsed.data.id);
    if (!result) { res.status(404).json({ error: "Server not found" }); return; }
    res.json(formatServer(result));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to start server" });
  }
});

// POST /api/servers/:id/stop
router.post("/:id/stop", async (req, res) => {
  const parsed = StopServerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const rows = await db.select().from(serversTable).where(eq(serversTable.id, parsed.data.id)).limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Server not found" }); return; }

    serverProcess.stopServer(parsed.data.id);
    await db.update(serversTable)
      .set({ status: "stopping", onlinePlayers: 0, updatedAt: new Date() })
      .where(eq(serversTable.id, parsed.data.id));

    setTimeout(async () => {
      await db.update(serversTable)
        .set({ status: "stopped", port: null, onlinePlayers: 0, updatedAt: new Date() })
        .where(eq(serversTable.id, parsed.data.id));
    }, 2000);

    const result = await getServerWithModCount(parsed.data.id);
    if (!result) { res.status(404).json({ error: "Server not found" }); return; }
    res.json(formatServer(result));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to stop server" });
  }
});

// GET /api/servers/:id/logs
router.get("/:id/logs", async (req, res) => {
  const parsed = GetServerLogsParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const rows = await db.select().from(serversTable).where(eq(serversTable.id, parsed.data.id)).limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Server not found" }); return; }
    const lines = serverProcess.getLogs(parsed.data.id);
    res.json({ serverId: parsed.data.id, lines });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get logs" });
  }
});

// GET /api/servers/:id/mods/updates — must be before /:id/mods
router.get("/:id/mods/updates", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const server = (await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1))[0];
    if (!server) { res.status(404).json({ error: "Server not found" }); return; }
    const mods = await db.select().from(installedModsTable).where(eq(installedModsTable.serverId, id));
    const loader = server.serverType !== "vanilla" ? server.serverType : undefined;

    const results = await Promise.all(
      mods.filter((m) => m.source !== "upload").map(async (mod) => {
        try {
          if (mod.source === "modrinth") {
            const params = new URLSearchParams();
            if (loader) params.set("loaders", JSON.stringify([loader]));
            if (server.gameVersion) params.set("game_versions", JSON.stringify([server.gameVersion]));
            const r = await fetch(`${MODRINTH_BASE}/project/${mod.modId}/version?${params}`);
            if (!r.ok) return { modId: mod.modId, installedVersion: mod.modVersion, latestVersion: null, hasUpdate: false };
            const versions = (await r.json()) as Array<{ version_number: string; files: Array<{ filename: string; primary: boolean }> }>;
            const latest = versions[0];
            if (!latest) return { modId: mod.modId, installedVersion: mod.modVersion, latestVersion: null, hasUpdate: false };
            const latestFile = latest.files.find((f) => f.primary)?.filename ?? latest.files[0]?.filename ?? latest.version_number;
            const hasUpdate = latestFile !== mod.modVersion && latest.version_number !== mod.modVersion;
            return { modId: mod.modId, installedVersion: mod.modVersion, latestVersion: latestFile, hasUpdate };
          } else if (mod.source === "curseforge") {
            const params = new URLSearchParams({ pageSize: "1" });
            if (server.gameVersion) params.set("gameVersion", server.gameVersion);
            if (loader && CURSE_LOADER_MAP[loader]) params.set("modLoaderType", String(CURSE_LOADER_MAP[loader]));
            const r = await fetch(`${CURSE_BASE}/mods/${mod.modId}/files?${params}`);
            if (!r.ok) return { modId: mod.modId, installedVersion: mod.modVersion, latestVersion: null, hasUpdate: false };
            const d = (await r.json()) as { data: Array<{ fileName: string }> };
            const latest = d.data?.[0];
            if (!latest) return { modId: mod.modId, installedVersion: mod.modVersion, latestVersion: null, hasUpdate: false };
            const hasUpdate = latest.fileName !== mod.modVersion;
            return { modId: mod.modId, installedVersion: mod.modVersion, latestVersion: latest.fileName, hasUpdate };
          }
        } catch {
          // ignore per-mod errors
        }
        return { modId: mod.modId, installedVersion: mod.modVersion, latestVersion: null, hasUpdate: false };
      })
    );

    res.json(results);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to check updates" });
  }
});

// GET /api/servers/:id/mods
router.get("/:id/mods", async (req, res) => {
  const parsed = ListServerModsParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const mods = await db.select().from(installedModsTable).where(eq(installedModsTable.serverId, parsed.data.id)).orderBy(installedModsTable.installedAt);
    res.json(mods.map((m) => ({ ...m, iconUrl: m.iconUrl ?? null, installedAt: m.installedAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list mods" });
  }
});

// POST /api/servers/:id/mods
router.post("/:id/mods", async (req, res) => {
  const params = InstallModParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = InstallModBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid mod data" }); return; }
  try {
    const server = (await db.select().from(serversTable).where(eq(serversTable.id, params.data.id)).limit(1))[0];
    if (!server) { res.status(404).json({ error: "Server not found" }); return; }

    const isPlugin = body.data.category === "plugin";

    const [mod] = await db.insert(installedModsTable).values({
      serverId: params.data.id,
      modId: body.data.modId,
      modName: body.data.modName,
      modVersion: body.data.modVersion,
      source: body.data.source,
      iconUrl: body.data.iconUrl ?? null,
      downloadStatus: "downloading",
      category: isPlugin ? "plugin" : "mod",
    }).returning();

    res.status(201).json({ ...mod, iconUrl: mod.iconUrl ?? null, installedAt: mod.installedAt.toISOString() });

    const loader = server.serverType !== "vanilla" ? server.serverType : undefined;

    const handleResult = async (promise: Promise<{ filePath: string; fileSize: number; downloadUrl: string; filename: string }>) => {
      promise
        .then(async (result) => {
          await db.update(installedModsTable)
            .set({
              filePath: result.filePath,
              fileSize: result.fileSize,
              downloadUrl: result.downloadUrl,
              modVersion: result.filename,
              downloadStatus: "ready",
            })
            .where(eq(installedModsTable.id, mod.id));
        })
        .catch(async (err) => {
          await db.update(installedModsTable)
            .set({ downloadStatus: "error" })
            .where(eq(installedModsTable.id, mod.id));
          req.log.error(err, "Mod/plugin download failed");
        });
    };

    if (body.data.source === "modrinth") {
      void handleResult(downloadModrinthMod(params.data.id, body.data.modId, server.gameVersion, isPlugin ? undefined : loader));
    } else if (body.data.source === "curseforge") {
      void handleResult(downloadCurseForgeMod(params.data.id, body.data.modId, server.gameVersion, loader));
    } else if (body.data.source === "hangar") {
      void handleResult(downloadHangarPlugin(params.data.id, body.data.modId));
    } else {
      await db.update(installedModsTable)
        .set({ downloadStatus: "ready" })
        .where(eq(installedModsTable.id, mod.id));
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to install mod" });
  }
});

// POST /api/servers/:id/files (multipart upload)
router.post("/:id/files", upload.single("file"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }
  const { originalname, buffer, size } = req.file;
  const modName = originalname.replace(/\.(jar|zip)$/i, "");
  try {
    const rows = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Server not found" }); return; }

    const { mkdirSync, writeFileSync } = await import("fs");
    const modsDirPath = modsDir(id);
    mkdirSync(modsDirPath, { recursive: true });
    const destPath = path.join(modsDirPath, originalname);
    writeFileSync(destPath, buffer);

    const [mod] = await db.insert(installedModsTable).values({
      serverId: id,
      modId: `upload-${Date.now()}`,
      modName,
      modVersion: originalname,
      source: "upload",
      iconUrl: null,
      filePath: destPath,
      fileSize: size,
      downloadStatus: "ready",
    }).returning();
    res.status(201).json({ ...mod, iconUrl: mod.iconUrl ?? null, installedAt: mod.installedAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// GET /api/servers/:id/filemanager — returns virtual file tree
router.get("/:id/filemanager", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const server = (await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1))[0];
    if (!server) { res.status(404).json({ error: "Server not found" }); return; }
    const mods = await db.select().from(installedModsTable).where(eq(installedModsTable.serverId, id));

    const jarInfo = await getJarInfo(id);
    const customVirtualFiles = virtualFiles.listCustomFiles(id);

    const files = [
      {
        name: "server.jar",
        path: "server.jar",
        type: "file",
        size: jarInfo.exists ? jarInfo.size : 0,
        editable: false,
        deletable: false,
        downloadable: jarInfo.exists,
        downloadStatus: server.jarDownloadStatus,
      },
      { name: "eula.txt", path: "eula.txt", type: "file", size: 9, editable: true, deletable: false },
      { name: "server.properties", path: "server.properties", type: "file", size: (server.serverProperties ?? "").length || 512, editable: true, deletable: false },
      { name: "ops.json", path: "ops.json", type: "file", size: 2, editable: true, deletable: false },
      { name: "whitelist.json", path: "whitelist.json", type: "file", size: 2, editable: true, deletable: false },
      { name: "banned-players.json", path: "banned-players.json", type: "file", size: 2, editable: true, deletable: false },
      { name: "banned-ips.json", path: "banned-ips.json", type: "file", size: 2, editable: true, deletable: false },
      { name: "mods", path: "mods", type: "dir", deletable: false },
      ...mods.map((m) => {
        const jarName = m.modVersion.endsWith(".jar") ? m.modVersion : `${m.modName.replace(/\s+/g, "-")}.jar`;
        return {
          name: jarName,
          path: `mods/${jarName}`,
          type: "file",
          size: m.fileSize ?? 0,
          editable: false,
          deletable: true,
          downloadable: m.downloadStatus === "ready" && !!m.filePath,
          downloadStatus: m.downloadStatus,
          modId: m.id,
        };
      }),
      ...customVirtualFiles.filter((f) => !f.path.startsWith("mods/")).map((f) => ({
        ...f, type: "file", editable: true, deletable: true,
      })),
      { name: "world", path: "world", type: "dir", deletable: false },
      { name: "logs", path: "logs", type: "dir", deletable: false },
      { name: "logs/latest.log", path: "logs/latest.log", type: "file", size: 1024, editable: false, deletable: false },
      { name: "config", path: "config", type: "dir", deletable: false },
    ];

    res.json({ files });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list files" });
  }
});

// GET /api/servers/:id/filemanager/content?path=...
router.get("/:id/filemanager/content", async (req, res) => {
  const id = Number(req.params.id);
  const filePath = req.query["path"] as string | undefined;
  if (!Number.isFinite(id) || !filePath) { res.status(400).json({ error: "Invalid params" }); return; }
  try {
    const server = (await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1))[0];
    if (!server) { res.status(404).json({ error: "Server not found" }); return; }

    let content: string | null = null;

    if (filePath === "server.properties") {
      content = server.serverProperties ?? "# server.properties\ndifficulty=easy\ngamemode=survival\nmax-players=20";
    } else if (filePath === "server.jar") {
      content = null;
    } else if (filePath === "logs/latest.log") {
      const lines = serverProcess.getLogs(id);
      content = lines.join("\n");
    } else {
      content = virtualFiles.getFile(id, filePath);
    }

    if (content === null) {
      res.status(404).json({ error: "File not found or binary" });
      return;
    }
    res.json({ path: filePath, content });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to read file" });
  }
});

// GET /api/servers/:id/filemanager/download?path=...
router.get("/:id/filemanager/download", async (req, res) => {
  const id = Number(req.params.id);
  const filePath = req.query["path"] as string | undefined;
  if (!Number.isFinite(id) || !filePath) { res.status(400).json({ error: "Invalid params" }); return; }

  try {
    const server = (await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1))[0];
    if (!server) { res.status(404).json({ error: "Server not found" }); return; }

    let diskPath: string | null = null;

    if (filePath === "server.jar") {
      const info = await getJarInfo(id);
      if (!info.exists) { res.status(404).json({ error: "server.jar not yet downloaded" }); return; }
      diskPath = path.join(serverDir(id), "server.jar");
    } else if (filePath.startsWith("mods/")) {
      const jarName = filePath.slice("mods/".length);
      const mods = await db.select().from(installedModsTable).where(eq(installedModsTable.serverId, id));
      const mod = mods.find((m) => {
        const name = m.modVersion.endsWith(".jar") ? m.modVersion : `${m.modName.replace(/\s+/g, "-")}.jar`;
        return name === jarName;
      });
      if (!mod?.filePath) { res.status(404).json({ error: "File not found or not yet downloaded" }); return; }
      diskPath = mod.filePath;
    }

    if (!diskPath || !existsSync(diskPath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }

    const fileStat = await stat(diskPath);
    const filename = path.basename(diskPath);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/java-archive");
    res.setHeader("Content-Length", String(fileStat.size));
    createReadStream(diskPath).pipe(res);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to download file" });
  }
});

// PUT /api/servers/:id/filemanager/content?path=...
router.put("/:id/filemanager/content", async (req, res) => {
  const id = Number(req.params.id);
  const filePath = req.query["path"] as string | undefined;
  if (!Number.isFinite(id) || !filePath) { res.status(400).json({ error: "Invalid params" }); return; }
  if (!virtualFiles.EDITABLE_PATHS.has(filePath)) { res.status(403).json({ error: "File is read-only" }); return; }
  const { content } = req.body as { content?: string };
  if (typeof content !== "string") { res.status(400).json({ error: "Missing content" }); return; }
  try {
    if (filePath === "server.properties") {
      await db.update(serversTable).set({ serverProperties: content, updatedAt: new Date() }).where(eq(serversTable.id, id));
    } else {
      virtualFiles.setFile(id, filePath, content);
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save file" });
  }
});

// DELETE /api/servers/:id/filemanager?path=...
router.delete("/:id/filemanager", async (req, res) => {
  const id = Number(req.params.id);
  const filePath = req.query["path"] as string | undefined;
  if (!Number.isFinite(id) || !filePath) { res.status(400).json({ error: "Invalid params" }); return; }
  if (filePath.startsWith("mods/")) {
    const jarName = filePath.slice("mods/".length);
    const mods = await db.select().from(installedModsTable).where(eq(installedModsTable.serverId, id));
    const mod = mods.find((m) => {
      const name = m.modVersion.endsWith(".jar") ? m.modVersion : `${m.modName.replace(/\s+/g, "-")}.jar`;
      return name === jarName;
    });
    if (!mod) { res.status(404).json({ error: "Mod not found" }); return; }
    if (mod.filePath && existsSync(mod.filePath)) {
      try { (await import("fs")).unlinkSync(mod.filePath); } catch { /* ignore */ }
    }
    await db.delete(installedModsTable).where(eq(installedModsTable.id, mod.id));
    res.json({ ok: true });
    return;
  }
  const ok = virtualFiles.deleteFile(id, filePath);
  if (!ok) { res.status(403).json({ error: "File is protected and cannot be deleted" }); return; }
  res.json({ ok: true });
});

// POST /api/servers/:id/filemanager?path=... (create new file)
router.post("/:id/filemanager", async (req, res) => {
  const id = Number(req.params.id);
  const filePath = req.query["path"] as string | undefined;
  if (!Number.isFinite(id) || !filePath) { res.status(400).json({ error: "Invalid params" }); return; }
  const { content = "" } = req.body as { content?: string };
  try {
    virtualFiles.createFile(id, filePath, content);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create file" });
  }
});

// PATCH /api/servers/:id/filemanager/rename
router.patch("/:id/filemanager/rename", async (req, res) => {
  const id = Number(req.params.id);
  const { oldPath, newPath } = req.body as { oldPath?: string; newPath?: string };
  if (!Number.isFinite(id) || !oldPath || !newPath) { res.status(400).json({ error: "Invalid params" }); return; }
  const ok = virtualFiles.renameFile(id, oldPath, newPath);
  if (!ok) { res.status(403).json({ error: "Cannot rename this file" }); return; }
  res.json({ ok: true });
});

// POST /api/servers/:id/command
router.post("/:id/command", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { command } = req.body as { command?: string };
  if (!command || typeof command !== "string" || !command.trim()) {
    res.status(400).json({ error: "Missing command" }); return;
  }
  const status = serverProcess.getStatus(id);
  if (status !== "running") { res.status(409).json({ error: "Server is not running" }); return; }
  serverProcess.sendCommand(id, command.trim());
  res.json({ ok: true });
});

// DELETE /api/servers/:id/mods/:modId
router.delete("/:id/mods/:modId", async (req, res) => {
  const params = UninstallModParams.safeParse({
    id: Number(req.params.id),
    modId: Number(req.params.modId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  try {
    const mod = (await db.select().from(installedModsTable).where(eq(installedModsTable.id, params.data.modId)).limit(1))[0];
    if (!mod) { res.status(404).json({ error: "Mod not found" }); return; }
    if (mod.filePath && existsSync(mod.filePath)) {
      try { (await import("fs")).unlinkSync(mod.filePath); } catch { /* ignore */ }
    }
    await db.delete(installedModsTable).where(eq(installedModsTable.id, params.data.modId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to uninstall mod" });
  }
});

export default router;
