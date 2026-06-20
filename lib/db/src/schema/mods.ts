import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { serversTable } from "./servers";

export const installedModsTable = pgTable("installed_mods", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .notNull()
    .references(() => serversTable.id, { onDelete: "cascade" }),
  modId: text("mod_id").notNull(),
  modName: text("mod_name").notNull(),
  modVersion: text("mod_version").notNull(),
  source: text("source").notNull(),
  iconUrl: text("icon_url"),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  downloadUrl: text("download_url"),
  downloadStatus: text("download_status").notNull().default("pending"),
  installedAt: timestamp("installed_at").notNull().defaultNow(),
});

export const insertModSchema = createInsertSchema(installedModsTable).omit({
  id: true,
  installedAt: true,
});

export type InstalledMod = typeof installedModsTable.$inferSelect;
export type InsertMod = z.infer<typeof insertModSchema>;
