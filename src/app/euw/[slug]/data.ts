import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  max,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db } from "@/db";
import {
  ACTIVE_SYNC_JOB_STATUSES,
  matches,
  matchFetch,
  profiles,
  type SyncJob,
  syncJobs,
} from "@/db/schema";
import {
  type AlbumEntry,
  buildAlbum,
  type RecentGame,
  recentForm,
} from "@/domain/album";
import { type ArenaGodGoal, arenaGodGoal } from "@/domain/arena-god";
import { isGroupMember } from "@/domain/group";
import type { PlayerTitle } from "@/domain/group-titles";
import {
  type GroupView,
  loadGroupView,
  loadProfileTitles,
  memberKey,
} from "@/domain/group-view";
import { computeHeat } from "@/domain/heat";
import { getProfileMatches } from "@/domain/matches";
import {
  getProfileStats,
  getRecordRows,
  type ProfileChallenge,
  type TeammateSummary,
} from "@/domain/queries";
import { computeRecords, type Records } from "@/domain/records";
import type {
  PlayerMatchRow,
  StatsSummary,
  VerifiedChampion,
} from "@/domain/stats";
import {
  type CurvePoint,
  type Highlights,
  highlights,
  wonCurve,
} from "@/domain/summary";
import { getKeyStatus } from "@/lib/admin/key-service";
import {
  ARENA_GOD_THRESHOLD,
  ARENA_QUEUE_IDS,
  ARENA_QUIET_DAYS,
  getSeasonStart,
} from "@/lib/config";
import { type ChampionCatalog, profileIconUrl } from "@/lib/ddragon";
import { EMPTY_GAME_DATA, type GameData } from "@/lib/game-data";
import { classifyRetry } from "@/lib/riot/errors";
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
import { availableTab, type ProfileTab } from "./view-model";

// Carga de datos de `/euw/{nombre}-{tag}`, separada de la página para poder probarla contra la
// BD. Devuelve una lista blanca explícita: ni el `puuid` (ni siquiera se lee del perfil) llega a la
// página. Lo común a todas las pestañas (header, barra, raíl, álbum y forma) se carga siempre; lo
// propio de cada pestaña, solo si es la activa (`view.tab`). El catálogo de Data Dragon se inyecta
// (la página pasa `getChampionCatalog()`, que es server-only y usa la red): así esta carga se
// prueba sin red.

/** Sin catálogo (por defecto): el álbum solo trae los campeones jugados, sin retratos. */
const EMPTY_CATALOG: ChampionCatalog = { version: null, champions: [] };

/**
 * Por qué un job espera para reintentar: `rate_limit` (Riot devolvió 429 de forma persistente) o
 * `error` (5xx, red...). Sale de clasificar el `lastError` en el servidor (`classifyRetry`); el
 * texto nunca viaja.
 */
export type RetryReason = "rate_limit" | "error";

/**
 * Cola compartida de la personal key, en recuentos (sin ids ni perfiles ajenos). Los recuentos
 * siguen el orden de `pickWork` (`src/worker/steps.ts`):
 * - `ahead`: jobs de otros perfiles en `pending`/`listing` que se sirven antes que este (solo con
 *   este job en `pending`/`listing`; en `fetching` vale 0);
 * - `sharing`: otros jobs en `fetching` con los que este reparte las peticiones (solo con este
 *   job en `fetching`; si no, 0).
 */
export interface SyncQueue {
  ahead: number;
  sharing: number;
}

