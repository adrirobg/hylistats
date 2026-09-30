import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { ACTIVE_SYNC_JOB_STATUSES, profiles, syncJobs } from "@/db/schema";
import {
  type AlbumEntry,
  buildAlbum,
  type RecentGame,
  recentForm,
} from "@/domain/album";
import { getProfileMatches } from "@/domain/matches";
import {
  getProfileStats,
  type ProfileChallenge,
  type TeammateSummary,
} from "@/domain/queries";
import type {
  PlayerMatchRow,
  StatsSummary,
  VerifiedChampion,
} from "@/domain/stats";
import { getKeyStatus } from "@/lib/admin/key-service";
import { getSeasonStart } from "@/lib/config";
import type { ChampionCatalog } from "@/lib/ddragon";
import { EMPTY_GAME_DATA, type GameData } from "@/lib/game-data";
import { normalizeRiotId } from "@/worker/queue";
import {
  type ChampionPanelData,
  championPanelData,
  findChampionBySlug,
} from "./champion-panel-view";
import {
  type Companion,
  championIdsForQuery,
  companionsForSelect,
  DEFAULT_MATCH_PARAMS,
  type MatchDetailView,
  type MatchParams,
  type MatchRowData,
  matchDetailView,
  matchListLimit,
  matchRows,
} from "./matches-view";
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
  /** Filtros, bloques y partida abierta de Partidas (`?q`, `?puesto`…); sin ellos, los de por defecto. */
  matches?: MatchParams;
  /**
   * Slug de `?campeon` (el panel de campeón, sobre cualquier pestaña), tal cual llega de la URL:
   * aquí se resuelve contra el álbum sin distinguir mayúsculas. Un slug que no existe no abre nada.
   */
  campeon?: string;
}

/** La pestaña Partidas: la lista (con filtros y bloques) y lo que necesita el selector de compañero. */
export interface MatchesData {
  /** Las `limit` partidas más recientes que cumplen los filtros. */
  rows: MatchRowData[];
  /** Partidas que cumplen los filtros, sean cuales sean las `rows` que se traen (bloques de 50). */
  total: number;
  /** Partidas pedidas: 50 por bloque (`?n`). Si `rows` trae menos, ya está todo. */
  limit: number;
  /** Compañeros con al menos 3 partidas juntos, para el selector (`?companero`). */
  companions: Companion[];
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

  /**
   * Panel de campeón abierto (`?campeon` válido, sobre cualquier pestaña): la distribución y las
   * últimas partidas de ese campeón. Las cifras salen del álbum. Sin `?campeon`, o con uno que no
   * existe, no hay clave: el payload no crece.
   */
  champion?: ChampionPanelData;

  // Datos propios de cada pestaña: solo se rellenan (y solo existe la clave) si es la activa. Todo
  // lo que llega aquí se serializa en cada `router.refresh()`, así que no se añade lo que no se pinta.
  /**
   * Compañeros de la temporada con al menos `?min` partidas juntos (`tab === "companeros"`), en el
   * orden del dominio (más partidas primero); el orden por columna lo aplica el cliente. Filtrar
   * aquí y no allí evita mandar los cientos de compañeros de una sola partida.
   */
  teammates?: TeammateSummary[];
  /** Lista de partidas de la temporada con sus filtros (`tab === "partidas"`). */
  matches?: MatchesData;
  /**
   * La partida abierta (`?partida`) con sus 6 equipos de 3 (`tab === "partidas"`). Solo existe si
   * la URL pide una partida del perfil que está en la temporada: el detalle no viaja de otro modo.
   */
  matchDetail?: MatchDetailView;
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
 * `gameData` (nombres e iconos de objetos y augments; también admite una promesa) solo se espera
 * para el detalle de una partida abierta con `?partida`; sin él, ese detalle sale sin iconos.
 */
export async function loadProfilePage(
  db: Db,
  gameName: string,
  tagLine: string,
  view: ProfileViewParams,
  seasonStart: Date = getSeasonStart(),
  catalog: ChampionCatalog | Promise<ChampionCatalog> = EMPTY_CATALOG,
  gameData: GameData | Promise<GameData> = EMPTY_GAME_DATA,
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

  const championEntry =
    view.campeon === undefined ? null : findChampionBySlug(album, view.campeon);

  const partidas =
    view.tab === "partidas"
      ? await loadMatches(
          db,
          profile.id,
          seasonStart,
          view.matches ?? DEFAULT_MATCH_PARAMS,
          { album, playerRows: stats.playerRows, teammates: stats.teammates },
          gameData,
        )
      : null;

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
    // La clave solo existe con `?campeon` válido: `...null` no añade nada.
    ...(championEntry && {
      champion: championPanelData(championEntry, stats.playerRows),
    }),
    // Ídem para las claves de cada pestaña: `...false` no añade nada.
    ...(view.tab === "companeros" && {
      teammates: teammatesAtLeast(
        stats.teammates,
        (view.teammates ?? DEFAULT_TEAMMATE_PARAMS).min,
      ),
    }),
    ...(partidas && {
      matches: partidas.matches,
      ...(partidas.matchDetail && { matchDetail: partidas.matchDetail }),
    }),
  };
}

/**
 * Datos propios de Partidas: la lista de la temporada con los filtros de la URL (50 por bloque,
 * `?n`) y, si hay `?partida` y es una partida del perfil, su detalle con los iconos resueltos. El
 * filtro de campeón se resuelve aquí (nombre de visualización -> `championId`) y la consulta solo
 * filtra por id. Sin `puuid`: `getProfileMatches` lo lee dentro y no sale de ahí.
 */
async function loadMatches(
  db: Db,
  profileId: number,
  seasonStart: Date,
  params: MatchParams,
  stats: {
    album: AlbumEntry[];
    playerRows: PlayerMatchRow[];
    teammates: TeammateSummary[];
  },
  gameData: GameData | Promise<GameData>,
): Promise<{ matches: MatchesData; matchDetail: MatchDetailView | null }> {
  const limit = matchListLimit(params.blocks);
  const { list, detail } = await getProfileMatches(db, profileId, seasonStart, {
    filters: {
      championIds: championIdsForQuery(stats.album, stats.playerRows, params.q),
      puesto: params.puesto ?? undefined,
      companero: params.companero ?? undefined,
      limit,
    },
    matchId: params.partida,
  });
  return {
    matches: {
      rows: matchRows(list.rows, stats.album),
      total: list.total,
      limit,
      companions: companionsForSelect(stats.teammates),
    },
    matchDetail: detail && matchDetailView(detail, stats.album, await gameData),
  };
}
