import { Router } from "express";
import { ListLoaderVersionsQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /api/versions/minecraft
router.get("/minecraft", async (req, res) => {
  try {
    const response = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
    if (!response.ok) throw new Error("Failed to fetch versions");
    const data = (await response.json()) as {
      versions: Array<{ id: string; type: string; releaseTime: string }>;
    };
    const versions = data.versions
      .filter((v) => v.type === "release" || v.type === "snapshot")
      .map((v) => ({
        id: v.id,
        type: v.type as "release" | "snapshot",
        releaseTime: v.releaseTime,
      }));
    res.json(versions);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch Minecraft versions" });
  }
});

// GET /api/versions/loaders
router.get("/loaders", async (req, res) => {
  const parsed = ListLoaderVersionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "loader and gameVersion are required" });
    return;
  }
  const { loader, gameVersion } = parsed.data;

  try {
    let versions: Array<{ id: string; stable: boolean; recommended: boolean }> = [];

    if (loader === "fabric") {
      const r = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`);
      if (r.ok) {
        const data = (await r.json()) as Array<{ loader: { version: string; stable: boolean } }>;
        versions = data.map((v, i) => ({
          id: v.loader.version,
          stable: v.loader.stable,
          recommended: i === 0,
        }));
      }
    } else if (loader === "forge") {
      const r = await fetch(
        "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
      );
      if (r.ok) {
        const data = (await r.json()) as { promos: Record<string, string> };
        const rec = data.promos[`${gameVersion}-recommended`];
        const lat = data.promos[`${gameVersion}-latest`];
        if (rec) versions.push({ id: `${gameVersion}-${rec}`, stable: true, recommended: true });
        if (lat && lat !== rec)
          versions.push({ id: `${gameVersion}-${lat}`, stable: true, recommended: false });
        if (versions.length === 0)
          versions.push({ id: `${gameVersion}-latest`, stable: true, recommended: true });
      }
    } else if (loader === "neoforge") {
      const r = await fetch(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml"
      );
      if (r.ok) {
        const text = await r.text();
        const matches = [...text.matchAll(/<version>([^<]+)<\/version>/g)];
        const ver = gameVersion.replace(/^1\./, "");
        const filtered = matches
          .map((m) => m[1])
          .filter((v) => v.startsWith(ver))
          .reverse();
        versions = filtered.map((v, i) => ({ id: v, stable: true, recommended: i === 0 }));
        if (versions.length === 0) {
          versions = [{ id: `${gameVersion}-latest`, stable: true, recommended: true }];
        }
      }
    } else if (loader === "quilt") {
      const r = await fetch(
        `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}`
      );
      if (r.ok) {
        const data = (await r.json()) as Array<{ loader: { version: string } }>;
        versions = data.map((v, i) => ({
          id: v.loader.version,
          stable: true,
          recommended: i === 0,
        }));
      }
    }

    res.json(versions);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch loader versions" });
  }
});

export default router;
