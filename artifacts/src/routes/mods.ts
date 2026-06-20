import { Router } from "express";
import { SearchModsQueryParams, GetFeaturedModsQueryParams } from "@workspace/api-zod";

const router = Router();

const CURSE_BASE = "https://api.curse.tools/v1/cf";
const MODRINTH_BASE = "https://api.modrinth.com/v2";

const CURSE_LOADER_MAP: Record<string, number> = {
  forge: 1,
  fabric: 4,
  neoforge: 6,
  quilt: 5,
};

interface CurseMod {
  id: number;
  name: string;
  summary: string;
  authors: Array<{ name: string }>;
  logo: { url: string } | null;
  downloadCount: number;
  latestFilesIndexes: Array<{ gameVersion: string; modLoader: number; filename: string }>;
  categories: Array<{ name: string }>;
  links: { websiteUrl: string } | null;
}

interface ModrinthMod {
  project_id: string;
  title: string;
  description: string;
  author: string;
  icon_url: string | null;
  downloads: number;
  versions: string[];
  loaders: string[];
  game_versions: string[];
  categories: string[];
}

type ModResult = {
  id: string;
  name: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloadCount: number;
  source: "curseforge" | "modrinth";
  latestVersion: string | null;
  loaders: string[];
  gameVersions: string[];
  categories: string[];
  websiteUrl: string | null;
};

function curseMod(mod: CurseMod, latestVersion: string | null): ModResult {
  const loaderNums = [...new Set(mod.latestFilesIndexes.map((f) => f.modLoader))];
  const loaders = loaderNums
    .map((n) => {
      const entry = Object.entries(CURSE_LOADER_MAP).find(([, v]) => v === n);
      return entry ? entry[0] : null;
    })
    .filter((x): x is string => x !== null);
  const gameVersions = [...new Set(mod.latestFilesIndexes.map((f) => f.gameVersion))];
  return {
    id: String(mod.id),
    name: mod.name,
    description: mod.summary,
    author: mod.authors[0]?.name ?? "Unknown",
    iconUrl: mod.logo?.url ?? null,
    downloadCount: mod.downloadCount,
    source: "curseforge",
    latestVersion,
    loaders,
    gameVersions,
    categories: mod.categories.map((c) => c.name),
    websiteUrl: mod.links?.websiteUrl ?? null,
  };
}

function modrinthMod(mod: ModrinthMod, latestVersion: string | null): ModResult {
  return {
    id: mod.project_id,
    name: mod.title,
    description: mod.description,
    author: mod.author,
    iconUrl: mod.icon_url ?? null,
    downloadCount: mod.downloads,
    source: "modrinth",
    latestVersion,
    loaders: mod.loaders,
    gameVersions: mod.game_versions,
    categories: mod.categories,
    websiteUrl: `https://modrinth.com/mod/${mod.project_id}`,
  };
}

function curseSortField(sort: string): string {
  switch (sort) {
    case "downloads": return "6";
    case "updated": return "3";
    default: return "2";
  }
}

function modrinthSortIndex(sort: string): string {
  switch (sort) {
    case "downloads": return "downloads";
    case "updated": return "updated";
    default: return "relevance";
  }
}

async function searchCurseForge(
  query: string,
  loader?: string,
  gameVersion?: string,
  limit = 20,
  sort = "relevance"
): Promise<ModResult[]> {
  try {
    const params = new URLSearchParams({
      gameId: "432",
      searchFilter: query,
      pageSize: String(Math.min(limit, 20)),
      sortField: curseSortField(sort),
    });
    if (loader && CURSE_LOADER_MAP[loader]) {
      params.set("modLoaderType", String(CURSE_LOADER_MAP[loader]));
    }
    if (gameVersion) params.set("gameVersion", gameVersion);

    const res = await fetch(`${CURSE_BASE}/mods/search?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { data: CurseMod[] };
    return (data.data ?? []).map((m) => curseMod(m, m.latestFilesIndexes[0]?.filename ?? null));
  } catch {
    return [];
  }
}

async function searchModrinth(
  query: string,
  loader?: string,
  gameVersion?: string,
  limit = 20,
  sort = "relevance"
): Promise<ModResult[]> {
  try {
    const facets: string[][] = [["project_type:mod"]];
    if (loader) facets.push([`categories:${loader}`]);
    if (gameVersion) facets.push([`versions:${gameVersion}`]);

    const params = new URLSearchParams({
      query,
      limit: String(Math.min(limit, 20)),
      facets: JSON.stringify(facets),
      index: modrinthSortIndex(sort),
    });

    const res = await fetch(`${MODRINTH_BASE}/search?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { hits: ModrinthMod[] };
    return (data.hits ?? []).map((m) => modrinthMod(m, m.versions[0] ?? null));
  } catch {
    return [];
  }
}

// GET /api/mods/search
router.get("/search", async (req, res) => {
  const parsed = SearchModsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing required query parameter" });
    return;
  }
  const { query, source, loader, gameVersion, limit } = parsed.data;
  const sort = (req.query.sort as string) ?? "relevance";
  const effectiveSource = source ?? "all";
  const effectiveLimit = limit ?? 20;

  try {
    let results: ModResult[] = [];

    if (effectiveSource === "curseforge") {
      results = await searchCurseForge(query, loader ?? undefined, gameVersion ?? undefined, effectiveLimit, sort);
    } else if (effectiveSource === "modrinth") {
      results = await searchModrinth(query, loader ?? undefined, gameVersion ?? undefined, effectiveLimit, sort);
    } else {
      const half = Math.ceil(effectiveLimit / 2);
      const [curse, modrinth] = await Promise.all([
        searchCurseForge(query, loader ?? undefined, gameVersion ?? undefined, half, sort),
        searchModrinth(query, loader ?? undefined, gameVersion ?? undefined, half, sort),
      ]);
      results = [...curse, ...modrinth];
    }

    res.json(results);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

// GET /api/mods/featured
router.get("/featured", async (req, res) => {
  const parsed = GetFeaturedModsQueryParams.safeParse(req.query);
  const loader = parsed.success ? (parsed.data.loader ?? undefined) : undefined;
  const gameVersion = parsed.success ? (parsed.data.gameVersion ?? undefined) : undefined;

  try {
    const [curse, modrinth] = await Promise.all([
      searchCurseForge("", loader, gameVersion, 6, "downloads"),
      searchModrinth("", loader, gameVersion, 6, "downloads"),
    ]);
    res.json([...curse, ...modrinth].slice(0, 12));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get featured mods" });
  }
});

export default router;
