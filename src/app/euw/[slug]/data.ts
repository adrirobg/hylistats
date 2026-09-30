import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { ACTIVE_SYNC_JOB_STATUSES, profiles, syncJobs } from "@/db/schema";
import {
  type AlbumEntry,
  buildAlbum,
  type RecentGame,
  recentForm,
} from "@/domain/album";
import {
  getProfileStats,
  type ProfileChallenge,
  type TeammateSummary,
} from "@/domain/queries";
import type { StatsSummary, VerifiedChampion } from "@/domain/stats";
import { getKeyStatus } from "@/lib/admin/key-service";
import { getSeasonStart } from "@/lib/config";
import type { ChampionCatalog } from "@/lib/ddragon";
import { normalizeRiotId } from "@/worker/queue";
import {
  DEFAULT_TEAMMATE_PARAMS,
  RAIL_TEAMMATES,
  type RailTeammate,
  railTeammates,
  type TeammateParams,
  teammatesAtLeast,
} from "./teammates-view";
import type { ProfileTab } from "./view-model";

// Carga de datos de `/euw/{nombre}-{tag}`, separada de la página para poder probarla contra la
// BD. Devuelve una lista blanca explícita: ni el `puuid` (ni siquiera se lee del perfil) llega a la
// página. Lo común a todas las pestañas (header, barra, raíl, álbum y forma) se carga siempre; lo
// propio de cada pestaña, solo si es la activa (`view.tab`). El catálogo de Data Dragon se inyecta
// (la página pasa `getChampionCatalog()`, que es server-only y usa la red): así esta carga se
// prueba sin red.

/** Sin catálogo (por defecto): el álbum solo trae los campeones jugados, sin retratos. */
const EMPTY_CATALOG: ChampionCatalog = { version: null, champions: [] };

/** Progreso del job activo. Fases: `pending` -> resolviendo, `listing` -> listando, `fetching` -> descargando. */
export type SyncProgress = { kind: "backfill" | "incremental" } & (
  | { phase: "resolving" }
  // Durante el listado `totalIds` vale 0 (se fija al acabar de listar): se cuentan los ids ya listados.
  | { phase: "listing"; listedIds: number }
  | { phase: "fetching"; fetched: number; total: number }
);

/**
 * Qué vista del perfil se pide (`?tab` y, en cada pestaña, sus filtros). Es un objeto para que las
 * pestañas añadan los suyos (`q`, `partida`…) sin cambiar la firma de `loadProfilePage`.
 */
export interface ProfileViewParams {
  tab: ProfileTab;
  /** Filtros de Compañeros (`?min`, `?orden`); sin ellos, los de por defecto. */
  teammates?: TeammateParams;
}

/** Perfil registrado y resuelto: lo que muestra la página completa. */
export interface ProfileView {
  kind: "profile";
  /** Pestaña activa: la que pidió la vista y la única cuyos datos propios viajan (abajo). */
  tab: ProfileTab;
  /** Forma canónica de Riot (puede diferir en mayúsculas del Riot ID de la URL). */
  gameName: string;
  tagLine: string;
  seasonStart: Date;
  lastSyncedAt: Date | null;
  /** Epoch en ms de la última partida de la temporada; `null` sin partidas. */
  lastGameAt: number | null;
  /** Job en curso (`null` si no hay ninguno). */
  sync: SyncProgress | null;
  /**
   * El último job que terminó (`done` o `error`) acabó en `error`: la última actualización falló.
   * `at` es cuándo. Sin el texto de `lastError` (puede traer rutas o detalles internos).
   */
  lastJobError: { at: Date } | null;
  /** La key de Riot está caducada (`keyStatus = 'invalid'`): no se actualiza hasta rotarla. */
  paused: boolean;
  summary: StatsSummary;
  verifiedChampions: VerifiedChampion[];
  /** Todos los campeones del catálogo más los jugados ausentes de él, con su estado de dominio. */
  album: AlbumEntry[];
  /**
   * Las últimas 20 partidas (la más reciente primero) para la tira de forma del raíl. El nombre
   * del campeón es el de visualización (el del álbum); sin `puuid`, como el resto.
   */
  form: RecentGame[];
  challenge: ProfileChallenge;
  /**
   * Los `RAIL_TEAMMATES` (5) compañeros con más partidas juntos, sin mínimo, para la caja del raíl:
   * el raíl se pinta en todas las pestañas. Cifras ya formateadas y sin `puuid`.
   */
  railTeammates: RailTeammate[];

  // Datos propios de cada pestaña: solo se rellenan (y solo existe la clave) si es la activa. Todo
  // lo que llega aquí se serializa en cada `router.refresh()`, así que no se añade lo que no se pinta.
  /**
   * Compañeros de la temporada con al menos `?min` partidas juntos (`tab === "companeros"`), en el
   * orden del dominio (más partidas primero); el orden por columna lo aplica el cliente. Filtrar
   * aquí y no allí evita mandar los cientos de compañeros de una sola partida.
   */
  teammates?: TeammateSummary[];
  /** Lista de partidas y detalle (`tab === "partidas"`); el tipo lo define T05. */
  matches?: never;
  /** Curva de campeones ganados y destacados (`tab === "resumen"`); el tipo lo define T07. */
  summaryTab?: never;
}