/** Progreso del job activo. Fases: `pending` -> resolviendo, `listing` -> listando, `fetching` -> descargando. */
export type SyncProgress = {
  kind: "backfill" | "incremental";
  /**
   * Cuándo se reintenta el job si ahora está esperando (backoff): su `nextRunAt` futuro o, en
   * `fetching`, la `nextAttemptAt` más próxima si todas las partidas que faltan esperan la suya.
   * `null` si no espera.
   */
  retryAt: Date | null;
  /** Motivo de la espera; `null` exactamente cuando `retryAt` es `null`. */
  reason: RetryReason | null;
  /** Otros jobs delante o repartiendo con este; `null` si no hay ninguno (o si el job espera a reintentar). */
  queue: SyncQueue | null;
} & (
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

/**
 * La pestaña Resumen: la curva de campeones ganados acumulados (D4) y los destacados. Lo demás
 * que pinta (marcador, distribución y forma) es común y ya viaja en `ProfileView`.
 */
export interface SummaryTabData {
  /**
   * Un punto por instante en que sube el recuento, del inicio de temporada a «ahora»; `[]` si el
   * jugador aún no ha ganado con ningún campeón. Como mucho ~175 puntos (uno por campeón).
   */
  curve: CurvePoint[];
  /** Los tres grupos de campeones destacados, de hasta 8 chips cada uno. */
  highlights: Highlights;
  /** Meta de la curva: los campeones que pide el nivel MASTER del challenge (`ARENA_GOD_THRESHOLD`, «Deidad de Arena»). */
  threshold: number;
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
  /**
   * Icono de invocador en Data Dragon (versión del catálogo); `null` si el perfil aún no lo tiene
   * o el catálogo no cargó: la cabecera pinta entonces el placeholder con las iniciales.
   */
  profileIconUrl: string | null;
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
  /**
   * Arena parece fuera de rotación: la última partida de Arena de la BD (de cualquier perfil) es
   * de hace más de `ARENA_QUIET_DAYS` días, este perfil se sincronizó alguna vez y su última
   * actualización no falló (así el silencio no se confunde con un fallo de sincronización).
   * `lastArenaGameAt` es esa partida, en epoch ms. `null` si no se dan las tres cosas.
   */
  arenaQuiet: { lastArenaGameAt: number } | null;
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
   * Badge «Deidad de Arena» y meta de la barra (`arenaGodGoal`): se decide en el servidor con los
   * verificados y el contador oficial, y el mismo valor llega a la cabecera y a la barra.
   */
  arenaGod: ArenaGodGoal;
  /**
   * Los `RAIL_TEAMMATES` (5) compañeros con más partidas juntos, sin mínimo, para la caja del raíl:
   * el raíl se pinta en todas las pestañas. Cifras ya formateadas y sin `puuid`.
   */
  railTeammates: RailTeammate[];
  /** Títulos vigentes del miembro (badges de la cabecera); vacío si el perfil no es del grupo. */
  titles: PlayerTitle[];
  /** El perfil es miembro del grupo: decide si la barra lleva la pestaña Grupo. */
  isMember: boolean;

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
  /** Curva de campeones ganados y destacados (`tab === "resumen"`). */
  summaryTab?: SummaryTabData;
  /**
   * Récords, victorias especiales, rachas, días y campeones de la temporada (`tab === "estadisticas"`).
   * Son solo identificadores y cifras: los nombres y retratos salen del álbum, que ya viaja.
   */
  records?: Records;
  /**
   * La vista del grupo y la clave del dueño del perfil para destacar su fila (`tab === "grupo"`,
   * solo en miembros: en los demás `grupo` cae en la pestaña por defecto).
   */
  group?: { view: GroupView; ownerKey: string };
}

export type ProfilePageData =
  /** El Riot ID no está registrado: la página ofrece registrarlo. */
  | { kind: "unregistered"; gameName: string; tagLine: string }
  /** Riot (Account-V1) no conoce ese Riot ID. */
  | { kind: "not_found"; gameName: string; tagLine: string }
  | ProfileView;

/** El job activo tal como lo lee `loadSyncProgress` (con lo que no sale de este módulo). */
interface ActiveJob {
  id: number;
  status: SyncJob["status"];
  interactive: boolean;
  nextRunAt: Date | null;
  /** Solo para clasificarlo (`classifyRetry`): el texto no sale del servidor. */
  lastError: string | null;
}

/** Job sin backoff pendiente: la misma condición que `isDue` de `pickWork`. */
const dueAt = (now: Date) =>
  or(isNull(syncJobs.nextRunAt), lte(syncJobs.nextRunAt, now));

/**
 * Si el job está esperando para reintentar: su `nextRunAt` si es futuro (`pickWork` se lo salta
 * entero) y, en `fetching`, la `nextAttemptAt` más próxima si TODAS las partidas que faltan
 * esperan la suya. Para lo segundo basta la primera fila pendiente por `nextAttemptAt` (los
 * vacíos, que están listos, primero): si esa ya venció o no tiene espera, hay algo que descargar.
 */
async function loadRetry(
  db: Db,
  job: ActiveJob,
  now: Date,
): Promise<{ retryAt: Date; reason: RetryReason } | null> {
  if (job.nextRunAt && job.nextRunAt > now) {
    return { retryAt: job.nextRunAt, reason: classifyRetry(job.lastError) };
  }
  if (job.status !== "fetching") return null;
  const [next] = await db
    .select({
      nextAttemptAt: matchFetch.nextAttemptAt,
      lastError: matchFetch.lastError,
    })
    .from(matchFetch)
    .innerJoin(syncJobs, sql`${matchFetch.matchId} = any(${syncJobs.matchIds})`)
    .where(and(eq(syncJobs.id, job.id), eq(matchFetch.status, "pending")))
    .orderBy(sql`${matchFetch.nextAttemptAt} asc nulls first`)
    .limit(1);
  if (!next?.nextAttemptAt || next.nextAttemptAt <= now) return null;
  return {
    retryAt: next.nextAttemptAt,
    reason: classifyRetry(next.lastError),
  };
}

/**
 * Cuántos jobs de otros perfiles hay delante o repartiendo con este, con el criterio de
 * `pickWork`:
 * - `pending`/`listing`: se sirven antes que cualquier `fetching`, por `interactive desc, id asc`.
 *   Delante están los `pending`/`listing` sin backoff con más prioridad: los interactivos si este
 *   no lo es y, entre iguales, los de `id` menor.
 * - `fetching`: reparto en round-robin entre los `fetching` sin backoff. Un job interactivo solo
 *   reparte con otros interactivos (los demás esperan a que acaben); uno que no lo es, con todos.
 *   Aproximación: no mira si a esos jobs les queda algo que pedir (toda su cola puede estar en
 *   backoff), así que puede contar de más un instante.
 * Solo recuentos: ni ids ni perfiles ajenos.
 */
async function loadQueue(
  db: Db,
  job: ActiveJob,
  now: Date,
): Promise<SyncQueue | null> {
  const fetching = job.status === "fetching";
  const others: SQL | undefined = and(ne(syncJobs.id, job.id), dueAt(now));
  const scope = fetching
    ? and(
        eq(syncJobs.status, "fetching"),
        job.interactive ? eq(syncJobs.interactive, true) : undefined,
      )
    : and(
        inArray(syncJobs.status, ["pending", "listing"]),
        job.interactive
          ? and(eq(syncJobs.interactive, true), lt(syncJobs.id, job.id))
          : or(eq(syncJobs.interactive, true), lt(syncJobs.id, job.id)),
      );
  const [row] = await db
    .select({ n: count() })
    .from(syncJobs)
    .where(and(others, scope));
  const n = row?.n ?? 0;
  if (n === 0) return null;
  return fetching ? { ahead: 0, sharing: n } : { ahead: n, sharing: 0 };
}

/** Job activo del perfil (`pending`/`listing`/`fetching`) como progreso; `null` si no hay. */
async function loadSyncProgress(
  db: Db,
  profileId: number,
  now: Date,
): Promise<SyncProgress | null> {
  const [job] = await db
    .select({
      id: syncJobs.id,
      kind: syncJobs.kind,
      status: syncJobs.status,
      interactive: syncJobs.interactive,
      totalIds: syncJobs.totalIds,
      fetched: syncJobs.fetched,
      nextRunAt: syncJobs.nextRunAt,
      lastError: syncJobs.lastError,
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
  if (!job || job.status === "done" || job.status === "error") return null;
  const [retry, queue] = await Promise.all([
    loadRetry(db, job, now),
    loadQueue(db, job, now),
  ]);
  // Un job que espera su reintento no está en la cola: no se sirve hasta `retryAt`.
  const wait = {
    retryAt: retry?.retryAt ?? null,
    reason: retry?.reason ?? null,
    queue: retry ? null : queue,
  };
  switch (job.status) {
    case "pending":
      return { kind: job.kind, ...wait, phase: "resolving" };
    case "listing":
      return {
        kind: job.kind,
        ...wait,
        phase: "listing",
        listedIds: job.listedIds,
      };
    case "fetching":
      return {
        kind: job.kind,
        ...wait,
        phase: "fetching",
        fetched: job.fetched,
        total: job.totalIds,
      };
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ¿Arena parece fuera de rotación? Riot no expone qué modos están activos, así que se infiere de
 * la BD propia: la última partida de Arena de CUALQUIER perfil (`max(gameCreation)` de las colas
 * de `ARENA_QUEUE_IDS`, sin acotar a la temporada ni al perfil) tiene más de `ARENA_QUIET_DAYS`
 * días. Solo con el perfil sincronizado alguna vez y sin fallo en su última actualización: si no,
 * el silencio podría ser un fallo de sincronización y no se afirma nada. Sin partidas de Arena en
 * la BD tampoco hay desde cuándo.
 */
async function loadArenaQuiet(
  db: Db,
  profile: { lastSyncedAt: Date | null },
  lastJobError: { at: Date } | null,
  now: number,
): Promise<{ lastArenaGameAt: number } | null> {
  if (profile.lastSyncedAt === null || lastJobError !== null) return null;
  const [row] = await db
    .select({ at: max(matches.gameCreation) })
    .from(matches)
    .where(inArray(matches.queueId, [...ARENA_QUEUE_IDS]));
  const lastArenaGameAt = row?.at ?? null;
  if (lastArenaGameAt === null) return null;
  return now - lastArenaGameAt > ARENA_QUIET_DAYS * DAY_MS
    ? { lastArenaGameAt }
    : null;
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
      profileIconId: profiles.profileIconId,
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

  const now = new Date();
  const [stats, sync, lastJobError, key, championCatalog, titles, isMember] =
    await Promise.all([
      getProfileStats(db, profile.id, seasonStart),
      loadSyncProgress(db, profile.id, now),
      loadLastJobError(db, profile.id),
      getKeyStatus(db),
      catalog,
      loadProfileTitles(db, profile.id, now.getTime(), seasonStart),
      isGroupMember(db, profile.id),
    ]);
  const tab = availableTab(view.tab, isMember);
  if (!stats) return unregistered; // borrado entre las dos consultas
  const arenaQuiet = await loadArenaQuiet(
    db,
    profile,
    lastJobError,
    now.getTime(),
  );

  // Frío/calor sobre las filas que ya están cargadas (comunes a todas las pestañas): lo usan el
  // cromo (vía el álbum) y el panel de campeón, sin consultas nuevas.
  const heat = computeHeat(stats.playerRows);
  const album = buildAlbum(championCatalog, stats.playerRows, heat);
  // La forma nombra a cada campeón como el álbum (catálogo o, sin él, la partida más reciente).
  const displayName = new Map(album.map((e) => [e.championId, e.name]));

  const championEntry =
    view.campeon === undefined ? null : findChampionBySlug(album, view.campeon);

  const records =
    tab === "estadisticas"
      ? await loadRecords(db, profile.id, seasonStart)
      : null;

  const group =
    tab === "grupo"
      ? {
          view: await loadGroupView(
            db,
            now.getTime(),
            seasonStart,
            championCatalog,
          ),
          ownerKey: memberKey(profile.id),
        }
      : null;

  const partidas =
    tab === "partidas"
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
    tab,
    gameName: profile.gameName,
    tagLine: profile.tagLine,
    seasonStart,
    profileIconUrl: profileIconUrl(
      championCatalog.version,
      profile.profileIconId,
    ),
    lastSyncedAt: profile.lastSyncedAt,
    lastGameAt: stats.lastGameAt,
    sync,
    lastJobError,
    paused: key.status === "invalid",
    arenaQuiet,
    summary: stats.summary,
    verifiedChampions: stats.verifiedChampions,
    album,
    form: recentForm(stats.playerRows, 20).map((game) => ({
      ...game,
      championName: displayName.get(game.championId) ?? game.championName,
    })),
    challenge: stats.challenge,
    // N es el tamaño del catálogo que ya se cargó para el álbum: no se pide otra vez.
    arenaGod: arenaGodGoal({
      verified: stats.verifiedChampions.length,
      official: stats.challenge.value,
      championTotal: championCatalog.champions.length,
    }),
    railTeammates: railTeammates(stats.teammates, RAIL_TEAMMATES),
    titles,
    isMember,
    // La clave solo existe con `?campeon` válido: `...null` no añade nada.
    ...(championEntry && {
      champion: championPanelData(championEntry, stats.playerRows, heat),
    }),
    // Ídem para las claves de cada pestaña: `...false` no añade nada.
    ...(tab === "companeros" && {
      teammates: teammatesAtLeast(
        stats.teammates,
        (view.teammates ?? DEFAULT_TEAMMATE_PARAMS).min,
      ),
    }),
    ...(tab === "resumen" && {
      summaryTab: {
        // Los verificados de dominio (sin marcas manuales) y las filas ya cargadas: sin consultas nuevas.
        curve: wonCurve(
          stats.verifiedChampions,
          seasonStart.getTime(),
          Date.now(),
        ),
        highlights: highlights(album, stats.playerRows),
        threshold: ARENA_GOD_THRESHOLD,
      },
    }),
    ...(records && { records }),
    ...(group && { group }),
    ...(partidas && {
      matches: partidas.matches,
      ...(partidas.matchDetail && { matchDetail: partidas.matchDetail }),
    }),
  };
}

/**
 * Datos propios de Estadísticas: `computeRecords` sobre las partidas del perfil dentro de la
 * temporada. Resuelve el `puuid` aquí dentro (como `getProfileMatches`), así que no sale de este
 * módulo; un perfil sin `puuid` todavía (resolviéndose) da los récords de ninguna partida.
 */
async function loadRecords(
  db: Db,
  profileId: number,
  seasonStart: Date,
): Promise<Records> {
  const [profile] = await db
    .select({ puuid: profiles.puuid })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile?.puuid) return computeRecords([]);
  return computeRecords(await getRecordRows(db, profile.puuid, seasonStart));
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
