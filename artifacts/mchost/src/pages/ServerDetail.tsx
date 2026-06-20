import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import type {
  MinecraftServer,
  InstalledMod,
  ModSearchResult,
  PluginSearchResult,
  ModUpdateInfo,
  ServerLogs,
  ServerUpdateServerType,
} from "@workspace/api-client-react";
import {
  useGetServer,
  useStartServer,
  useStopServer,
  useDeleteServer,
  useGetServerLogs,
  useListServerMods,
  useInstallMod,
  useUninstallMod,
  useSearchMods,
  useGetFeaturedMods,
  useSearchPlugins,
  useGetFeaturedPlugins,
  useUpdateServer,
  useListModUpdates,
  useListMinecraftVersions,
  useListLoaderVersions,
  getGetServerQueryKey,
  getListServersQueryKey,
  getGetServersSummaryQueryKey,
  getListServerModsQueryKey,
  getGetServerLogsQueryKey,
  getListModUpdatesQueryKey,
  getListLoaderVersionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModDetailModal } from "@/components/ModDetailModal";
import {
  Play, Square, Trash2, ArrowLeft, Server, Package, Terminal,
  Search, Plus, X, Loader2, Globe, RefreshCw, Upload, Settings2,
  Save, RotateCcw, AlertTriangle, Check, HardDrive,
  Cpu, Users, Copy, ChevronRight, Plug,
} from "lucide-react";

const SERVER_TYPES: ServerUpdateServerType[] = ["vanilla", "paper", "purpur", "fabric", "forge", "neoforge", "quilt"];
const LOADER_TYPES = new Set(["fabric", "forge", "neoforge", "quilt"]);
const MEMORY_OPTIONS = [512, 1024, 2048, 4096, 8192, 16384];

const DEFAULT_PROPERTIES = `# server.properties
difficulty=easy
gamemode=survival
max-players=20
online-mode=true
pvp=true
spawn-protection=16
view-distance=10
simulation-distance=10
allow-nether=true
enable-command-block=false
spawn-monsters=true
spawn-animals=true
white-list=false
enforce-whitelist=false
server-port=25565`;

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
      {(status === "running" || status === "starting") && (
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse ${status === "running" ? "bg-primary" : "bg-yellow-400"}`} />
      )}
      {status}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "upload") {
    return <span className="text-xs font-mono px-1.5 py-0.5 rounded border text-blue-400 border-blue-500/30 bg-blue-500/10">JAR</span>;
  }
  if (source === "hangar") {
    return <span className="text-xs font-mono px-1.5 py-0.5 rounded border text-sky-400 border-sky-500/30 bg-sky-500/10">HG</span>;
  }
  return (
    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
      source === "curseforge"
        ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
        : "text-green-400 border-green-500/30 bg-green-500/10"
    }`}>
      {source === "curseforge" ? "CF" : "MR"}
    </span>
  );
}

type Tab = "overview" | "mods" | "plugins" | "logs" | "console" | "files" | "settings";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  editable?: boolean;
  deletable?: boolean;
  modId?: number;
}

interface ContextMenu {
  x: number;
  y: number;
  entry: FileEntry;
}