export type ProfilePageData =
  /** El Riot ID no está registrado: la página ofrece registrarlo. */
  | { kind: "unregistered"; gameName: string; tagLine: string }
  /** Riot (Account-V1) no conoce ese Riot ID. */
  | { kind: "not_found"; gameName: string; tagLine: string }
  | ProfileView;

/** Job activo del perfil (`pending`/`listing`/`fetching`) como progreso; `null` si no hay. */
async function loadSyncProgress(
  db: Db,
  profileId: number,
): Promise<SyncProgress | null> {
  const [job] = await db
    .select({
      kind: syncJobs.kind,
      status: syncJobs.status,
      totalIds: syncJobs.totalIds,
      fetched: syncJobs.fetched,
      // Solo el recuento: el array puede tener miles de ids y la página se refresca cada 3 s.
      listedIds: sql<number>`cardinality(${syncJobs.matchIds})`.mapWith(Number),
    })
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.profileId, profileId),
        inArray(syncJobs.status, [...ACTIVE_SYNC_JOB_STATUSES]),
      ),
    )
    .orderBy(desc(syncJobs.id))
    .limit(1);
  if (!job) return null;
  switch (job.status) {
    case "pending":
      return { kind: job.kind, phase: "resolving" };
    case "listing":
      return { kind: job.kind, phase: "listing", listedIds: job.listedIds };
    case "fetching":
      return {
        kind: job.kind,
        phase: "fetching",
        fetched: job.fetched,
        total: job.totalIds,
      };
    default:
      return null; // `done`/`error` no son activos (el filtro ya los excluye)
  }
}

/**
 * ¿Falló la última actualización? Mira el último job terminado del perfil (`done`/`error`, por
 * `id`: solo hay un job activo por perfil, así que el orden de ids es el de finalización). Un
 * `done` posterior borra el aviso. Solo devuelve el instante: `lastError` no sale de la BD.
 */
async function loadLastJobError(
  db: Db,
  profileId: number,
): Promise<{ at: Date } | null> {
  const [last] = await db
    .select({
      status: syncJobs.status,
      finishedAt: syncJobs.finishedAt,
      updatedAt: syncJobs.updatedAt,
    })
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.profileId, profileId),
        inArray(syncJobs.status, ["done", "error"]),
      ),
    )
    .orderBy(desc(syncJobs.id))
    .limit(1);
  if (last?.status !== "error") return null;
  return { at: last.finishedAt ?? last.updatedAt };
}

/**
 * Todo lo que pinta la página de un Riot ID. El perfil se busca por `riotIdNorm`
 * (`lower(nombre)#lower(tag)`), no por el nombre canónico. `view` es la vista pedida: su pestaña
 * decide qué datos propios se cargan además de los comunes. `seasonStart` sale de `SEASON_START`
 * salvo que se pase otro (tests). `catalog` es el catálogo de campeones (o su promesa: la página
 * lo pide antes para que se cargue en paralelo con la BD); sin él, el álbum sale sin retratos.
 */
export async function loadProfilePage(
  db: Db,
  gameName: string,
  tagLine: string,
  view: ProfileViewParams,
  seasonStart: Date = getSeasonStart(),
  catalog: ChampionCatalog | Promise<ChampionCatalog> = EMPTY_CATALOG,
): Promise<ProfilePageData> {
  const [profile] = await db
    .select({
      id: profiles.id,
      gameName: profiles.gameName,
      tagLine: profiles.tagLine,
      status: profiles.status,
      lastSyncedAt: profiles.lastSyncedAt,
    })
    .from(profiles)
    .where(eq(profiles.riotIdNorm, normalizeRiotId(gameName, tagLine)))
    .limit(1);
  const unregistered = { kind: "unregistered", gameName, tagLine } as const;
  if (!profile) return unregistered;
  if (profile.status === "not_found") {
    return {
      kind: "not_found",
      gameName: profile.gameName,
      tagLine: profile.tagLine,
    };
  }

  const [stats, sync, lastJobError, key, championCatalog] = await Promise.all([
    getProfileStats(db, profile.id, seasonStart),
    loadSyncProgress(db, profile.id),
    loadLastJobError(db, profile.id),
    getKeyStatus(db),
    catalog,
  ]);
  if (!stats) return unregistered; // borrado entre las dos consultas

  const album = buildAlbum(championCatalog, stats.playerRows);
  // La forma nombra a cada campeón como el álbum (catálogo o, sin él, la partida más reciente).
  const displayName = new Map(album.map((e) => [e.championId, e.name]));

  return {
    kind: "profile",
    tab: view.tab,
    gameName: profile.gameName,
    tagLine: profile.tagLine,
    seasonStart,
    lastSyncedAt: profile.lastSyncedAt,
    lastGameAt: stats.lastGameAt,
    sync,
    lastJobError,
    paused: key.status === "invalid",
    summary: stats.summary,
    verifiedChampions: stats.verifiedChampions,
    album,
    form: recentForm(stats.playerRows, 20).map((game) => ({
      ...game,
      championName: displayName.get(game.championId) ?? game.championName,
    })),
    challenge: stats.challenge,
    railTeammates: railTeammates(stats.teammates, RAIL_TEAMMATES),
    // La clave solo existe en su pestaña: `...false` no añade nada.
    ...(view.tab === "companeros" && {
      teammates: teammatesAtLeast(
        stats.teammates,
        (view.teammates ?? DEFAULT_TEAMMATE_PARAMS).min,
      ),
    }),
  };
}
