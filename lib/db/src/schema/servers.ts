import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serversTable = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  gameVersion: text("game_version").notNull(),
  serverType: text("server_type").notNull(),
  loaderVersion: text("loader_version"),
  status: text("status").notNull().default("stopped"),
  port: integer("port"),
  maxPlayers: integer("max_players").notNull().default(20),
  onlinePlayers: integer("online_players").notNull().default(0),
  motd: text("motd"),
  memory: integer("memory").notNull().default(2048),
  serverProperties: text("server_properties"),
  jarDownloadStatus: text("jar_download_status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertServerSchema = createInsertSchema(serversTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  onlinePlayers: true,
  jarDownloadStatus: true,
});

export type InsertServer = z.infer<typeof insertServerSchema>;
export type Server = typeof serversTable.$inferSelect;