export default function ServerDetail() {
  const { id: idParam } = useParams<{ id: string }>();
  const serverId = parseInt(idParam ?? "0", 10);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchSource, setSearchSource] = useState<"modrinth" | "curseforge">("modrinth");
  const [accSearchResults, setAccSearchResults] = useState<ModSearchResult[]>([]);
  const [installingModId, setInstallingModId] = useState<string | null>(null);
  const [removingModId, setRemovingModId] = useState<number | null>(null);
  const [selectedMod, setSelectedMod] = useState<ModSearchResult | null>(null);

  // Plugin search state (for paper/purpur servers)
  const [pluginQuery, setPluginQuery] = useState("");
  const [debouncedPluginQuery, setDebouncedPluginQuery] = useState("");
  const [pluginSource, setPluginSource] = useState<"modrinth" | "hangar">("modrinth");
  const [accPluginResults, setAccPluginResults] = useState<PluginSearchResult[]>([]);
  const [installingPluginId, setInstallingPluginId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  // File manager state
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [fileSaving, setFileSaving] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["mods", "logs"]));
  const [fileTreeLoaded, setFileTreeLoaded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [fileClipboard, setFileClipboard] = useState<{ op: "copy" | "cut"; entry: FileEntry } | null>(null);
  const [propertiesEntry, setPropertiesEntry] = useState<FileEntry | null>(null);
  const [renameEntry, setRenameEntry] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFileDialogDir, setNewFileDialogDir] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Console state
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleSending, setConsoleSending] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const consoleInputRef = useRef<HTMLInputElement>(null);

  const [settingsForm, setSettingsForm] = useState({
    name: "", description: "", serverType: "vanilla" as ServerUpdateServerType,
    gameVersion: "1.21.1", loaderVersion: "", maxPlayers: 20, motd: "", memory: 2048,
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [propertiesText, setPropertiesText] = useState("");
  const [propertiesSaved, setPropertiesSaved] = useState(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyQueryOpts = any;

  const { data: server, isLoading } = useGetServer(serverId, {
    query: {
      refetchInterval: (q: { state: { data: unknown } }) => {
        const s = (q.state.data as MinecraftServer | undefined)?.status;
        return s === "starting" || s === "stopping" ? 2000 : 8000;
      },
    } as AnyQueryOpts,
  });

  const { data: mcVersions = [] } = useListMinecraftVersions();
  const releaseVersions = mcVersions.filter((v) => v.type === "release");

  const { data: installedMods = [] } = useListServerMods(server?.id ?? 0, {
    query: { enabled: !!server?.id } as AnyQueryOpts,
  }) as { data: InstalledMod[] };

  const { data: modUpdates = [] } = useListModUpdates(server?.id ?? 0, {
    query: { enabled: !!server?.id && activeTab === "overview", refetchInterval: 60000 } as AnyQueryOpts,
  }) as { data: ModUpdateInfo[] };

  const { data: serverLogs } = useGetServerLogs(server?.id ?? 0, {
    query: { enabled: !!server?.id, refetchInterval: (activeTab === "logs" || activeTab === "console") ? 1500 : false } as AnyQueryOpts,
  }) as { data: ServerLogs | undefined };

  const settingsLoaderParams = {
    loader: settingsForm.serverType as "forge" | "fabric" | "neoforge" | "quilt",
    gameVersion: settingsForm.gameVersion,
  };
  const { data: settingsLoaderVersions = [], isLoading: settingsLoaderLoading } = useListLoaderVersions(
    settingsLoaderParams,
    { query: { enabled: LOADER_TYPES.has(settingsForm.serverType) && !!settingsForm.gameVersion, queryKey: getListLoaderVersionsQueryKey(settingsLoaderParams) } as AnyQueryOpts }
  );

  useEffect(() => {
    if (server && !settingsLoaded) {
      setSettingsForm({
        name: server.name,
        description: server.description ?? "",
        serverType: server.serverType as ServerUpdateServerType,
        gameVersion: server.gameVersion,
        loaderVersion: server.loaderVersion ?? "",
        maxPlayers: server.maxPlayers,
        motd: server.motd ?? "",
        memory: server.memory,
      });
      setSettingsLoaded(true);
    }
    if (server && !propertiesLoaded) {
      setPropertiesText(server.serverProperties ?? DEFAULT_PROPERTIES);
      setPropertiesLoaded(true);
    }
  }, [server, settingsLoaded, propertiesLoaded]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setAccSearchResults([]);
  }, [debouncedQuery, searchSource]);

  // Load file tree when switching to files tab
  useEffect(() => {
    if (activeTab !== "files" || !server?.id) return;
    setFileTreeLoaded(false);
    fetch(`/api/servers/${server.id}/filemanager`)
      .then((r) => r.json())
      .then((d: { files: FileEntry[] }) => { setFileTree(d.files); setFileTreeLoaded(true); })
      .catch(() => setFileTreeLoaded(true));
  }, [activeTab, server?.id]);

  // Load file content when a file is selected
  useEffect(() => {
    if (!selectedFile || !server?.id || selectedFile.type === "dir" || !selectedFile.editable) return;
    setFileContentLoading(true);
    setFileContent("");
    fetch(`/api/servers/${server.id}/filemanager/content?path=${encodeURIComponent(selectedFile.path)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: { content: string } | null) => { setFileContent(d?.content ?? ""); })
      .finally(() => setFileContentLoading(false));
  }, [selectedFile, server?.id]);

  async function handleFileSave() {
    if (!selectedFile || !server?.id) return;
    setFileSaving(true);
    try {
      await fetch(`/api/servers/${server.id}/filemanager/content?path=${encodeURIComponent(selectedFile.path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fileContent }),
      });
      setFileSaved(true);
      setTimeout(() => setFileSaved(false), 2500);
    } finally {
      setFileSaving(false);
    }
  }

  function refreshFileTree() {
    if (!server?.id) return;
    fetch(`/api/servers/${server.id}/filemanager`)
      .then((r) => r.json())
      .then((d: { files: FileEntry[] }) => setFileTree(d.files))
      .catch(() => {});
  }

  async function handleFileDelete(entry: FileEntry) {
    if (!server?.id || !entry.deletable) return;
    if (!confirm(`Delete "${entry.name}"?`)) return;
    await fetch(`/api/servers/${server.id}/filemanager?path=${encodeURIComponent(entry.path)}`, { method: "DELETE" });
    if (selectedFile?.path === entry.path) setSelectedFile(null);
    refreshFileTree();
  }

  async function handleRenameSubmit() {
    if (!server?.id || !renameEntry || !renameValue.trim()) return;
    const dir = renameEntry.path.includes("/") ? renameEntry.path.slice(0, renameEntry.path.lastIndexOf("/") + 1) : "";
    const newPath = dir + renameValue.trim();
    await fetch(`/api/servers/${server.id}/filemanager/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath: renameEntry.path, newPath }),
    });
    setRenameEntry(null);
    setRenameValue("");
    refreshFileTree();
  }

  async function handleNewFileSubmit(dir: string) {
    if (!server?.id || !newFileName.trim()) return;
    const path = dir ? `${dir}/${newFileName.trim()}` : newFileName.trim();
    await fetch(`/api/servers/${server.id}/filemanager?path=${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    setNewFileDialogDir(null);
    setNewFileName("");
    refreshFileTree();
  }

  async function handleFilePaste(targetDir: string) {
    if (!server?.id || !fileClipboard) return;
    const { op, entry } = fileClipboard;
    const newName = entry.name;
    const newPath = targetDir ? `${targetDir}/${newName}` : newName;
    if (entry.editable) {
      const res = await fetch(`/api/servers/${server.id}/filemanager/content?path=${encodeURIComponent(entry.path)}`);
      const data: { content: string } = await res.json();
      await fetch(`/api/servers/${server.id}/filemanager?path=${encodeURIComponent(newPath)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: data.content }),
      });
      if (op === "cut") await fetch(`/api/servers/${server.id}/filemanager?path=${encodeURIComponent(entry.path)}`, { method: "DELETE" });
    }
    if (op === "cut") setFileClipboard(null);
    refreshFileTree();
  }

  function downloadFile(entry: FileEntry) {
    if (!server?.id) return;
    fetch(`/api/servers/${server.id}/filemanager/content?path=${encodeURIComponent(entry.path)}`)
      .then((r) => r.json())
      .then((d: { content: string }) => {
        const blob = new Blob([d.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = entry.name; a.click();
        URL.revokeObjectURL(url);
      });
  }

  const isPaperLike = server?.serverType === "paper" || server?.serverType === "purpur";
  const loader = (server?.serverType && LOADER_TYPES.has(server.serverType))
    ? server.serverType as "forge" | "fabric" | "neoforge" | "quilt"
    : undefined;
  const gameVersion = server?.gameVersion;

  const { data: searchData, isFetching: searchFetching } = useSearchMods(
    { query: debouncedQuery || "optimization", source: searchSource, loader, gameVersion, limit: 20 },
    { query: { enabled: activeTab === "mods" } as AnyQueryOpts }
  );

  const { data: featuredData } = useGetFeaturedMods(
    { loader, gameVersion },
    { query: { enabled: activeTab === "mods" && !debouncedQuery } as AnyQueryOpts }
  );

  // Plugin search hooks
  const { data: pluginSearchData, isFetching: pluginSearchFetching } = useSearchPlugins(
    { query: debouncedPluginQuery || "optimization", source: pluginSource, limit: 20 },
    { query: { enabled: activeTab === "plugins" } as AnyQueryOpts }
  );

  const { data: featuredPluginData } = useGetFeaturedPlugins(
    { query: { enabled: activeTab === "plugins" && !debouncedPluginQuery } as AnyQueryOpts }
  );

  // Debounce plugin query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPluginQuery(pluginQuery), 400);
    return () => clearTimeout(t);
  }, [pluginQuery]);

  // Update search results when data changes
  useEffect(() => {
    if (searchData) setAccSearchResults(searchData);
  }, [searchData]);

  useEffect(() => {
    if (pluginSearchData) setAccPluginResults(pluginSearchData);
  }, [pluginSearchData]);

  const installedIds = new Set(installedMods.map((m) => m.modId));

  // Filter: hide already-installed, filter by loader+version compatibility
  const rawResults = debouncedQuery ? accSearchResults : (featuredData ?? []);
  const displayedResults = rawResults.filter((m) => {
    if (installedIds.has(m.id)) return false;
    if (loader && (m.loaders?.length ?? 0) > 0 && !m.loaders?.includes(loader)) return false;
    if (gameVersion && (m.gameVersions?.length ?? 0) > 0 && !m.gameVersions?.includes(gameVersion)) return false;
    return true;
  });

  // Filter plugins: hide already-installed
  const rawPluginResults = debouncedPluginQuery ? accPluginResults : (featuredPluginData ?? []);
  const displayedPlugins = rawPluginResults.filter((p) => !installedIds.has(p.id));

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverLogs?.lines, autoScroll]);

  const handleLogsScroll = useCallback(() => {
    const el = logsContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const tabs: Tab[] = isPaperLike
      ? ["overview", "plugins", "logs", "console", "files", "settings"]
      : ["overview", "mods", "logs", "console", "files", "settings"];
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = parseInt(e.key) - 1;
      if (n >= 0 && n < tabs.length) setActiveTab(tabs[n]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPaperLike]);

  const startServer = useStartServer({ mutation: {
    onSuccess: () => qc.invalidateQueries({ queryKey: getGetServerQueryKey(serverId) }),
  }});
  const stopServer = useStopServer({ mutation: {
    onSuccess: () => qc.invalidateQueries({ queryKey: getGetServerQueryKey(serverId) }),
  }});
  const deleteServer = useDeleteServer({ mutation: {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListServersQueryKey() });
      qc.invalidateQueries({ queryKey: getGetServersSummaryQueryKey() });
      navigate("/");
    },
  }});
  const installMod = useInstallMod({ mutation: {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListServerModsQueryKey(server!.id) });
      qc.invalidateQueries({ queryKey: getGetServerQueryKey(serverId) });
    },
  }});
  const uninstallMod = useUninstallMod({ mutation: {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListServerModsQueryKey(server!.id) });
      qc.invalidateQueries({ queryKey: getGetServerQueryKey(serverId) });
      qc.invalidateQueries({ queryKey: getListModUpdatesQueryKey(server!.id) });
    },
  }});
  const updateServer = useUpdateServer({ mutation: {
    onSuccess: () => qc.invalidateQueries({ queryKey: getGetServerQueryKey(serverId) }),
  }});

  async function resolveBestVersion(source: string, modId: string): Promise<string | null> {
    try {
      const params = new URLSearchParams();
      if (loader) params.set("loader", loader);
      if (gameVersion) params.set("gameVersion", gameVersion);
      const r = await fetch(`/api/mods/${source}/${modId}/bestVersion?${params}`);
      if (!r.ok) return null;
      const d = (await r.json()) as { fileName: string } | null;
      return d?.fileName ?? null;
    } catch {
      return null;
    }
  }

  async function handleInstall(mod: ModSearchResult) {
    if (!server || installedIds.has(mod.id)) return;
    setInstallingModId(mod.id);
    try {
      const version = await resolveBestVersion(mod.source, mod.id);
      await installMod.mutateAsync({
        id: server.id,
        data: {
          modId: mod.id,
          modName: mod.name,
          modVersion: version ?? mod.latestVersion ?? "unknown",
          source: mod.source,
          iconUrl: mod.iconUrl ?? undefined,
        },
      });
      setSelectedMod(null);
    } finally {
      setInstallingModId(null);
    }
  }

  async function handleUpdateMod(mod: InstalledMod) {
    if (!server) return;
    setInstallingModId(mod.modId);
    try {
      const version = await resolveBestVersion(mod.source, mod.modId);
      if (!version) return;
      await uninstallMod.mutateAsync({ id: server.id, modId: mod.id });
      await installMod.mutateAsync({
        id: server.id,
        data: {
          modId: mod.modId,
          modName: mod.modName,
          modVersion: version,
          source: mod.source as "modrinth" | "curseforge",
          iconUrl: mod.iconUrl ?? undefined,
        },
      });
      qc.invalidateQueries({ queryKey: getListModUpdatesQueryKey(server.id) });
    } finally {
      setInstallingModId(null);
    }
  }

  async function handleUpdateAll() {
    if (!server) return;
    const modsToUpdate = installedMods.filter((m) =>
      modUpdates.find((u) => u.modId === m.modId && u.hasUpdate)
    );
    for (const mod of modsToUpdate) {
      await handleUpdateMod(mod);
    }
  }

  async function handleRemoveMod(mod: InstalledMod) {
    if (!server) return;
    setRemovingModId(mod.id);
    try {
      await uninstallMod.mutateAsync({ id: server.id, modId: mod.id });
    } finally {
      setRemovingModId(null);
    }
  }

  async function handleInstallPlugin(plugin: PluginSearchResult) {
    if (!server || installedIds.has(plugin.id)) return;
    setInstallingPluginId(plugin.id);
    try {
      await installMod.mutateAsync({
        id: server.id,
        data: {
          modId: plugin.id,
          modName: plugin.name,
          modVersion: plugin.latestVersion ?? "latest",
          source: plugin.source,
          iconUrl: plugin.iconUrl ?? undefined,
          category: "plugin",
        },
      });
    } finally {
      setInstallingPluginId(null);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !server) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await fetch(`/api/servers/${server.id}/files`, { method: "POST", body: fd });
      qc.invalidateQueries({ queryKey: getListServerModsQueryKey(server.id) });
      qc.invalidateQueries({ queryKey: getGetServerQueryKey(serverId) });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveSettings() {
    if (!server) return;
    setSettingsError(null);
    try {
      await updateServer.mutateAsync({
        id: server.id,
        data: {
          name: settingsForm.name,
          description: settingsForm.description || undefined,
          serverType: settingsForm.serverType,
          gameVersion: settingsForm.gameVersion,
          loaderVersion: settingsForm.loaderVersion || undefined,
          maxPlayers: settingsForm.maxPlayers,
          motd: settingsForm.motd || undefined,
          memory: settingsForm.memory,
        },
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save");
      setTimeout(() => setSettingsError(null), 3000);
    }
  }

  async function handleSaveProperties() {
    if (!server) return;
    await updateServer.mutateAsync({ id: server.id, data: { serverProperties: propertiesText } });
    setPropertiesSaved(true);
    setTimeout(() => setPropertiesSaved(false), 2500);
  }

  const updatesCount = modUpdates.filter((u) => u.hasUpdate).length;

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-center">
        <p className="font-mono text-muted-foreground">Server not found.</p>
        <Link href="/"><Button variant="outline" size="sm" className="mt-4 font-mono">← Back</Button></Link>
      </div>
    );
  }

  const isTransitioning = server.status === "starting" || server.status === "stopping";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky header + tabs */}
      <div className="border-b border-border bg-card/50 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href="/">
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </Link>
              <div className="w-px h-4 bg-border" />
              <span className="font-mono font-bold text-sm">{server.name}</span>
              <StatusBadge status={server.status} />
            </div>
            <div className="flex items-center gap-2">
              {server.port && (
                <button
                  className="hidden sm:flex items-center gap-1.5 font-mono text-xs px-2 py-1 rounded border border-border bg-card hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
                  title="Click to copy server address"
                  onClick={() => {
                    const addr = `${window.location.hostname}:${server.port}`;
                    navigator.clipboard.writeText(addr).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                >
                  {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                  <span>{window.location.hostname}:{server.port}</span>
                </button>
              )}
              {!server.port && (
                <span className="hidden sm:flex items-center gap-1.5 font-mono text-xs px-2 py-1 rounded border border-border bg-card text-muted-foreground/50">
                  <Globe className="w-3 h-3" />
                  {server.status === "stopped" ? "Start to get address" : "Allocating port…"}
                </span>
              )}
              {server.status === "running" ? (
                <Button size="sm" variant="outline" className="font-mono text-xs gap-1"
                  onClick={() => stopServer.mutate({ id: server.id })}
                  disabled={isTransitioning || stopServer.isPending}>
                  <Square className="w-3.5 h-3.5" />Stop
                </Button>
              ) : (
                <Button size="sm" className="font-mono text-xs gap-1"
                  onClick={() => startServer.mutate({ id: server.id })}
                  disabled={isTransitioning || startServer.isPending}>
                  {isTransitioning
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Play className="w-3.5 h-3.5" />}
                  {server.status === "starting" ? "Starting..." : server.status === "stopping" ? "Stopping..." : "Start"}
                </Button>
              )}
              <Button size="sm" variant="destructive" className="font-mono text-xs"
                onClick={() => { if (confirm("Delete this server?")) deleteServer.mutate({ id: server.id }); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto">
            {(isPaperLike
              ? (["overview", "plugins", "logs", "console", "files", "settings"] as Tab[])
              : (["overview", "mods", "logs", "console", "files", "settings"] as Tab[])
            ).map((tab, i) => {
              const Icon = tab === "overview" ? Server : tab === "mods" ? Package : tab === "plugins" ? Plug : tab === "logs" ? Terminal : tab === "console" ? ChevronRight : tab === "files" ? HardDrive : Settings2;
              return (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`relative px-3 py-2 text-xs font-mono border-b-2 transition-colors ${
                    activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  <Icon className="w-3.5 h-3.5 inline mr-1" />
                  {tab}
                  <span className="ml-1.5 text-muted-foreground/50">[{i + 1}]</span>
                  {tab === "overview" && updatesCount > 0 && (
                    <span className="absolute -top-1 -right-0.5 w-4 h-4 rounded-full bg-yellow-500 text-background text-[10px] font-bold flex items-center justify-center">
                      {updatesCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ──────────── OVERVIEW ──────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Cpu, label: "Loader", value: server.serverType + (server.loaderVersion ? ` ${server.loaderVersion}` : "") },
                { icon: Globe, label: "MC Version", value: server.gameVersion },
                { icon: Users, label: "Players", value: `${server.onlinePlayers}/${server.maxPlayers}` },
                { icon: HardDrive, label: "Memory", value: server.memory >= 1024 ? `${server.memory / 1024}GB` : `${server.memory}MB` },
              ].map(({ icon: Icon, label, value }) => (
                <Card key={label} className="p-3 bg-card border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs text-muted-foreground">{label}</span>
                  </div>
                  <div className="font-mono text-sm font-semibold">{value}</div>
                </Card>
              ))}
            </div>

            {/* Installed Mods / Plugins */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-mono text-sm font-semibold flex items-center gap-1.5">
                  {isPaperLike ? <Plug className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                  {isPaperLike ? "Installed Plugins" : "Installed Mods"}
                  <span className="text-muted-foreground font-normal">({installedMods.length})</span>
                </h2>
                <div className="flex items-center gap-2">
                  {updatesCount > 0 && (
                    <Button size="sm" variant="outline"
                      className="font-mono text-xs gap-1 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                      onClick={handleUpdateAll} disabled={installingModId !== null}>
                      <RefreshCw className="w-3.5 h-3.5" />Update All ({updatesCount})
                    </Button>
                  )}
                  <input ref={fileInputRef} type="file" accept=".jar,.zip" className="hidden" onChange={handleFileUpload} />
                  <Button size="sm" variant="outline" className="font-mono text-xs gap-1"
                    onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
                    {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Upload .jar
                  </Button>
                </div>
              </div>

              {installedMods.length === 0 ? (
                <Card className="p-6 border-dashed text-center">
                  {isPaperLike ? <Plug className="w-8 h-8 text-muted-foreground mx-auto mb-2" /> : <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />}
                  <p className="font-mono text-sm text-muted-foreground">{isPaperLike ? "No plugins installed" : "No mods installed"}</p>
                  <p className="font-mono text-xs text-muted-foreground/60 mt-1">Use the {isPaperLike ? "Plugins" : "Mods"} tab to search and install</p>
                </Card>
              ) : (
                <div className="space-y-1.5">
                  {installedMods.map((mod) => {
                    const upd = modUpdates.find((u) => u.modId === mod.modId);
                    const hasUpdate = upd?.hasUpdate ?? false;
                    const isUpdating = installingModId === mod.modId;
                    const isRemoving = removingModId === mod.id;
                    return (
                      <div key={mod.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                        hasUpdate ? "border-yellow-500/30 bg-yellow-500/5" : "border-border bg-card"
                      }`}>
                        {mod.iconUrl
                          ? <img src={mod.iconUrl} className="w-8 h-8 rounded shrink-0 object-cover" alt="" />
                          : <div className="w-8 h-8 bg-secondary rounded shrink-0 flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-sm truncate">{mod.modName}</span>
                            <SourceBadge source={mod.source} />
                            {hasUpdate && (
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">update</span>
                            )}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground mt-0.5">
                            {mod.modVersion}
                            {hasUpdate && upd?.latestVersion && (
                              <span className="ml-2 text-yellow-400/70">→ {upd.latestVersion}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasUpdate && (
                            <Button size="sm" variant="outline"
                              className="font-mono text-xs h-7 px-2 gap-1 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                              onClick={() => handleUpdateMod(mod)} disabled={isUpdating || isRemoving}>
                              {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Update
                            </Button>
                          )}
                          <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => handleRemoveMod(mod)} disabled={isRemoving || isUpdating}>
                            {isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Server Properties */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-mono text-sm font-semibold flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4" />server.properties
                </h2>
                <Button size="sm" variant="outline" className="font-mono text-xs gap-1"
                  onClick={handleSaveProperties} disabled={updateServer.isPending}>
                  {propertiesSaved ? <Check className="w-3.5 h-3.5 text-primary" /> : <Save className="w-3.5 h-3.5" />}
                  {propertiesSaved ? "Saved!" : "Save"}
                </Button>
              </div>
              <Textarea
                value={propertiesText}
                onChange={(e) => setPropertiesText(e.target.value)}
                className="font-mono text-xs bg-background border-border min-h-[280px] resize-y"
                spellCheck={false}
              />
            </div>
          </div>
        )}

        {/* ──────────── MODS ──────────── */}
        {activeTab === "mods" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${searchSource === "modrinth" ? "Modrinth" : "CurseForge"} for ${server.gameVersion}${loader ? ` + ${loader}` : ""}...`}
                  className="pl-9 font-mono text-sm bg-background border-border"
                  autoFocus
                />
                {searchQuery && (
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearchQuery("")}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex rounded-lg overflow-hidden border border-border">
                {(["modrinth", "curseforge"] as const).map((src) => (
                  <button key={src} onClick={() => setSearchSource(src)}
                    className={`px-3 py-2 font-mono text-xs transition-colors ${
                      searchSource === src
                        ? src === "modrinth" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"
                        : "text-muted-foreground hover:text-foreground bg-card"
                    }`}>
                    {src === "modrinth" ? "Modrinth" : "CurseForge"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>Compatible with</span>
              <span className="px-1.5 py-0.5 rounded bg-secondary border border-border">{server.gameVersion}</span>
              {loader && <span className="px-1.5 py-0.5 rounded bg-secondary border border-border">{loader}</span>}
              <span>· installed mods hidden</span>
            </div>

            {searchFetching && accSearchResults.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 p-3 border border-border rounded-lg">
                    <Skeleton className="w-12 h-12 rounded shrink-0" />
                    <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-full" /></div>
                  </div>
                ))}
              </div>
            ) : displayedResults.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-mono text-sm text-muted-foreground">
                  {searchFetching ? "Searching..." : "No compatible mods found"}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {displayedResults.map((mod) => {
                    const isInstalling = installingModId === mod.id;
                    return (
                      <div key={mod.id}
                        className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card hover:bg-secondary/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedMod(mod)}>
                        {mod.iconUrl
                          ? <img src={mod.iconUrl} className="w-12 h-12 rounded shrink-0 object-cover" alt="" />
                          : <div className="w-12 h-12 bg-secondary rounded shrink-0 flex items-center justify-center"><Package className="w-6 h-6 text-muted-foreground" /></div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-semibold text-sm">{mod.name}</span>
                            <SourceBadge source={mod.source} />
                          </div>
                          <p className="font-mono text-xs text-muted-foreground mt-0.5 line-clamp-2">{mod.description}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="font-mono text-xs text-muted-foreground">by {mod.author}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {(mod.downloadCount / 1_000_000).toFixed(1)}M downloads
                            </span>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="font-mono text-xs gap-1 shrink-0"
                          onClick={(e) => { e.stopPropagation(); handleInstall(mod); }}
                          disabled={isInstalling}>
                          {isInstalling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          Install
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ──────────── PLUGINS ──────────── */}
        {activeTab === "plugins" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={pluginQuery}
                  onChange={(e) => setPluginQuery(e.target.value)}
                  placeholder={`Search ${pluginSource === "modrinth" ? "Modrinth" : "Hangar"} plugins...`}
                  className="pl-9 font-mono text-sm bg-background border-border"
                  autoFocus
                />
                {pluginQuery && (
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setPluginQuery("")}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex rounded-lg overflow-hidden border border-border">
                {(["modrinth", "hangar"] as const).map((src) => (
                  <button key={src} onClick={() => setPluginSource(src)}
                    className={`px-3 py-2 font-mono text-xs transition-colors ${
                      pluginSource === src
                        ? src === "modrinth" ? "bg-green-500/20 text-green-400" : "bg-sky-500/20 text-sky-400"
                        : "text-muted-foreground hover:text-foreground bg-card"
                    }`}>
                    {src === "modrinth" ? "Modrinth" : "Hangar"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>Plugins for</span>
              <span className="px-1.5 py-0.5 rounded bg-secondary border border-border capitalize">{server.serverType}</span>
              <span>· installed plugins hidden</span>
            </div>

            {pluginSearchFetching && accPluginResults.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 p-3 border border-border rounded-lg">
                    <Skeleton className="w-12 h-12 rounded shrink-0" />
                    <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-full" /></div>
                  </div>
                ))}
              </div>
            ) : displayedPlugins.length === 0 ? (
              <div className="text-center py-12">
                <Plug className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-mono text-sm text-muted-foreground">
                  {pluginSearchFetching ? "Searching..." : "No plugins found"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedPlugins.map((plugin) => {
                  const isInstalling = installingPluginId === plugin.id;
                  return (
                    <div key={plugin.id}
                      className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card hover:bg-secondary/30 transition-colors">
                      {plugin.iconUrl
                        ? <img src={plugin.iconUrl} className="w-12 h-12 rounded shrink-0 object-cover" alt="" />
                        : <div className="w-12 h-12 bg-secondary rounded shrink-0 flex items-center justify-center"><Plug className="w-6 h-6 text-muted-foreground" /></div>
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-semibold text-sm">{plugin.name}</span>
                          <SourceBadge source={plugin.source} />
                        </div>
                        <p className="font-mono text-xs text-muted-foreground mt-0.5 line-clamp-2">{plugin.description}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="font-mono text-xs text-muted-foreground">by {plugin.author}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {plugin.downloadCount >= 1_000_000
                              ? `${(plugin.downloadCount / 1_000_000).toFixed(1)}M`
                              : plugin.downloadCount >= 1_000
                              ? `${(plugin.downloadCount / 1_000).toFixed(1)}K`
                              : plugin.downloadCount} downloads
                          </span>
                          {plugin.websiteUrl && (
                            <a href={plugin.websiteUrl} target="_blank" rel="noreferrer"
                              className="font-mono text-xs text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}>
                              View
                            </a>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="font-mono text-xs gap-1 shrink-0"
                        onClick={() => handleInstallPlugin(plugin)}
                        disabled={isInstalling}>
                        {isInstalling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Install
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ──────────── LOGS ──────────── */}
        {activeTab === "logs" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm text-muted-foreground">Server Console</h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="font-mono text-xs gap-1"
                  onClick={() => qc.invalidateQueries({ queryKey: getGetServerLogsQueryKey(server.id) })}>
                  <RefreshCw className="w-3.5 h-3.5" />Refresh
                </Button>
                <button onClick={() => setAutoScroll((p) => !p)}
                  className={`font-mono text-xs px-2 py-1 rounded border transition-colors ${
                    autoScroll ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}>
                  {autoScroll ? "auto-scroll on" : "auto-scroll off"}
                </button>
              </div>
            </div>
            <div
              ref={logsContainerRef}
              onScroll={handleLogsScroll}
              className="h-[calc(100vh-220px)] overflow-y-auto rounded-lg border border-border bg-black/80 p-3 font-mono text-xs">
              {!serverLogs?.lines || serverLogs.lines.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Terminal className="w-8 h-8 mr-2" />
                  {server.status === "running" ? "Waiting for logs..." : "Server is not running"}
                </div>
              ) : (
                serverLogs.lines.map((line, i) => (
                  <div key={i} className={`leading-5 py-0.5 ${
                    line.includes("ERROR") || line.includes("Exception") ? "text-red-400"
                      : line.includes("WARN") ? "text-yellow-400"
                      : line.includes("INFO") ? "text-green-300/80"
                      : "text-gray-300"
                  }`}>
                    {line}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* ──────────── FILES ──────────── */}
        {activeTab === "files" && (
          <div className="flex gap-4 h-[calc(100vh-220px)]" onClick={() => setContextMenu(null)}>
            {/* Context menu */}
            {contextMenu && (
              <div
                ref={contextMenuRef}
                className="fixed z-50 min-w-44 bg-popover border border-border rounded-lg shadow-xl py-1 text-xs font-mono"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onClick={(e) => e.stopPropagation()}
              >
                {contextMenu.entry.type === "file" && (
                  <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                    onClick={() => { setSelectedFile(contextMenu.entry); setFileSaved(false); setContextMenu(null); }}>
                    <span>📄</span> Open
                  </button>
                )}
                {contextMenu.entry.type === "dir" && (
                  <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                    onClick={() => { setNewFileDialogDir(contextMenu.entry.path); setNewFileName(""); setContextMenu(null); }}>
                    <Plus className="w-3.5 h-3.5" /> New File Here
                  </button>
                )}
                {contextMenu.entry.type === "file" && contextMenu.entry.editable && (
                  <>
                    <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                      onClick={() => { setFileClipboard({ op: "copy", entry: contextMenu.entry }); setContextMenu(null); }}>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                    <button className={`w-full px-3 py-1.5 text-left flex items-center gap-2 ${contextMenu.entry.deletable ? "hover:bg-secondary/60" : "opacity-40 cursor-not-allowed"}`}
                      onClick={() => { if (contextMenu.entry.deletable) { setFileClipboard({ op: "cut", entry: contextMenu.entry }); setContextMenu(null); } }}>
                      <span>✂️</span> Cut
                    </button>
                  </>
                )}
                {fileClipboard && contextMenu.entry.type === "dir" && (
                  <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                    onClick={() => { handleFilePaste(contextMenu.entry.path); setContextMenu(null); }}>
                    <span>📋</span> Paste
                  </button>
                )}
                {fileClipboard && contextMenu.entry.type === "file" && !contextMenu.entry.path.includes("/") && (
                  <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                    onClick={() => { handleFilePaste(""); setContextMenu(null); }}>
                    <span>📋</span> Paste
                  </button>
                )}
                {contextMenu.entry.type === "file" && contextMenu.entry.editable && (
                  <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                    onClick={() => { downloadFile(contextMenu.entry); setContextMenu(null); }}>
                    <span>⬇️</span> Download
                  </button>
                )}
                <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(contextMenu.entry.path).catch(() => {});
                    setContextMenu(null);
                  }}>
                  <Copy className="w-3.5 h-3.5" /> Copy Path
                </button>
                {contextMenu.entry.deletable && (
                  <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                    onClick={() => { setRenameEntry(contextMenu.entry); setRenameValue(contextMenu.entry.name); setContextMenu(null); }}>
                    <span>✏️</span> Rename
                  </button>
                )}
                <div className="mx-1 my-1 border-t border-border" />
                {contextMenu.entry.deletable ? (
                  <button className="w-full px-3 py-1.5 text-left hover:bg-destructive/20 text-destructive flex items-center gap-2"
                    onClick={() => { handleFileDelete(contextMenu.entry); setContextMenu(null); }}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                ) : (
                  <button className="w-full px-3 py-1.5 text-left opacity-40 cursor-not-allowed flex items-center gap-2 text-muted-foreground" disabled>
                    <Trash2 className="w-3.5 h-3.5" /> Delete (system file)
                  </button>
                )}
                <div className="mx-1 my-1 border-t border-border" />
                <button className="w-full px-3 py-1.5 text-left hover:bg-secondary/60 flex items-center gap-2"
                  onClick={() => { setPropertiesEntry(contextMenu.entry); setContextMenu(null); }}>
                  <Settings2 className="w-3.5 h-3.5" /> Properties
                </button>
              </div>
            )}

            {/* Rename dialog */}
            {renameEntry && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRenameEntry(null)}>
                <div className="bg-card border border-border rounded-xl p-5 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-mono text-sm font-semibold">Rename "{renameEntry.name}"</h3>
                  <Input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") setRenameEntry(null); }}
                    className="font-mono text-sm" />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={() => setRenameEntry(null)}>Cancel</Button>
                    <Button size="sm" className="font-mono text-xs" onClick={handleRenameSubmit}>Rename</Button>
                  </div>
                </div>
              </div>
            )}

            {/* New file dialog */}
            {newFileDialogDir !== null && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setNewFileDialogDir(null)}>
                <div className="bg-card border border-border rounded-xl p-5 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-mono text-sm font-semibold">New File{newFileDialogDir ? ` in ${newFileDialogDir}/` : ""}</h3>
                  <Input autoFocus value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleNewFileSubmit(newFileDialogDir); if (e.key === "Escape") setNewFileDialogDir(null); }}
                    className="font-mono text-sm" placeholder="filename.txt" />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={() => setNewFileDialogDir(null)}>Cancel</Button>
                    <Button size="sm" className="font-mono text-xs" onClick={() => handleNewFileSubmit(newFileDialogDir)}>Create</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Properties modal */}
            {propertiesEntry && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPropertiesEntry(null)}>
                <div className="bg-card border border-border rounded-xl p-5 w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{propertiesEntry.type === "dir" ? "📁" : propertiesEntry.name.endsWith(".jar") ? "📦" : "📄"}</span>
                    <h3 className="font-mono text-sm font-semibold truncate">{propertiesEntry.name}</h3>
                  </div>
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Path</span><span className="text-right">{propertiesEntry.path}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{propertiesEntry.type === "dir" ? "Directory" : propertiesEntry.name.split(".").pop()?.toUpperCase() ?? "File"}</span></div>
                    {propertiesEntry.size !== undefined && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Size</span>
                        <span>{propertiesEntry.size > 1_000_000 ? `${(propertiesEntry.size / 1_000_000).toFixed(2)} MB` : propertiesEntry.size > 1000 ? `${(propertiesEntry.size / 1024).toFixed(1)} KB` : `${propertiesEntry.size} B`}</span>
                      </div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">Editable</span><span>{propertiesEntry.editable ? "Yes" : "No (read-only)"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Deletable</span><span>{propertiesEntry.deletable ? "Yes" : "No (protected)"}</span></div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="outline" className="font-mono text-xs" onClick={() => setPropertiesEntry(null)}>Close</Button>
                  </div>
                </div>
              </div>
            )}

            {/* File tree */}
            <div className="w-56 shrink-0 border border-border rounded-lg bg-card overflow-y-auto">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Files</span>
                <div className="flex gap-1">
                  <button title="New file" className="p-0.5 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => { e.stopPropagation(); setNewFileDialogDir(""); setNewFileName(""); }}>
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button title="Refresh" className="p-0.5 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => { e.stopPropagation(); refreshFileTree(); }}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {!fileTreeLoaded ? (
                <div className="p-3 space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
                </div>
              ) : (
                <div className="py-1">
                  {(() => {
                    const childFiles = (dir: string) => fileTree.filter((f) => f.path.startsWith(dir + "/") && !f.path.slice(dir.length + 1).includes("/"));
                    const rootEntries = fileTree.filter((f) => !f.path.includes("/"));

                    function FileRow({ entry, depth }: { entry: FileEntry; depth: number }) {
                      const isDir = entry.type === "dir";
                      const isExpanded = expandedDirs.has(entry.path);
                      const isSelected = selectedFile?.path === entry.path;
                      const isCut = fileClipboard?.op === "cut" && fileClipboard.entry.path === entry.path;
                      const ext = entry.name.split(".").pop() ?? "";
                      const icon = isDir ? "📁" : ext === "jar" ? "📦" : ext === "json" ? "📋" : ext === "log" ? "📜" : ext === "txt" ? "📄" : "📄";
                      return (
                        <>
                          <button
                            className={`w-full text-left flex items-center gap-1.5 px-2 py-1 font-mono text-xs transition-colors hover:bg-secondary/50 ${isSelected ? "bg-primary/10 text-primary" : isCut ? "opacity-40 text-foreground" : "text-foreground"}`}
                            style={{ paddingLeft: `${8 + depth * 12}px` }}
                            onClick={() => {
                              if (isDir) {
                                setExpandedDirs((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path);
                                  return next;
                                });
                              } else {
                                setSelectedFile(entry);
                                setFileSaved(false);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ x: e.clientX, y: e.clientY, entry });
                            }}
                          >
                            <span className="text-[10px]">{isDir ? (isExpanded ? "▼" : "▶") : ""}</span>
                            <span>{icon}</span>
                            <span className="truncate">{entry.name}</span>
                            {!isDir && entry.size !== undefined && (
                              <span className="ml-auto text-muted-foreground/50 shrink-0">
                                {entry.size > 1_000_000 ? `${(entry.size / 1_000_000).toFixed(1)}MB` : `${Math.round(entry.size / 1024)}KB`}
                              </span>
                            )}
                          </button>
                          {isDir && isExpanded && childFiles(entry.path).map((c) => (
                            <FileRow key={c.path} entry={c} depth={depth + 1} />
                          ))}
                        </>
                      );
                    }

                    return (
                      <>
                        {rootEntries.map((f) => <FileRow key={f.path} entry={f} depth={0} />)}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* File content panel */}
            <div className="flex-1 min-w-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden"
              onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
              {!selectedFile ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <HardDrive className="w-10 h-10 mb-3 opacity-30" />
                  <p className="font-mono text-sm">Select a file to view or edit</p>
                  <p className="font-mono text-xs text-muted-foreground/50 mt-1">Right-click files in the tree for options</p>
                </div>
              ) : selectedFile.type === "dir" ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <span className="text-4xl mb-3">📁</span>
                  <p className="font-mono text-sm">{selectedFile.path}/</p>
                  <p className="font-mono text-xs text-muted-foreground/60 mt-1">{fileTree.filter((f) => f.path.startsWith(selectedFile.path + "/") && !f.path.slice(selectedFile.path.length + 1).includes("/")).length} items</p>
                </div>
              ) : !selectedFile.editable ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <span className="text-4xl mb-3">📦</span>
                  <p className="font-mono text-sm">{selectedFile.name}</p>
                  <p className="font-mono text-xs text-muted-foreground/60 mt-1">
                    Binary file · {selectedFile.size !== undefined ? (selectedFile.size > 1_000_000 ? `${(selectedFile.size / 1_000_000).toFixed(1)} MB` : `${Math.round((selectedFile.size ?? 0) / 1024)} KB`) : ""}
                  </p>
                  {selectedFile.deletable && (
                    <Button size="sm" variant="destructive" className="font-mono text-xs mt-4 gap-1"
                      onClick={() => handleFileDelete(selectedFile)}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
                    <span className="font-mono text-xs text-muted-foreground">{selectedFile.path}</span>
                    <div className="flex gap-1.5 items-center">
                      <Button size="sm" variant="ghost" className="font-mono text-xs gap-1 h-7 text-muted-foreground"
                        onClick={() => downloadFile(selectedFile)}>
                        <span className="text-xs">⬇️</span> Download
                      </Button>
                      <Button size="sm" variant="outline" className="font-mono text-xs gap-1 h-7"
                        onClick={handleFileSave} disabled={fileSaving}>
                        {fileSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : fileSaved ? <Check className="w-3.5 h-3.5 text-primary" /> : <Save className="w-3.5 h-3.5" />}
                        {fileSaved ? "Saved!" : "Save"}
                      </Button>
                    </div>
                  </div>
                  {fileContentLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="flex-1 font-mono text-xs bg-background border-0 rounded-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      spellCheck={false}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ──────────── CONSOLE ──────────── */}
        {activeTab === "console" && (
          <div className="flex flex-col h-[calc(100vh-220px)] border border-border rounded-lg bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="font-mono text-xs text-muted-foreground">Server Console</span>
              {server?.status !== "running" && (
                <span className="font-mono text-xs text-yellow-400/80">Server must be running to send commands</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto bg-background p-3 font-mono text-xs leading-relaxed"
              ref={consoleEndRef as unknown as React.RefObject<HTMLDivElement>}
              onScroll={() => {
                const el = (consoleEndRef as unknown as React.RefObject<HTMLDivElement>).current;
                if (el) { /* keep console scroll natural */ }
              }}>
              {!serverLogs?.lines?.length ? (
                <div className="text-muted-foreground/50 italic">No output yet. Start the server to see logs.</div>
              ) : (
                serverLogs.lines.map((line, i) => {
                  const isWarn = line.includes("/WARN");
                  const isError = line.includes("/ERROR") || line.includes("Exception") || line.includes("FATAL");
                  const isConsoleCmd = line.includes("[CONSOLE]");
                  return (
                    <div key={i} className={`whitespace-pre-wrap break-all ${
                      isConsoleCmd ? "text-primary font-semibold" :
                      isError ? "text-destructive" :
                      isWarn ? "text-yellow-400" :
                      "text-muted-foreground"
                    }`}>{line}</div>
                  );
                })
              )}
              <div ref={consoleEndRef} />
            </div>
            <div className="shrink-0 border-t border-border flex items-center gap-2 px-3 py-2 bg-card">
              <span className="font-mono text-xs text-primary shrink-0">{">"}</span>
              <Input
                ref={consoleInputRef}
                value={consoleInput}
                onChange={(e) => { setConsoleInput(e.target.value); setCmdHistoryIdx(-1); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && consoleInput.trim() && server?.status === "running") {
                    e.preventDefault();
                    const cmd = consoleInput.trim();
                    setConsoleSending(true);
                    fetch(`/api/servers/${server.id}/command`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ command: cmd }),
                    }).finally(() => setConsoleSending(false));
                    setCmdHistory((h) => [cmd, ...h].slice(0, 50));
                    setCmdHistoryIdx(-1);
                    setConsoleInput("");
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const nextIdx = Math.min(cmdHistoryIdx + 1, cmdHistory.length - 1);
                    setCmdHistoryIdx(nextIdx);
                    if (cmdHistory[nextIdx]) setConsoleInput(cmdHistory[nextIdx]);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const nextIdx = Math.max(cmdHistoryIdx - 1, -1);
                    setCmdHistoryIdx(nextIdx);
                    setConsoleInput(nextIdx === -1 ? "" : cmdHistory[nextIdx] ?? "");
                  }
                }}
                className="flex-1 font-mono text-xs bg-background border-border h-8 focus-visible:ring-0"
                placeholder={server?.status === "running" ? "Type a command... (Enter to send, ↑↓ history)" : "Server offline"}
                disabled={server?.status !== "running" || consoleSending}
                spellCheck={false}
                autoComplete="off"
              />
              <Button size="sm" variant="outline" className="font-mono text-xs h-8 gap-1 shrink-0"
                disabled={!consoleInput.trim() || server?.status !== "running" || consoleSending}
                onClick={() => {
                  const cmd = consoleInput.trim();
                  if (!cmd || !server) return;
                  setConsoleSending(true);
                  fetch(`/api/servers/${server.id}/command`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ command: cmd }),
                  }).finally(() => setConsoleSending(false));
                  setCmdHistory((h) => [cmd, ...h].slice(0, 50));
                  setCmdHistoryIdx(-1);
                  setConsoleInput("");
                }}>
                {consoleSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Run
              </Button>
            </div>
          </div>
        )}

        {/* ──────────── SETTINGS ──────────── */}
        {activeTab === "settings" && (
          <div className="max-w-xl space-y-6">
            <div>
              <h2 className="font-mono text-sm font-semibold mb-1">Server Settings</h2>
              <p className="font-mono text-xs text-muted-foreground">Changes take effect on next restart.</p>
            </div>

            <div className="space-y-3">
              <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider">General</h3>
              <div className="space-y-2">
                <label className="font-mono text-xs">Server Name</label>
                <Input value={settingsForm.name} onChange={(e) => setSettingsForm((p) => ({ ...p, name: e.target.value }))}
                  className="font-mono text-sm bg-background border-border" />
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs">Description</label>
                <Input value={settingsForm.description} onChange={(e) => setSettingsForm((p) => ({ ...p, description: e.target.value }))}
                  className="font-mono text-sm bg-background border-border" placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs">MOTD</label>
                <Input value={settingsForm.motd} onChange={(e) => setSettingsForm((p) => ({ ...p, motd: e.target.value }))}
                  className="font-mono text-sm bg-background border-border" placeholder="A Minecraft Server" />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Server Type</h3>
              <div className="space-y-2">
                <label className="font-mono text-xs">Loader</label>
                <div className="flex flex-wrap gap-2">
                  {SERVER_TYPES.map((t) => (
                    <button key={t} onClick={() => setSettingsForm((p) => ({ ...p, serverType: t, loaderVersion: "" }))}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs border transition-colors ${
                        settingsForm.serverType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs">Minecraft Version</label>
                <select value={settingsForm.gameVersion}
                  onChange={(e) => setSettingsForm((p) => ({ ...p, gameVersion: e.target.value }))}
                  className="w-full font-mono text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground">
                  {/* Ensure current version is always selectable even if not in the fetched list */}
                  {settingsForm.gameVersion && !releaseVersions.find((v) => v.id === settingsForm.gameVersion) && (
                    <option key={settingsForm.gameVersion} value={settingsForm.gameVersion}>{settingsForm.gameVersion}</option>
                  )}
                  {releaseVersions.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
                </select>
              </div>
              {LOADER_TYPES.has(settingsForm.serverType) && (
                <div className="space-y-2">
                  <label className="font-mono text-xs">Loader Version</label>
                  {settingsLoaderLoading ? (
                    <div className="h-9 bg-background border border-border rounded-md animate-pulse" />
                  ) : settingsLoaderVersions.length === 0 ? (
                    <Input value={settingsForm.loaderVersion}
                      onChange={(e) => setSettingsForm((p) => ({ ...p, loaderVersion: e.target.value }))}
                      className="font-mono text-sm bg-background border-border"
                      placeholder="e.g. 0.15.11 (blank = latest)" />
                  ) : (
                    <Select value={settingsForm.loaderVersion} onValueChange={(v) => setSettingsForm((p) => ({ ...p, loaderVersion: v }))}>
                      <SelectTrigger className="font-mono text-sm bg-background border-border">
                        <SelectValue placeholder="Select loader version..." />
                      </SelectTrigger>
                      <SelectContent>
                        {settingsLoaderVersions.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="font-mono text-xs">
                            {v.id}{v.recommended ? " (recommended)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Resources</h3>
              <div className="space-y-2">
                <label className="font-mono text-xs">Memory</label>
                <div className="flex flex-wrap gap-2">
                  {MEMORY_OPTIONS.map((mem) => (
                    <button key={mem} onClick={() => setSettingsForm((p) => ({ ...p, memory: mem }))}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs border transition-colors ${
                        settingsForm.memory === mem ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}>{mem >= 1024 ? `${mem / 1024}GB` : `${mem}MB`}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs">Max Players</label>
                <Input type="number" min={1} max={100}
                  value={settingsForm.maxPlayers}
                  onChange={(e) => setSettingsForm((p) => ({ ...p, maxPlayers: parseInt(e.target.value) || 20 }))}
                  className="font-mono text-sm bg-background border-border w-32" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button className="font-mono text-sm gap-1.5" onClick={handleSaveSettings} disabled={updateServer.isPending}>
                {updateServer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : settingsSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {settingsSaved ? "Saved!" : "Save Settings"}
              </Button>
              <Button variant="ghost" className="font-mono text-sm gap-1.5"
                onClick={() => { setSettingsLoaded(false); }}>
                <RotateCcw className="w-4 h-4" />Reset
              </Button>
              {settingsError && (
                <span className="font-mono text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />{settingsError}
                </span>
              )}
            </div>

            <div className="border border-destructive/30 rounded-lg p-4 space-y-3">
              <h3 className="font-mono text-xs text-destructive uppercase tracking-wider">Danger Zone</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm">Delete Server</p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">Permanently delete this server and all data</p>
                </div>
                <Button variant="destructive" size="sm" className="font-mono text-xs gap-1"
                  onClick={() => { if (confirm("Are you sure? Cannot be undone.")) deleteServer.mutate({ id: server.id }); }}>
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mod Detail Modal */}
      {selectedMod && (
        <ModDetailModal
          mod={selectedMod}
          onClose={() => setSelectedMod(null)}
          onInstall={handleInstall}
          isInstalled={installedIds.has(selectedMod.id)}
          installing={installingModId === selectedMod.id}
          loader={loader}
          gameVersion={gameVersion}
        />
      )}
    </div>
  );
}
