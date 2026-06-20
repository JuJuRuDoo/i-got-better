import { Router } from "express";
import { db, serversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CheckSlugQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /api/slugs/check?slug=xxx
router.get("/check", async (req, res) => {
  const parsed = CheckSlugQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "slug is required" });
    return;
  }
  const { slug } = parsed.data;
  try {
    const existing = await db
      .select()
      .from(serversTable)
      .where(eq(serversTable.slug, slug))
      .limit(1);
    res.json({ slug, available: !existing[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to check slug" });
  }
});

export default router;
