import { Router } from "express";

const router = Router();
const MODRINTH_BASE = "https://api.modrinth.com/v2";
const CURSE_BASE = "https://api.curse.tools/v1/cf";

const CURSE_LOADER_MAP: Record<string, number> = {
  forge: 1,
  fabric: 4,
  neoforge: 6,
  quilt: 5,
};
const CURSE_LOADER_REVERSE: Record<number, string> = {
  1: "forge",
  4: "fabric",
  6: "neoforge",
  5: "quilt",
};

interface ModrinthVersion {
  id: string;
  version_number: string;
  name: string;
  changelog: string;
  date_published: string;
  game_versions: string[];
  loaders: string[];
  files: Array<{ url: string; filename: string; primary: boolean }>;
}

// GET /api/mods/modrinth/:id  or  /api/mods/curseforge/:id
router.get("/:source/:modId", async (req, res) => {
  const { source, modId } = req.params;

  try {
    if (source === "modrinth") {
      const r = await fetch(`${MODRINTH_BASE}/project/${modId}`);
      if (!r.ok) { res.status(404).json({ error: "Mod not found" }); return; }
      const d = (await r.json()) as {
        id: string; title: string; description: string; body: string;
        author: string; icon_url: string | null; downloads: number;
        categories: string[]; loaders: string[]; game_versions: string[];
        source_url: string | null; wiki_url: string | null;
        discord_url: string | null; donation_urls: unknown[];
        project_type: string; versions: string[];
      };
      res.json({
        id: d.id,
        name: d.title,
        description: d.description,
        body: d.body,
        author: d.author,
        iconUrl: d.icon_url,
        downloads: d.downloads,
        categories: d.categories,
        loaders: d.loaders,
        gameVersions: d.game_versions,
        websiteUrl: `https://modrinth.com/mod/${modId}`,
        source: "modrinth",
      });
    } else if (source === "curseforge") {
      const r = await fetch(`${CURSE_BASE}/mods/${modId}`);
      if (!r.ok) { res.status(404).json({ error: "Mod not found" }); return; }
      const d = (await r.json()) as {
        data: {
          id: number; name: string; summary: string;
          authors: Array<{ name: string }>;
          logo: { url: string } | null;
          downloadCount: number;
          categories: Array<{ name: string }>;
          links: { websiteUrl: string } | null;
          latestFilesIndexes: Array<{ gameVersion: string; modLoader: number; filename: string }>;
        }
      };
      const m = d.data;
      const loaderNums = [...new Set(m.latestFilesIndexes.map((f) => f.modLoader))];
      const loaders = loaderNums.map((n) => CURSE_LOADER_REVERSE[n]).filter(Boolean);
      const gameVersions = [...new Set(m.latestFilesIndexes.map((f) => f.gameVersion))];
      res.json({
        id: String(m.id),
        name: m.name,
        description: m.summary,
        body: m.summary,
        author: m.authors[0]?.name ?? "Unknown",
        iconUrl: m.logo?.url ?? null,
        downloads: m.downloadCount,
        categories: m.categories.map((c) => c.name),
        loaders,
        gameVersions,
        websiteUrl: m.links?.websiteUrl ?? null,
        source: "curseforge",
      });
    } else {
      res.status(400).json({ error: "Invalid source" });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch mod details" });
  }
});

// GET /api/mods/modrinth/:id/versions?loader=fabric&gameVersion=1.20.1
router.get("/:source/:modId/versions", async (req, res) => {
  const { source, modId } = req.params;
  const { loader, gameVersion } = req.query as { loader?: string; gameVersion?: string };

  try {
    if (source === "modrinth") {
      const params = new URLSearchParams();
      if (loader) params.set("loaders", JSON.stringify([loader]));
      if (gameVersion) params.set("game_versions", JSON.stringify([gameVersion]));
      const r = await fetch(`${MODRINTH_BASE}/project/${modId}/version?${params}`);
      if (!r.ok) { res.json([]); return; }
      const versions = (await r.json()) as ModrinthVersion[];
      res.json(
        versions.slice(0, 20).map((v) => ({
          id: v.id,
          versionNumber: v.version_number,
          name: v.name,
          changelog: v.changelog,
          datePublished: v.date_published,
          gameVersions: v.game_versions,
          loaders: v.loaders,
          downloadUrl: v.files.find((f) => f.primary)?.url ?? v.files[0]?.url ?? null,
          fileName: v.files.find((f) => f.primary)?.filename ?? v.files[0]?.filename ?? v.version_number,
        }))
      );
    } else if (source === "curseforge") {
      const params = new URLSearchParams({ pageSize: "20" });
      if (gameVersion) params.set("gameVersion", gameVersion);
      if (loader && CURSE_LOADER_MAP[loader]) {
        params.set("modLoaderType", String(CURSE_LOADER_MAP[loader]));
      }
      const r = await fetch(`${CURSE_BASE}/mods/${modId}/files?${params}`);
      if (!r.ok) { res.json([]); return; }
      const d = (await r.json()) as {
        data: Array<{
          id: number; displayName: string; fileName: string;
          fileDate: string; gameVersions: string[];
          isAvailable: boolean;
        }>
      };
      res.json(
        (d.data ?? []).filter((f) => f.isAvailable).slice(0, 20).map((f) => ({
          id: String(f.id),
          versionNumber: f.fileName,
          name: f.displayName,
          changelog: null,
          datePublished: f.fileDate,
          gameVersions: f.gameVersions.filter((v) => v.match(/^\d+\.\d+/)),
          loaders: f.gameVersions.filter((v) => !v.match(/^\d+\.\d+/)).map((v) => v.toLowerCase()),
          downloadUrl: null,
          fileName: f.fileName,
        }))
      );
    } else {
      res.status(400).json({ error: "Invalid source" });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch mod versions" });
  }
});

// GET /api/mods/:source/:modId/bestVersion?loader=fabric&gameVersion=1.20.1
// Returns the best version string + filename for the given loader+gameVersion
router.get("/:source/:modId/bestVersion", async (req, res) => {
  const { source, modId } = req.params;
  const { loader, gameVersion } = req.query as { loader?: string; gameVersion?: string };

  try {
    if (source === "modrinth") {
      const params = new URLSearchParams();
      if (loader) params.set("loaders", JSON.stringify([loader]));
      if (gameVersion) params.set("game_versions", JSON.stringify([gameVersion]));
      const r = await fetch(`${MODRINTH_BASE}/project/${modId}/version?${params}`);
      if (!r.ok) { res.json(null); return; }
      const versions = (await r.json()) as ModrinthVersion[];
      const best = versions[0];
      if (!best) { res.json(null); return; }
      const file = best.files.find((f) => f.primary) ?? best.files[0];
      res.json({
        versionNumber: best.version_number,
        fileName: file?.filename ?? best.version_number,
        downloadUrl: file?.url ?? null,
        datePublished: best.date_published,
      });
    } else if (source === "curseforge") {
      const params = new URLSearchParams({ pageSize: "1" });
      if (gameVersion) params.set("gameVersion", gameVersion);
      if (loader && CURSE_LOADER_MAP[loader]) {
        params.set("modLoaderType", String(CURSE_LOADER_MAP[loader]));
      }
      const r = await fetch(`${CURSE_BASE}/mods/${modId}/files?${params}`);
      if (!r.ok) { res.json(null); return; }
      const d = (await r.json()) as {
        data: Array<{ id: number; displayName: string; fileName: string; fileDate: string }>
      };
      const best = d.data?.[0];
      if (!best) { res.json(null); return; }
      res.json({
        versionNumber: best.fileName,
        fileName: best.fileName,
        downloadUrl: null,
        datePublished: best.fileDate,
      });
    } else {
      res.status(400).json({ error: "Invalid source" });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to resolve version" });
  }
});

export default router;
