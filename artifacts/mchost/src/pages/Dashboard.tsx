import { Link } from "wouter";
import { useListServers, useGetServersSummary, useStartServer, useStopServer, getListServersQueryKey, getGetServersSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, Square, Plus, Server, Package, Zap, Globe } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-primary/20 text-primary border-primary/30",
    stopped: "bg-muted text-muted-foreground border-border",
    starting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    stopping: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    error: "bg-destructive/20 text-destructive border-destructive/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${map[status] ?? map.stopped}`}>
      {status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse" />}
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    vanilla: "text-blue-400",
    paper: "text-green-400",
    purpur: "text-violet-400",
    forge: "text-orange-400",
    fabric: "text-purple-400",
    neoforge: "text-cyan-400",
    quilt: "text-pink-400",
  };
  return <span className={`font-mono text-xs ${colors[type] ?? "text-muted-foreground"}`}>{type}</span>;
}

export default function Dashboard() {
  const { data: servers, isLoading: serversLoading } = useListServers();
  const { data: summary, isLoading: summaryLoading } = useGetServersSummary();
  const queryClient = useQueryClient();
  const startServer = useStartServer();
  const stopServer = useStopServer();

  function handleStart(id: number) {
    startServer.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetServersSummaryQueryKey() });
      }
    });
  }

  function handleStop(id: number) {
    stopServer.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetServersSummaryQueryKey() });
      }
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 border border-primary/30 rounded flex items-center justify-center">
            <Server className="w-4 h-4 text-primary" />
          </div>
          <span className="font-mono text-lg font-bold text-foreground tracking-tight">CraftHost</span>
        </div>
        <Link href="/servers/new">
          <Button size="sm" className="gap-2 font-mono">
            <Plus className="w-3.5 h-3.5" />
            New Server
          </Button>
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Servers", value: summaryLoading ? null : summary?.totalServers ?? 0, icon: Server, color: "text-blue-400" },
            { label: "Online", value: summaryLoading ? null : summary?.runningServers ?? 0, icon: Zap, color: "text-primary" },
            { label: "Mods Installed", value: summaryLoading ? null : summary?.totalMods ?? 0, icon: Package, color: "text-purple-400" },
            { label: "Top Version", value: summaryLoading ? null : (summary?.popularVersion ?? "—"), icon: Globe, color: "text-cyan-400" },
          ].map((stat) => (
            <Card key={stat.label} className="p-4 bg-card border-border">
              <div className="flex items-start justify-between mb-3">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              {stat.value === null ? (
                <Skeleton className="h-7 w-12 mb-1" />
              ) : (
                <div className="font-mono text-2xl font-bold text-foreground">{stat.value}</div>
              )}
              <div className="text-xs text-muted-foreground font-mono">{stat.label}</div>
            </Card>
          ))}
        </div>

        {/* Servers List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Servers</h2>
          </div>

          {serversLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : !servers?.length ? (
            <Card className="p-12 text-center border-dashed border-border bg-card">
              <Server className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="font-mono text-muted-foreground mb-4">No servers yet.</p>
              <Link href="/servers/new">
                <Button variant="outline" size="sm" className="font-mono gap-2">
                  <Plus className="w-3.5 h-3.5" />
                  Create your first server
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-3">
              {servers.map((server) => (
                <Card key={server.id} className="p-4 bg-card border-border hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link href={`/servers/${server.id}`}>
                            <span className="font-mono font-semibold text-foreground hover:text-primary transition-colors cursor-pointer">
                              {server.name}
                            </span>
                          </Link>
                          <StatusBadge status={server.status} />
                          <TypeBadge type={server.serverType} />
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                          <span>{server.gameVersion}</span>
                          <span>·</span>
                          <span>{server.onlinePlayers}/{server.maxPlayers} players</span>
                          <span>·</span>
                          <span>{server.modCount} mods</span>
                          <span>·</span>
                          <a
                            href={`/s/${server.slug}`}
                            className="text-primary/70 hover:text-primary transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            /s/{server.slug}
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Link href={`/servers/${server.id}`}>
                        <Button variant="outline" size="sm" className="font-mono text-xs h-7">
                          Manage
                        </Button>
                      </Link>
                      {server.status === "running" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="font-mono text-xs h-7 text-destructive hover:text-destructive gap-1"
                          onClick={() => handleStop(server.id)}
                          disabled={stopServer.isPending}
                        >
                          <Square className="w-3 h-3" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="font-mono text-xs h-7 gap-1"
                          onClick={() => handleStart(server.id)}
                          disabled={startServer.isPending}
                        >
                          <Play className="w-3 h-3" />
                          Start
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
