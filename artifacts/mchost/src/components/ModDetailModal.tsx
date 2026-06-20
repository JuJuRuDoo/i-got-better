import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Package, ExternalLink, Download, ChevronDown, ChevronUp, Plus, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface ModSearchResult {
  id: string;
  name: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloadCount: number;
  source: "curseforge" | "modrinth";
  latestVersion: string | null;
}

interface ModDetail {
  id: string;
  name: string;
  description: string;
  body: string | null;
  author: string;
  iconUrl: string | null;
  downloads: number;
  categories: string[];
  loaders: string[];
  gameVersions: string[];
  websiteUrl: string | null;
  source: string;
}

interface ModVersionInfo {
  id: string;
  versionNumber: string;
  name: string;
  changelog: string | null;
  datePublished: string;
  gameVersions: string[];
  loaders: string[];
  downloadUrl: string | null;
  fileName: string;
}

interface Props {
  mod: ModSearchResult | null;
  onClose: () => void;
  onInstall: (mod: ModSearchResult) => void;
  isInstalled: boolean;
  installing: boolean;
  loader?: string;
  gameVersion?: string;
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
      source === "curseforge"
        ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
        : "text-green-400 border-green-500/30 bg-green-500/10"
    }`}>
      {source === "curseforge" ? "CurseForge" : "Modrinth"}
    </span>
  );
}

export function ModDetailModal({ mod, onClose, onInstall, isInstalled, installing, loader, gameVersion }: Props) {
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const { data: detail, isLoading: detailLoading } = useQuery<ModDetail>({
    queryKey: ["modDetail", mod?.source, mod?.id],
    queryFn: async () => {
      const r = await fetch(`/api/mods/${mod!.source}/${mod!.id}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!mod,
  });

  const { data: versions, isLoading: versionsLoading } = useQuery<ModVersionInfo[]>({
    queryKey: ["modVersions", mod?.source, mod?.id, loader, gameVersion],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (loader) params.set("loader", loader);
      if (gameVersion) params.set("gameVersion", gameVersion);
      const r = await fetch(`/api/mods/${mod!.source}/${mod!.id}/versions?${params}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!mod,
  });

  if (!mod) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div
        className="w-full max-w-xl bg-card border-l border-border flex flex-col h-full overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-border">
          {mod.iconUrl ? (
            <img src={mod.iconUrl} className="w-14 h-14 rounded-lg shrink-0 object-cover" alt={mod.name} />
          ) : (
            <div className="w-14 h-14 bg-secondary rounded-lg shrink-0 flex items-center justify-center">
              <Package className="w-7 h-7 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-mono font-bold text-lg text-foreground leading-tight">{mod.name}</h2>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <SourceBadge source={mod.source} />
              <span className="font-mono text-xs text-muted-foreground">by {mod.author}</span>
              <span className="font-mono text-xs text-muted-foreground">
                · {(mod.downloadCount / 1_000_000).toFixed(1)}M downloads
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Button
            size="sm"
            variant={isInstalled ? "outline" : "default"}
            className="font-mono text-xs gap-1"
            onClick={() => !isInstalled && onInstall(mod)}
            disabled={isInstalled || installing}
          >
            {isInstalled ? (
              <><Check className="w-3.5 h-3.5" />Installed</>
            ) : (
              <><Plus className="w-3.5 h-3.5" />Install</>
            )}
          </Button>
          {detail?.websiteUrl && (
            <a
              href={detail.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on {mod.source === "modrinth" ? "Modrinth" : "CurseForge"}
            </a>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Description */}
          <div className="p-4 border-b border-border">
            <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">Description</h3>
            {detailLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : (
              <p className="font-mono text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {detail?.body || detail?.description || mod.description}
              </p>
            )}
          </div>

          {/* Categories + compatibility */}
          {detail && !detailLoading && (
            <div className="p-4 border-b border-border">
              <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">Categories</h3>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {detail.categories.map((cat) => (
                  <span key={cat} className="font-mono text-xs px-2 py-0.5 rounded border border-border bg-secondary text-muted-foreground">
                    {cat}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <div className="font-mono text-xs text-muted-foreground mb-1">Loaders</div>
                  <div className="flex gap-1 flex-wrap">
                    {detail.loaders.map((l) => (
                      <span key={l} className={`font-mono text-xs px-1.5 py-0.5 rounded border ${
                        l === loader
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      }`}>{l}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Versions + changelogs */}
          <div className="p-4">
            <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-3">
              Versions {loader || gameVersion ? `(${[loader, gameVersion].filter(Boolean).join(" · ")})` : ""}
            </h3>
            {versionsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : !versions || versions.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">No compatible versions found.</p>
            ) : (
              <div className="space-y-2">
                {versions.map((v, i) => (
                  <div key={v.id} className="border border-border rounded overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors"
                      onClick={() => setExpandedVersion(expandedVersion === v.id ? null : v.id)}
                    >
                      <div className="text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-foreground truncate">{v.versionNumber}</span>
                          {i === 0 && (
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground mt-0.5">
                          {new Date(v.datePublished).toLocaleDateString()} · {v.fileName}
                        </div>
                      </div>
                      {expandedVersion === v.id
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                    </button>
                    {expandedVersion === v.id && (
                      <div className="px-3 pb-3 border-t border-border bg-background/30">
                        <div className="flex gap-1.5 mt-2 mb-2 flex-wrap">
                          {v.gameVersions.slice(0, 6).map((gv) => (
                            <span key={gv} className="font-mono text-xs px-1.5 py-0.5 border border-border rounded text-muted-foreground">{gv}</span>
                          ))}
                          {v.loaders.map((l) => (
                            <span key={l} className={`font-mono text-xs px-1.5 py-0.5 border rounded ${
                              l === loader ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground"
                            }`}>{l}</span>
                          ))}
                        </div>
                        {v.changelog ? (
                          <div className="font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                            {v.changelog}
                          </div>
                        ) : (
                          <p className="font-mono text-xs text-muted-foreground italic">No changelog provided.</p>
                        )}
                        {v.downloadUrl && (
                          <a
                            href={v.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline mt-2"
                          >
                            <Download className="w-3 h-3" />
                            Download {v.fileName}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
