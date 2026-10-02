// Vista del grupo calculada una vez (iter-10, F26, palanca C): memo en memoria de la última
// `GroupView`, que comparten todos los visores, la cabecera del perfil (títulos y ELO) y la pestaña
// Grupo. Antes cada página la recalculaba (y `tab=grupo`, dos veces).
//
// Clave: versión del grupo (`groupVersion`, sube cuando el worker guarda algo de un miembro o
// `/admin` cambia la lista) + día de juego (F17) + semana de juego (F20) de `now`, más lo demás de
// lo que depende el resultado: el año UTC de `now` (las etiquetas de fecha llevan el año si no es el
// de `now`), el inicio de temporada y el catálogo (versión de los iconos y `championTotal`). Dentro
// de una misma clave el resultado no depende de `now`. Solo se guarda la última entrada.
//
// Lo único de la vista que cambia sin subir la versión es `lastSyncedAt` (un incremental sin
// partidas nuevas no la sube): se superpone en cada lectura desde `listGroupMembers`, una consulta
// ligera que hace falta igualmente para saber si el perfil es miembro.
//
// Se guarda la PROMESA: dos peticiones con la misma clave a la vez comparten un solo cálculo. Si el
// cálculo falla, la entrada se descarta y la siguiente petición lo reintenta.
//
// En `globalThis`, como la señal de despertar de `src/worker/queue.ts`: las rutas de Next y el
// worker comparten proceso pero pueden cargar copias distintas de este módulo. Vale con UNA sola
// instancia de la app (AGENTS.md). No se usa `"use cache"` ni `unstable_cache` (Riesgos de la spec).

import type { Db } from "@/db";
import { getSeasonStart } from "@/lib/config";
import { groupVersion } from "@/lib/data-version";
import type { ChampionCatalog } from "@/lib/ddragon";
import { type GroupMember, listGroupMembers } from "./group";
import { gameWeek } from "./group-titles";
import {
  type GroupView,
  loadGroupView,
  memberKey,
  oldestSyncOf,
  type ProfileGroupData,
  profileGroupDataOf,
} from "./group-view";
import { gameDay } from "./records";

const EMPTY_CATALOG: ChampionCatalog = { version: null, champions: [] };

interface GroupViewMemo {
  key: string | null;
  promise: Promise<GroupView> | null;
  /** Cálculos de `GroupView` desde el arranque (AC8: cálculos = cambios de versión). */
  computations: number;
}

const globalForMemo = globalThis as typeof globalThis & {
  __hylistatsGroupViewMemo?: GroupViewMemo;
};

function getMemo(): GroupViewMemo {
  globalForMemo.__hylistatsGroupViewMemo ??= {
    key: null,
    promise: null,
    computations: 0,
  };
  return globalForMemo.__hylistatsGroupViewMemo;
}

/** Clave del memo para `now` con la versión actual del grupo. Solo se compara por igualdad. */
export function groupViewKey(
  now: number,
  seasonStart: Date,
  catalog: ChampionCatalog,
): string {
  return [
    groupVersion(),
    gameDay(now),
    gameWeek(now),
    new Date(now).getUTCFullYear(),
    seasonStart.getTime(),
    catalog.version ?? "-",
    catalog.champions.length,
  ].join("|");
}

/**
 * `GroupView` de `loadGroupView` (mismos argumentos), calculada como mucho una vez por clave. El
 * `lastSyncedAt` de los miembros y `oldestSync` NO están al día: los superpone `withFreshSync`.
 */
async function memoGroupView(
  db: Db,
  now: number,
  seasonStart: Date,
  catalog: ChampionCatalog | Promise<ChampionCatalog>,
): Promise<GroupView> {
  const championCatalog = await catalog;
  const key = groupViewKey(now, seasonStart, championCatalog);
  const memo = getMemo();
  // Sin `await` entre la comprobación y la asignación: dos peticiones no pueden colarse a la vez.
  if (memo.key === key && memo.promise) return memo.promise;
  const count = ++memo.computations;
  const started = Date.now();
  const promise = loadGroupView(db, now, seasonStart, championCatalog);
  memo.key = key;
  memo.promise = promise;
  promise.then(
    () => logComputation(count, key, Date.now() - started),
    () => {
      if (memo.promise === promise) {
        memo.key = null;
        memo.promise = null;
      }
    },
  );
  return promise;
}

/** Superpone a la vista memorizada la última sincronización de cada miembro (lectura de ahora). */
function withFreshSync(
  view: GroupView,
  members: readonly GroupMember[],
): GroupView {
  const lastSyncedAt = new Map(
    members.map((m) => [memberKey(m.profileId), m.lastSyncedAt]),
  );
  return {
    ...view,
    members: view.members.map((m) =>
      lastSyncedAt.has(m.key)
        ? { ...m, lastSyncedAt: lastSyncedAt.get(m.key) ?? null }
        : m,
    ),
    oldestSync: oldestSyncOf(members),
  };
}

/** Lo que el grupo aporta a la página de un perfil, de UN solo cálculo de la vista. */
export interface ProfileGroupLoad extends ProfileGroupData {
  /** La vista completa (pestaña Grupo); `null` si el perfil no es miembro. */
  view: GroupView | null;
}

/**
 * Títulos y ELO de la cabecera de un perfil y la vista del grupo para su pestaña Grupo, del mismo
 * cálculo memorizado (los valores son los de `loadGroupView` + `profileGroupDataOf`). Para un no
 * miembro (o un perfil que no existe) no se calcula nada: `{ titles: [], elo: null, view: null }`.
 * Argumentos como `loadGroupView`.
 */
export async function loadProfileGroupData(
  db: Db,
  profileId: number,
  now: number,
  seasonStart: Date = getSeasonStart(),
  catalog: ChampionCatalog | Promise<ChampionCatalog> = EMPTY_CATALOG,
): Promise<ProfileGroupLoad> {
  const members = await listGroupMembers(db);
  if (!members.some((m) => m.profileId === profileId)) {
    return { titles: [], elo: null, view: null };
  }
  const view = withFreshSync(
    await memoGroupView(db, now, seasonStart, catalog),
    members,
  );
  return { ...profileGroupDataOf(view, profileId), view };
}

/** Cálculos de `GroupView` hechos por el memo desde el arranque (tests y medición de AC8). */
export function groupViewComputations(): number {
  return getMemo().computations;
}

/** Vacía el memo (tests: los datos de la BD cambian sin subir la versión). No toca el contador. */
export function resetGroupViewMemo(): void {
  const memo = getMemo();
  memo.key = null;
  memo.promise = null;
}

/**
 * Con `GROUP_VIEW_LOG=1` en el entorno, una línea por cálculo (medición de AC8 sobre el build de
 * producción: se cuentan las líneas). Sin la variable no escribe nada.
 */
function logComputation(count: number, key: string, ms: number): void {
  if (process.env.GROUP_VIEW_LOG !== "1") return;
  console.info(`[group-view] cálculo #${count} clave=${key} ${ms} ms`);
}
