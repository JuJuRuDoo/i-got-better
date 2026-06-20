import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useCreateServer,
  useListMinecraftVersions,
  useListLoaderVersions,
  useCheckSlug,
  getListServersQueryKey,
  getGetServersSummaryQueryKey,
  getListLoaderVersionsQueryKey,
  getCheckSlugQueryKey,
} from "@workspace/api-client-react";
import type { ServerInputServerType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, X, Loader2, Server } from "lucide-react";
import { Link } from "wouter";

const SERVER_TYPES = [
  { id: "vanilla", label: "Vanilla", desc: "Official Mojang server, no mods" },
  { id: "paper", label: "Paper", desc: "High-performance Bukkit fork, plugin support" },
  { id: "purpur", label: "Purpur", desc: "Paper fork with extra features & config" },
  { id: "fabric", label: "Fabric", desc: "Lightweight modding framework" },
  { id: "forge", label: "Forge", desc: "Classic modding platform" },
  { id: "neoforge", label: "NeoForge", desc: "Fork of Forge, actively maintained" },
  { id: "quilt", label: "Quilt", desc: "Fork of Fabric with extras" },
];

const LOADER_TYPES = new Set(["fabric", "forge", "neoforge", "quilt"]);

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
}

export default function CreateServer() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [serverType, setServerType] = useState("vanilla");
  const [gameVersion, setGameVersion] = useState("");
  const [loaderVersion, setLoaderVersion] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [memory, setMemory] = useState(2048);
  const [motd, setMotd] = useState("");
  const [step, setStep] = useState(1);

  const createServer = useCreateServer();
  const { data: mcVersions, isLoading: versionsLoading } = useListMinecraftVersions();
  const loaderParams = { loader: serverType as "forge" | "fabric" | "neoforge" | "quilt", gameVersion };
  const { data: loaderVersions, isLoading: loaderLoading } = useListLoaderVersions(
    loaderParams,
    { query: { enabled: LOADER_TYPES.has(serverType) && !!gameVersion, queryKey: getListLoaderVersionsQueryKey(loaderParams) } }
  );
  const slugParams = { slug };
  const { data: slugCheck } = useCheckSlug(
    slugParams,
    { query: { enabled: slug.length >= 2, queryKey: getCheckSlugQueryKey(slugParams) } }
  );

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugTouched && name) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

  // Select first release version by default
  useEffect(() => {
    if (mcVersions && !gameVersion) {
      const first = mcVersions.find((v) => v.type === "release");
      if (first) setGameVersion(first.id);
    }
  }, [mcVersions, gameVersion]);

  // Select first loader version by default
  useEffect(() => {
    if (loaderVersions && loaderVersions.length > 0 && !loaderVersion) {
      const rec = loaderVersions.find((v) => v.recommended);
      setLoaderVersion((rec ?? loaderVersions[0]).id);
    }
    if (serverType === "vanilla") setLoaderVersion("");
  }, [loaderVersions, serverType]);

  function handleSubmit() {
    createServer.mutate(
      {
        data: {
          name,
          slug,
          gameVersion,
          serverType: serverType as ServerInputServerType,
          loaderVersion: serverType !== "vanilla" ? loaderVersion : undefined,
          maxPlayers,
          memory,
          motd: motd || undefined,
        },
      },
      {
        onSuccess: (server) => {
          queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetServersSummaryQueryKey() });
          navigate(`/servers/${server.id}`);
        },
      }
    );
  }

  const releaseVersions = mcVersions?.filter((v) => v.type === "release") ?? [];
  const snapshotVersions = mcVersions?.filter((v) => v.type === "snapshot") ?? [];
  const slugAvailable = slugCheck?.available;
  const slugValid = slug.length >= 2 && /^[a-z0-9-]+$/.test(slug);
  const canProceed1 = serverType && gameVersion;
  const canSubmit =
    name.trim().length > 0 &&
    slugValid &&
    slugAvailable !== false &&
    gameVersion &&
    serverType;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary/10 border border-primary/30 rounded flex items-center justify-center">
          <Server className="w-4 h-4 text-primary" />
        </div>
        <span className="font-mono text-lg font-bold text-foreground tracking-tight">CraftHost</span>
        <span className="text-border mx-2">|</span>
        <Link href="/">
          <button className="flex items-center gap-1 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </button>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-mono text-2xl font-bold text-foreground mb-1">New Server</h1>
          <p className="text-sm text-muted-foreground font-mono">Configure your Minecraft server instance</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8 font-mono text-xs">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold border ${
                  step === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : step > s
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-card text-muted-foreground border-border"
                }`}
              >
                {step > s ? <Check className="w-3 h-3" /> : s}
              </div>
              <span className={step === s ? "text-foreground" : "text-muted-foreground"}>
                {s === 1 ? "Engine" : "Details"}
              </span>
              {s < 2 && <span className="text-border mx-1">—</span>}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            {/* Server Type */}
            <div>
              <Label className="font-mono text-sm mb-3 block">Server Type</Label>
              <div className="grid grid-cols-1 gap-2">
                {SERVER_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setServerType(t.id); setLoaderVersion(""); }}
                    className={`flex items-center justify-between p-3 rounded border text-left transition-all ${
                      serverType === t.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div>
                      <div className="font-mono font-semibold text-sm text-foreground">{t.label}</div>
                      <div className="font-mono text-xs text-muted-foreground">{t.desc}</div>
                    </div>
                    {serverType === t.id && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Minecraft Version */}
            <div>
              <Label className="font-mono text-sm mb-2 block">Minecraft Version</Label>
              {versionsLoading ? (
                <div className="h-10 bg-card border border-border rounded animate-pulse" />
              ) : (
                <Select value={gameVersion} onValueChange={setGameVersion}>
                  <SelectTrigger className="font-mono">
                    <SelectValue placeholder="Select version..." />
                  </SelectTrigger>
                  <SelectContent>
                    {releaseVersions.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-muted-foreground font-mono">Releases</div>
                        {releaseVersions.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="font-mono">{v.id}</SelectItem>
                        ))}
                      </>
                    )}
                    {snapshotVersions.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-muted-foreground font-mono">Snapshots</div>
                        {snapshotVersions.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="font-mono">{v.id}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Loader Version */}
            {LOADER_TYPES.has(serverType) && (
              <div>
                <Label className="font-mono text-sm mb-2 block">{serverType.charAt(0).toUpperCase() + serverType.slice(1)} Version</Label>
                {!gameVersion ? (
                  <div className="font-mono text-xs text-muted-foreground">Select a Minecraft version first</div>
                ) : loaderLoading ? (
                  <div className="h-10 bg-card border border-border rounded animate-pulse" />
                ) : !loaderVersions?.length ? (
                  <div className="font-mono text-xs text-muted-foreground">No versions found for {gameVersion}</div>
                ) : (
                  <Select value={loaderVersion} onValueChange={setLoaderVersion}>
                    <SelectTrigger className="font-mono">
                      <SelectValue placeholder="Select loader version..." />
                    </SelectTrigger>
                    <SelectContent>
                      {loaderVersions.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="font-mono">
                          {v.id} {v.recommended && "(recommended)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <Button
              className="w-full font-mono"
              onClick={() => setStep(2)}
              disabled={!canProceed1}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            {/* Name */}
            <div>
              <Label className="font-mono text-sm mb-2 block">Server Name</Label>
              <Input
                className="font-mono"
                placeholder="My Awesome Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Slug */}
            <div>
              <Label className="font-mono text-sm mb-2 block">Custom Link</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-sm shrink-0">/s/</span>
                <div className="relative flex-1">
                  <Input
                    className="font-mono pr-8"
                    placeholder="my-server"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(slugify(e.target.value));
                    }}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {slug.length >= 2 && (
                      slugAvailable === undefined ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      ) : slugAvailable ? (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-destructive" />
                      )
                    )}
                  </div>
                </div>
              </div>
              {slug.length >= 2 && !slugValid && (
                <p className="text-xs text-destructive font-mono mt-1">Only lowercase letters, numbers, and hyphens</p>
              )}
              {slug.length >= 2 && slugValid && slugAvailable === false && (
                <p className="text-xs text-destructive font-mono mt-1">This slug is already taken</p>
              )}
            </div>

            {/* MOTD */}
            <div>
              <Label className="font-mono text-sm mb-2 block">Message of the Day <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                className="font-mono"
                placeholder="Welcome to my server!"
                value={motd}
                onChange={(e) => setMotd(e.target.value)}
              />
            </div>

            {/* Max Players */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-sm mb-2 block">Max Players</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={maxPlayers}
                  min={1}
                  max={200}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="font-mono text-sm mb-2 block">Memory (MB)</Label>
                <Select value={String(memory)} onValueChange={(v) => setMemory(Number(v))}>
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1024, 2048, 4096, 8192, 16384].map((m) => (
                      <SelectItem key={m} value={String(m)} className="font-mono">{m} MB</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Summary */}
            <Card className="p-4 bg-card border-border">
              <div className="font-mono text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between"><span>Type</span><span className="text-foreground">{serverType}</span></div>
                <div className="flex justify-between"><span>Minecraft</span><span className="text-foreground">{gameVersion}</span></div>
                {loaderVersion && <div className="flex justify-between"><span>Loader</span><span className="text-foreground">{loaderVersion}</span></div>}
                <div className="flex justify-between"><span>Memory</span><span className="text-foreground">{memory} MB</span></div>
              </div>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="font-mono" onClick={() => setStep(1)}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </Button>
              <Button
                className="flex-1 font-mono gap-2"
                onClick={handleSubmit}
                disabled={!canSubmit || createServer.isPending}
              >
                {createServer.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Server
              </Button>
            </div>

            {createServer.isError && (
              <p className="text-xs text-destructive font-mono">
                Failed to create server. Please try again.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
