CREATE TABLE "servers" (
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
--> statement-breakpoint
CREATE TABLE "installed_mods" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
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
--> statement-breakpoint
ALTER TABLE "installed_mods" ADD CONSTRAINT "installed_mods_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;