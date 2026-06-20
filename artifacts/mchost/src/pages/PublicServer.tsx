import { useParams, Link } from "wouter";
import { useGetServerBySlug, useListServerMods, getGetServerBySlugQueryKey, getListServerModsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Server, Package, Users, Cpu, Globe, ArrowLeft } from "lucide-react";

export default function PublicServer() {
  const { slug } = useParams<{ slug: string }>();

  const { data: server, isLoading, isError } = useGetServerBySlug(slug, {
    query: { enabled: !!slug, queryKey: getGetServerBySlugQueryKey(slug) },
  });
  const { data: mods, isLoading: modsLoading } = useListServerMods(server?.id ?? 0, {
    query: { enabled: !!server?.id, queryKey: getListServerModsQueryKey(server?.id ?? 0) },
  });

  const typeColors: Record<string, string> = {
    vanilla: "text-blue-400 border-blue-400/30 bg-blue-400/10",
    paper: "text-green-400 border-green-400/30 bg-green-400/10",
    purpur: "text-violet-400 border-violet-400/30 bg-violet-400/10",
    forge: "text-orange-400 border-orange-400/30 bg-orange-400/10",
    fabric: "text-purple-400 border-purple-400/30 bg-purple-400/10",
    neoforge: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
    quilt: "text-pink-400 border-pink-400/30 bg-pink-400/10",
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card px-6 py-4">
          <Skeleton className="h-6 w-32" />
        </header>
        <main className="max-w-2xl mx-auto px-6 py-12 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-2 gap-4 mt-8">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        </main>
      </div>
    );
  }

  if (isError || !server) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center font-mono space-y-4">
          <div className="text-5xl font-bold text-muted-foreground/20">404</div>
          <p className="text-muted-foreground">Server <span className="text-foreground">/s/{slug}</span> not found.</p>
          <Link href="/">
            <button className="flex items-center gap-1 text-sm text-primary hover:underline mx-auto">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to CraftHost
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    running: "text-primary bg-primary/10 border-primary/30",
    stopped: "text-muted-foreground bg-muted border-border",
    error: "text-destructive bg-destructive/10 border-destructive/30",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-3">
        <div className="w-7 h-7 bg-primary/10 border border-primary/30 rounded flex items-center justify-center">
          <Server className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="font-mono text-base font-bold text-foreground tracking-tight">CraftHost</span>
        <span className="text-border mx-2">|</span>
        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-mono text-sm text-muted-foreground">/s/{slug}</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Server name & status */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-mono text-3xl font-bold text-foreground">{server.name}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${statusColors[server.status] ?? statusColors.stopped}`}>
              {server.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse" />}
              {server.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${typeColors[server.serverType] ?? "text-muted-foreground border-border"}`}>
              {server.serverType}
            </span>
            <span className="font-mono text-sm text-muted-foreground">Minecraft {server.gameVersion}</span>
            {server.loaderVersion && (
              <span className="font-mono text-xs text-muted-foreground">({server.loaderVersion})</span>
            )}
          </div>

          {server.motd && (
            <p className="mt-3 font-mono text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">
              {server.motd}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs text-muted-foreground">Players</span>
            </div>
            <div className="font-mono text-2xl font-bold text-foreground">
              {server.onlinePlayers} <span className="text-muted-foreground text-base font-normal">/ {server.maxPlayers}</span>
            </div>
          </Card>
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-purple-400" />
              <span className="font-mono text-xs text-muted-foreground">Mods</span>
            </div>
            <div className="font-mono text-2xl font-bold text-foreground">{server.modCount}</div>
          </Card>
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs text-muted-foreground">Memory</span>
            </div>
            <div className="font-mono text-2xl font-bold text-foreground">
              {server.memory >= 1024 ? `${server.memory / 1024}G` : `${server.memory}M`}
            </div>
          </Card>
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span className="font-mono text-xs text-muted-foreground">Type</span>
            </div>
            <div className={`font-mono text-lg font-bold ${typeColors[server.serverType]?.split(" ")[0] ?? "text-foreground"}`}>
              {server.serverType}
            </div>
          </Card>
        </div>

        {/* Mod list */}
        {server.modCount > 0 && (
          <div>
            <h2 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-3">Installed Mods</h2>
            {modsLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {mods?.map((mod) => (
                  <Card key={mod.id} className="p-3 bg-card border-border flex items-center gap-3">
                    {mod.iconUrl ? (
                      <img src={mod.iconUrl} className="w-8 h-8 rounded" alt={mod.modName} />
                    ) : (
                      <div className="w-8 h-8 bg-secondary rounded flex items-center justify-center">
                        <Package className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-semibold text-foreground">{mod.modName}</div>
                      <div className="font-mono text-xs text-muted-foreground">v{mod.modVersion} · {mod.source}</div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-border text-center">
          <Link href="/">
            <span className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer">
              Powered by CraftHost
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
