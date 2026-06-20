import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { CheckSlugParams, ErrorResponse, GetFeaturedModsParams, HealthStatus, InstalledMod, ListLoaderVersionsParams, LoaderVersion, MinecraftServer, MinecraftVersion, ModInstallInput, ModSearchResult, ModUpdateInfo, SearchModsParams, ServerInput, ServerLogs, ServerUpdate, ServersSummary, SlugCheck } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * Returns server health status
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListServersUrl: () => string;
/**
 * @summary List all Minecraft servers
 */
export declare const listServers: (options?: RequestInit) => Promise<MinecraftServer[]>;
export declare const getListServersQueryKey: () => readonly ["/api/servers"];
export declare const getListServersQueryOptions: <TData = Awaited<ReturnType<typeof listServers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listServers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listServers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListServersQueryResult = NonNullable<Awaited<ReturnType<typeof listServers>>>;
export type ListServersQueryError = ErrorType<unknown>;
/**
 * @summary List all Minecraft servers
 */
export declare function useListServers<TData = Awaited<ReturnType<typeof listServers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listServers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateServerUrl: () => string;
/**
 * @summary Create a new Minecraft server
 */
export declare const createServer: (serverInput: ServerInput, options?: RequestInit) => Promise<MinecraftServer>;
export declare const getCreateServerMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createServer>>, TError, {
        data: BodyType<ServerInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createServer>>, TError, {
    data: BodyType<ServerInput>;
}, TContext>;
export type CreateServerMutationResult = NonNullable<Awaited<ReturnType<typeof createServer>>>;
export type CreateServerMutationBody = BodyType<ServerInput>;
export type CreateServerMutationError = ErrorType<ErrorResponse>;
/**
* @summary Create a new Minecraft server
*/
export declare const useCreateServer: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createServer>>, TError, {
        data: BodyType<ServerInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createServer>>, TError, {
    data: BodyType<ServerInput>;
}, TContext>;
export declare const getGetServerUrl: (id: number) => string;
/**
 * @summary Get a single server by ID
 */
export declare const getServer: (id: number, options?: RequestInit) => Promise<MinecraftServer>;
export declare const getGetServerQueryKey: (id: number) => readonly [`/api/servers/${number}`];
export declare const getGetServerQueryOptions: <TData = Awaited<ReturnType<typeof getServer>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getServer>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getServer>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetServerQueryResult = NonNullable<Awaited<ReturnType<typeof getServer>>>;
export type GetServerQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a single server by ID
 */
export declare function useGetServer<TData = Awaited<ReturnType<typeof getServer>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getServer>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateServerUrl: (id: number) => string;
/**
 * @summary Update server settings
 */
export declare const updateServer: (id: number, serverUpdate: ServerUpdate, options?: RequestInit) => Promise<MinecraftServer>;
export declare const getUpdateServerMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateServer>>, TError, {
        id: number;
        data: BodyType<ServerUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateServer>>, TError, {
    id: number;
    data: BodyType<ServerUpdate>;
}, TContext>;
export type UpdateServerMutationResult = NonNullable<Awaited<ReturnType<typeof updateServer>>>;
export type UpdateServerMutationBody = BodyType<ServerUpdate>;
export type UpdateServerMutationError = ErrorType<ErrorResponse>;
/**
* @summary Update server settings
*/
export declare const useUpdateServer: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateServer>>, TError, {
        id: number;
        data: BodyType<ServerUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateServer>>, TError, {
    id: number;
    data: BodyType<ServerUpdate>;
}, TContext>;
export declare const getDeleteServerUrl: (id: number) => string;
/**
 * @summary Delete a server
 */
export declare const deleteServer: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteServerMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteServer>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteServer>>, TError, {
    id: number;
}, TContext>;
export type DeleteServerMutationResult = NonNullable<Awaited<ReturnType<typeof deleteServer>>>;
export type DeleteServerMutationError = ErrorType<ErrorResponse>;
/**
* @summary Delete a server
*/
export declare const useDeleteServer: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteServer>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteServer>>, TError, {
    id: number;
}, TContext>;
export declare const getGetServerBySlugUrl: (slug: string) => string;
/**
 * @summary Get a server by its custom URL slug
 */
export declare const getServerBySlug: (slug: string, options?: RequestInit) => Promise<MinecraftServer>;
export declare const getGetServerBySlugQueryKey: (slug: string) => readonly [`/api/servers/by-slug/${string}`];
export declare const getGetServerBySlugQueryOptions: <TData = Awaited<ReturnType<typeof getServerBySlug>>, TError = ErrorType<ErrorResponse>>(slug: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getServerBySlug>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getServerBySlug>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetServerBySlugQueryResult = NonNullable<Awaited<ReturnType<typeof getServerBySlug>>>;
export type GetServerBySlugQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a server by its custom URL slug
 */
export declare function useGetServerBySlug<TData = Awaited<ReturnType<typeof getServerBySlug>>, TError = ErrorType<ErrorResponse>>(slug: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getServerBySlug>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getStartServerUrl: (id: number) => string;
/**
 * @summary Start a Minecraft server
 */
export declare const startServer: (id: number, options?: RequestInit) => Promise<MinecraftServer>;
export declare const getStartServerMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startServer>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof startServer>>, TError, {
    id: number;
}, TContext>;
export type StartServerMutationResult = NonNullable<Awaited<ReturnType<typeof startServer>>>;
export type StartServerMutationError = ErrorType<ErrorResponse>;
/**
* @summary Start a Minecraft server
*/
export declare const useStartServer: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startServer>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof startServer>>, TError, {
    id: number;
}, TContext>;
export declare const getStopServerUrl: (id: number) => string;
/**
 * @summary Stop a running Minecraft server
 */
export declare const stopServer: (id: number, options?: RequestInit) => Promise<MinecraftServer>;
export declare const getStopServerMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopServer>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof stopServer>>, TError, {
    id: number;
}, TContext>;
export type StopServerMutationResult = NonNullable<Awaited<ReturnType<typeof stopServer>>>;
export type StopServerMutationError = ErrorType<ErrorResponse>;
/**
* @summary Stop a running Minecraft server
*/
export declare const useStopServer: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopServer>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof stopServer>>, TError, {
    id: number;
}, TContext>;
export declare const getGetServerLogsUrl: (id: number) => string;
/**
 * @summary Get recent logs from a server
 */
export declare const getServerLogs: (id: number, options?: RequestInit) => Promise<ServerLogs>;
export declare const getGetServerLogsQueryKey: (id: number) => readonly [`/api/servers/${number}/logs`];
export declare const getGetServerLogsQueryOptions: <TData = Awaited<ReturnType<typeof getServerLogs>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getServerLogs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getServerLogs>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetServerLogsQueryResult = NonNullable<Awaited<ReturnType<typeof getServerLogs>>>;
export type GetServerLogsQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get recent logs from a server
 */
export declare function useGetServerLogs<TData = Awaited<ReturnType<typeof getServerLogs>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getServerLogs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListServerModsUrl: (id: number) => string;
/**
 * @summary List mods installed on a server
 */
export declare const listServerMods: (id: number, options?: RequestInit) => Promise<InstalledMod[]>;
export declare const getListServerModsQueryKey: (id: number) => readonly [`/api/servers/${number}/mods`];
export declare const getListServerModsQueryOptions: <TData = Awaited<ReturnType<typeof listServerMods>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listServerMods>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listServerMods>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListServerModsQueryResult = NonNullable<Awaited<ReturnType<typeof listServerMods>>>;
export type ListServerModsQueryError = ErrorType<unknown>;
/**
 * @summary List mods installed on a server
 */
export declare function useListServerMods<TData = Awaited<ReturnType<typeof listServerMods>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listServerMods>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getInstallModUrl: (id: number) => string;
/**
 * @summary Install a mod on a server
 */
export declare const installMod: (id: number, modInstallInput: ModInstallInput, options?: RequestInit) => Promise<InstalledMod>;
export declare const getInstallModMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof installMod>>, TError, {
        id: number;
        data: BodyType<ModInstallInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof installMod>>, TError, {
    id: number;
    data: BodyType<ModInstallInput>;
}, TContext>;
export type InstallModMutationResult = NonNullable<Awaited<ReturnType<typeof installMod>>>;
export type InstallModMutationBody = BodyType<ModInstallInput>;
export type InstallModMutationError = ErrorType<ErrorResponse>;
/**
* @summary Install a mod on a server
*/
export declare const useInstallMod: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof installMod>>, TError, {
        id: number;
        data: BodyType<ModInstallInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof installMod>>, TError, {
    id: number;
    data: BodyType<ModInstallInput>;
}, TContext>;
export declare const getUninstallModUrl: (id: number, modId: number) => string;
/**
 * @summary Remove a mod from a server
 */
export declare const uninstallMod: (id: number, modId: number, options?: RequestInit) => Promise<void>;
export declare const getUninstallModMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof uninstallMod>>, TError, {
        id: number;
        modId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof uninstallMod>>, TError, {
    id: number;
    modId: number;
}, TContext>;
export type UninstallModMutationResult = NonNullable<Awaited<ReturnType<typeof uninstallMod>>>;
export type UninstallModMutationError = ErrorType<ErrorResponse>;
/**
* @summary Remove a mod from a server
*/
export declare const useUninstallMod: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof uninstallMod>>, TError, {
        id: number;
        modId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof uninstallMod>>, TError, {
    id: number;
    modId: number;
}, TContext>;
export declare const getGetServersSummaryUrl: () => string;
/**
 * @summary Dashboard summary - total servers, running count, mod counts
 */
export declare const getServersSummary: (options?: RequestInit) => Promise<ServersSummary>;
export declare const getGetServersSummaryQueryKey: () => readonly ["/api/servers/stats/summary"];
export declare const getGetServersSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getServersSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getServersSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getServersSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetServersSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getServersSummary>>>;
export type GetServersSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Dashboard summary - total servers, running count, mod counts
 */
export declare function useGetServersSummary<TData = Awaited<ReturnType<typeof getServersSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getServersSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSearchModsUrl: (params: SearchModsParams) => string;
/**
 * @summary Search mods from CurseForge and Modrinth
 */
export declare const searchMods: (params: SearchModsParams, options?: RequestInit) => Promise<ModSearchResult[]>;
export declare const getSearchModsQueryKey: (params?: SearchModsParams) => readonly ["/api/mods/search", ...SearchModsParams[]];
export declare const getSearchModsQueryOptions: <TData = Awaited<ReturnType<typeof searchMods>>, TError = ErrorType<unknown>>(params: SearchModsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof searchMods>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof searchMods>>, TError, TData> & {
    queryKey: QueryKey;
};
export type SearchModsQueryResult = NonNullable<Awaited<ReturnType<typeof searchMods>>>;
export type SearchModsQueryError = ErrorType<unknown>;
/**
 * @summary Search mods from CurseForge and Modrinth
 */
export declare function useSearchMods<TData = Awaited<ReturnType<typeof searchMods>>, TError = ErrorType<unknown>>(params: SearchModsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof searchMods>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListModUpdatesUrl: (id: number) => string;
/**
 * @summary Check which installed mods have updates available
 */
export declare const listModUpdates: (id: number, options?: RequestInit) => Promise<ModUpdateInfo[]>;
export declare const getListModUpdatesQueryKey: (id: number) => readonly [`/api/servers/${number}/mods/updates`];
export declare const getListModUpdatesQueryOptions: <TData = Awaited<ReturnType<typeof listModUpdates>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listModUpdates>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listModUpdates>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListModUpdatesQueryResult = NonNullable<Awaited<ReturnType<typeof listModUpdates>>>;
export type ListModUpdatesQueryError = ErrorType<unknown>;
/**
 * @summary Check which installed mods have updates available
 */
export declare function useListModUpdates<TData = Awaited<ReturnType<typeof listModUpdates>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listModUpdates>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetFeaturedModsUrl: (params?: GetFeaturedModsParams) => string;
/**
 * @summary Get popular/featured mods
 */
export declare const getFeaturedMods: (params?: GetFeaturedModsParams, options?: RequestInit) => Promise<ModSearchResult[]>;
export declare const getGetFeaturedModsQueryKey: (params?: GetFeaturedModsParams) => readonly ["/api/mods/featured", ...GetFeaturedModsParams[]];
export declare const getGetFeaturedModsQueryOptions: <TData = Awaited<ReturnType<typeof getFeaturedMods>>, TError = ErrorType<unknown>>(params?: GetFeaturedModsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFeaturedMods>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getFeaturedMods>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetFeaturedModsQueryResult = NonNullable<Awaited<ReturnType<typeof getFeaturedMods>>>;
export type GetFeaturedModsQueryError = ErrorType<unknown>;
/**
 * @summary Get popular/featured mods
 */
export declare function useGetFeaturedMods<TData = Awaited<ReturnType<typeof getFeaturedMods>>, TError = ErrorType<unknown>>(params?: GetFeaturedModsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFeaturedMods>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListMinecraftVersionsUrl: () => string;
/**
 * @summary List available Minecraft versions
 */
export declare const listMinecraftVersions: (options?: RequestInit) => Promise<MinecraftVersion[]>;
export declare const getListMinecraftVersionsQueryKey: () => readonly ["/api/versions/minecraft"];
export declare const getListMinecraftVersionsQueryOptions: <TData = Awaited<ReturnType<typeof listMinecraftVersions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMinecraftVersions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listMinecraftVersions>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListMinecraftVersionsQueryResult = NonNullable<Awaited<ReturnType<typeof listMinecraftVersions>>>;
export type ListMinecraftVersionsQueryError = ErrorType<unknown>;
/**
 * @summary List available Minecraft versions
 */
export declare function useListMinecraftVersions<TData = Awaited<ReturnType<typeof listMinecraftVersions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMinecraftVersions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListLoaderVersionsUrl: (params: ListLoaderVersionsParams) => string;
/**
 * @summary List available loader versions for a given Minecraft version and loader type
 */
export declare const listLoaderVersions: (params: ListLoaderVersionsParams, options?: RequestInit) => Promise<LoaderVersion[]>;
export declare const getListLoaderVersionsQueryKey: (params?: ListLoaderVersionsParams) => readonly ["/api/versions/loaders", ...ListLoaderVersionsParams[]];
export declare const getListLoaderVersionsQueryOptions: <TData = Awaited<ReturnType<typeof listLoaderVersions>>, TError = ErrorType<unknown>>(params: ListLoaderVersionsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listLoaderVersions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listLoaderVersions>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListLoaderVersionsQueryResult = NonNullable<Awaited<ReturnType<typeof listLoaderVersions>>>;
export type ListLoaderVersionsQueryError = ErrorType<unknown>;
/**
 * @summary List available loader versions for a given Minecraft version and loader type
 */
export declare function useListLoaderVersions<TData = Awaited<ReturnType<typeof listLoaderVersions>>, TError = ErrorType<unknown>>(params: ListLoaderVersionsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listLoaderVersions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCheckSlugUrl: (params: CheckSlugParams) => string;
/**
 * @summary Check if a custom slug is available
 */
export declare const checkSlug: (params: CheckSlugParams, options?: RequestInit) => Promise<SlugCheck>;
export declare const getCheckSlugQueryKey: (params?: CheckSlugParams) => readonly ["/api/slugs/check", ...CheckSlugParams[]];
export declare const getCheckSlugQueryOptions: <TData = Awaited<ReturnType<typeof checkSlug>>, TError = ErrorType<unknown>>(params: CheckSlugParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof checkSlug>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof checkSlug>>, TError, TData> & {
    queryKey: QueryKey;
};
export type CheckSlugQueryResult = NonNullable<Awaited<ReturnType<typeof checkSlug>>>;
export type CheckSlugQueryError = ErrorType<unknown>;
/**
 * @summary Check if a custom slug is available
 */
export declare function useCheckSlug<TData = Awaited<ReturnType<typeof checkSlug>>, TError = ErrorType<unknown>>(params: CheckSlugParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof checkSlug>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map