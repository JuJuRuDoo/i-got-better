import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});
export const db = drizzle(pool, { schema });

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "servers" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "description" text,
        "game_version" text NOT NULL,
        "server_type" text NOT NULL,
        "loader_version" text,
        "status" text DEFAULT 'stopped' NOT NULL,
        "port" integer,
        "max_players" integer DEFAULT 20 NOT NULL,
        "online_players" integer DEFAULT 0 NOT NULL,
        "motd" text,
        "memory" integer DEFAULT 2048 NOT NULL,
        "server_properties" text,
        "jar_download_status" text DEFAULT 'pending' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "servers_slug_unique" UNIQUE("slug")
      );

      CREATE TABLE IF NOT EXISTS "installed_mods" (
        "id" serial PRIMARY KEY NOT NULL,
        "server_id" integer NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
        "mod_id" text NOT NULL,
        "mod_name" text NOT NULL,
        "mod_version" text NOT NULL,
        "source" text NOT NULL,
        "icon_url" text,
        "file_path" text,
        "file_size" integer,
        "download_url" text,
        "download_status" text DEFAULT 'pending' NOT NULL,
        "category" text DEFAULT 'mod' NOT NULL,
        "installed_at" timestamp DEFAULT now() NOT NULL
      );
    `);
  } finally {
    client.release();
  }
}

export * from "./schema";
