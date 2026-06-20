import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { serversTable } from "./servers";

export const serverFilesTable = pgTable("server_files", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .notNull()
    .references(() => serversTable.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ServerFile = typeof serverFilesTable.$inferSelect;
