import { eq, inArray, max } from "drizzle-orm";
import type { Db } from "@/db";
import { matches, profiles } from "@/db/schema";
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
  memberKey,
  type ProfileElo,
} from "@/domain/group-view";
import { loadProfileGroupData } from "@/domain/group-view-memo";
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
import { loadProfileSyncState, type SyncProgress } from "@/domain/sync-status";
import {
  ARENA_GOD_THRESHOLD,
  ARENA_QUEUE_IDS,
  ARENA_QUIET_DAYS,
  getSeasonStart,
} from "@/lib/config";
import { groupVersion, profileVersion } from "@/lib/data-version";
import { type ChampionCatalog, profileIconUrl } from "@/lib/ddragon";
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
import { availableTab, type ProfileTab } from "./view-model";

// Carga de datos de `/euw/{nombre}-{tag}`, separada de la página para poder probarla contra la
// BD. Devuelve una lista blanca explícita: ni el `puuid` (ni siquiera se lee del perfil) llega a la
// página. Lo común a todas las pestañas (header, barra, raíl, álbum y forma) se carga siempre; lo
// propio de cada pestaña, solo si es la activa (`view.tab`). El catálogo de Data Dragon se inyecta
// (la página pasa `getChampionCatalog()`, que es server-only y usa la red): así esta carga se
// prueba sin red.

/** Sin catálogo (por defecto): el álbum solo trae los campeones jugados, sin retratos. */
const EMPTY_CATALOG: ChampionCatalog = { version: null, champions: [] };

// El estado de la sincronización vive en `@/domain/sync-status` (lo comparte `/api/estado`); sus
// tipos se re-exportan aquí para los consumidores de siempre.
export type {
  RetryReason,
  SyncProgress,
  SyncQueue,
} from "@/domain/sync-status";

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
  /** ELO del miembro (iter-09); `null` si el perfil no es del grupo. */
  elo: ProfileElo | null;
  /** El perfil es miembro del grupo: decide si la barra lleva la pestaña Grupo. */
  isMember: boolean;
  /**
   * Versiones de datos leídas antes de cargar la página (`initial` de `StatusProvider`); la del
   * grupo solo si es miembro.
   */
  versions: { version: string; groupVersion: string | null };

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

  // Antes de cargar nada: un cambio durante la carga no se pierde (el estado lo verá distinto).
  const versions = {
    profile: profileVersion(profile.id),
    group: groupVersion(),
  };
  const now = new Date();
  const [stats, syncState, championCatalog, groupData, isMember] =
    await Promise.all([
      getProfileStats(db, profile.id, seasonStart),
      loadProfileSyncState(db, profile, now),
      catalog,
      loadProfileGroupData(db, profile.id, now.getTime(), seasonStart, catalog),
      isGroupMember(db, profile.id),
    ]);
  const tab = availableTab(view.tab, isMember);
  if (!stats) return unregistered; // borrado entre las dos consultas
  const arenaQuiet = await loadArenaQuiet(
    db,
    profile,
    syncState.lastJobError,
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

  // La vista sale del mismo cálculo (memorizado) que los títulos y el ELO de la cabecera.
  const group =
    tab === "grupo" && groupData.view
      ? { view: groupData.view, ownerKey: memberKey(profile.id) }
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
    lastSyncedAt: syncState.lastSyncedAt,
    lastGameAt: stats.lastGameAt,
    sync: syncState.sync,
    lastJobError: syncState.lastJobError,
    paused: syncState.paused,
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
    titles: groupData.titles,
    elo: groupData.elo,
    isMember,
    versions: {
      version: versions.profile,
      groupVersion: isMember ? versions.group : null,
    },
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
