import { Router } from "express";
import { SearchPluginsQueryParams } from "@workspace/api-zod";

const router = Router();
const MODRINTH_BASE = "https://api.modrinth.com/v2";
const HANGAR_BASE = "https://hangar.papermc.io/api/v1";

interface HangarProject {
  namespace: { owner: string; slug: string };
  name: string;
  description: string;
  stats: { downloads: number };
  avatarUrl: string | null;
  lastUpdated: string;
}

interface ModrinthHit {
  project_id: string;
  title: string;
  description: string;
  author: string;
  icon_url: string | null;
  downloads: number;
  loaders: string[];
  game_versions: string[];
  categories: string[];
  slug: string;
}

type PluginResult = {
  id: string;
  name: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloadCount: number;
  source: "modrinth" | "hangar";
  latestVersion: string | null;
  loaders: string[];
  gameVersions: string[];
  categories: string[];
  websiteUrl: string | null;
};

function fromModrinth(h: ModrinthHit): PluginResult {
  return {
    id: h.project_id,
    name: h.title,
    description: h.description,
    author: h.author,
    iconUrl: h.icon_url,
    downloadCount: h.downloads,
    source: "modrinth",
    latestVersion: null,
    loaders: h.loaders ?? [],
    gameVersions: h.game_versions ?? [],
    categories: h.categories ?? [],
    websiteUrl: `https://modrinth.com/plugin/${h.slug}`,
  };
}

function fromHangar(p: HangarProject): PluginResult {
  return {
    id: `${p.namespace.owner}:${p.namespace.slug}`,
    name: p.name,
    description: p.description,
    author: p.namespace.owner,
    iconUrl: p.avatarUrl,
    downloadCount: p.stats.downloads,
    source: "hangar",
    latestVersion: null,
    loaders: ["paper", "purpur"],
    gameVersions: [],
    categories: [],
    websiteUrl: `https://hangar.papermc.io/${p.namespace.owner}/${p.namespace.slug}`,
  };
}

async function searchModrinthPlugins(query: string, limit: number): Promise<PluginResult[]> {
  try {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      facets: JSON.stringify([["project_type:plugin"]]),
      index: "downloads",
    });
    const res = await fetch(`${MODRINTH_BASE}/search?${params}`, {
      headers: { "User-Agent": "CraftHost/1.0" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { hits: ModrinthHit[] };
    return (data.hits ?? []).map(fromModrinth);
  } catch {
    return [];
  }
}

async function searchHangarPlugins(query: string, limit: number): Promise<PluginResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      platform: "PAPER",
      sort: "DOWNLOADS",
    });
    const res = await fetch(`${HANGAR_BASE}/projects?${params}`, {
      headers: { "User-Agent": "CraftHost/1.0" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { result: HangarProject[] };
    return (data.result ?? []).map(fromHangar);
  } catch {
    return [];
  }
}

router.get("/search", async (req, res) => {
  const parsed = SearchPluginsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid params" }); return; }

  const { query = "optimization", source = "modrinth", limit = 20 } = parsed.data;

  try {
    let results: PluginResult[] = [];
    if (source === "modrinth") {
      results = await searchModrinthPlugins(query, limit);
    } else if (source === "hangar") {
      results = await searchHangarPlugins(query, limit);
    } else {
      const [mr, hg] = await Promise.all([
        searchModrinthPlugins(query, Math.ceil(limit / 2)),
        searchHangarPlugins(query, Math.ceil(limit / 2)),
      ]);
      results = [...mr, ...hg];
    }
    res.json(results);
  } catch (err) {
    req.log.error(err, "Plugin search failed");
    res.status(500).json({ error: "Plugin search failed" });
  }
});

router.get("/featured", async (req, res) => {
  try {
    const [mr, hg] = await Promise.all([
      searchModrinthPlugins("optimization", 10),
      searchHangarPlugins("", 10),
    ]);
    res.json([...hg, ...mr]);
  } catch (err) {
    req.log.error(err, "Featured plugins failed");
    res.status(500).json({ error: "Failed to get featured plugins" });
  }
});

export default router;
