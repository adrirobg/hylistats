// Vista-modelo de la vitrina de la cabecera del perfil (iter-11, T01): convierte lo que ya existe
// (títulos vigentes de un miembro, ELO del grupo, campeones verificados) en lo que pinta la
// cabecera, como funciones puras, sin React, BD ni navegador. Las reglas salen del dominio
// (`group-titles.ts`, `elo.ts`); aquí solo se agrupa, se ordena y se redacta. Sustituyó a
// `title-badges.ts`, que pintaba un badge por título y periodo. Importa `ddragon.ts`
// (`server-only`): se usa desde componentes de servidor y la carga, nunca desde cliente.

import { type EloStanding, formatEloChange } from "@/domain/elo";
import {
  formatAvgDamage,
  formatAvgPlacement,
  type PeriodKind,
  type PlayerTitle,
  TITLE_DEFINITIONS,
  type TitleHolder,
  type TitleId,
  type TitleMetric,
} from "@/domain/group-titles";
import type { GroupView, GroupViewMember } from "@/domain/group-view";
import type { VerifiedChampion } from "@/domain/stats";
import { ELO_LEAGUES } from "@/lib/config";
import { type ChampionCatalog, championSplashUrl } from "@/lib/ddragon";
import { formatCount } from "@/lib/format";
import { TITLES_ANCHOR, TITLES_LINK_LABEL } from "../../grupo/group-view-model";

/**
 * Enlace al apartado Títulos de la pestaña Grupo del mismo perfil (la cabecera no es la vista del
 * grupo). Relativo: conserva la ruta del perfil donde se pinta, que solo sale en miembros.
 */
export const TITLES_LINK = {
  href: `?tab=grupo#${TITLES_ANCHOR}`,
  label: TITLES_LINK_LABEL,
} as const;

// ---------------------------------------------------------------------------------------------
// Títulos
// ---------------------------------------------------------------------------------------------

export type TitleTone = "honor" | "shame";

/** Tono de cada título: honor en turquesa, vergüenza en rosa apagado. */
const TONES: Record<TitleId, TitleTone> = {
  devil: "honor",
  brokenTrio: "honor",
  brokenDuo: "honor",
  troll: "shame",
  pacifist: "shame",
  boomTrio: "shame",
  boomDuo: "shame",
};

/** Texto corto de la métrica de cada título, junto a su nombre: "más 1º juntos". */
const METRICS: Record<TitleId, string> = {
  devil: "más daño medio",
  pacifist: "menos daño medio",
  troll: "peor puesto medio",
  brokenTrio: "más 1º juntos",
  brokenDuo: "más 1º juntos",
  boomTrio: "peor puesto medio juntos",
  boomDuo: "peor puesto medio juntos",
};

/** Un compañero del dueño en un título de dúo o trío: chip con su icono, enlazado a su perfil. */
export interface TitleMate {
  name: string;
  /** Slug del perfil del compañero (`/euw/<slug>`). */
  slug: string;
  /** Icono de invocador; `null` sin icono guardado o sin catálogo. */
  iconUrl: string | null;
}

/** Lo que lleva el dueño en un periodo, ya redactado. */
export interface TitleMatePeriod {
  kind: PeriodKind;
  /** Texto corto con los números del poseedor: "2 primeros en 6 · 2,33", "media 4,70 en 10". */
  text: string;
  /** El `why` completo del dominio, para el `title` del elemento. */
  why: string;
}

/**
 * Una línea de un título: los mismos compañeros (ninguno en los individuales) con los periodos en
 * que comparten el título con el dueño, el día antes que la semana.
 */
export interface TitleMateLine {
  mates: TitleMate[];
  periods: TitleMatePeriod[];
}

export interface TitleRow {
  id: TitleId;
  /** Nombre de la definición, sin periodo: "Equipo mental boom". */
  name: string;
  tone: TitleTone;
  /** Qué mide, corto y en minúscula: "más 1º juntos", "peor puesto medio", "menos daño medio". */
  metric: string;
  /**
   * Una línea por conjunto de compañeros, en el orden de aparición (día primero): el mismo dúo hoy
   * y en la semana es una sola línea con dos periodos. Con empate (dos poseedores del dueño en el
   * mismo periodo, p. ej. dos dúos) salen líneas distintas.
   */
  lines: TitleMateLine[];
}

/** El texto corto de un periodo según lo que mide el título: "2 primeros en 6 · 2,33". */
function periodText(metric: TitleMetric, holder: TitleHolder): string {
  const games = formatCount(holder.games);
  if (metric === "firsts") {
    const word = holder.firsts === 1 ? "primero" : "primeros";
    return `${formatCount(holder.firsts)} ${word} en ${games} · ${formatAvgPlacement(holder.avgPlacement)}`;
  }
  if (metric === "avgDamage") {
    return `${formatAvgDamage(holder.avgDamage ?? holder.value)} de daño en ${games}`;
  }
  return `media ${formatAvgPlacement(holder.value)} en ${games}`;
}

/**
 * Una fila por título que lleva `ownerKey`, en el orden de `TITLE_DEFINITIONS` (no se separa por
 * tono). `titles` son los `PlayerTitle` del dueño (`titlesOf`); los títulos que no lleva no
 * generan fila. Dentro de cada fila se agrupa por compañeros (`TitleMateLine`).
 */
export function titleRows(
  titles: readonly PlayerTitle[],
  ownerKey: string,
  members: readonly GroupViewMember[],
): TitleRow[] {
  const rows: TitleRow[] = [];
  for (const def of TITLE_DEFINITIONS) {
    // El día antes que la semana (sort estable: el resto conserva el orden recibido).
    const mine = titles
      .filter(({ title }) => title.id === def.id)
      .sort(
        (a, b) =>
          Number(a.title.kind === "week") - Number(b.title.kind === "week"),
      );
    if (mine.length === 0) continue;
    const lines = new Map<string, TitleMateLine>();
    for (const { title, holder } of mine) {
      const mates = members.filter(
        (m) => m.key !== ownerKey && holder.puuids.includes(m.key),
      );
      const id = mates.map((m) => m.key).join("|");
      let line = lines.get(id);
      if (!line) {
        line = {
          mates: mates.map((m) => ({
            name: m.gameName,
            slug: m.slug,
            iconUrl: m.profileIconUrl,
          })),
          periods: [],
        };
        lines.set(id, line);
      }
      line.periods.push({
        kind: title.kind,
        text: periodText(def.metric, holder),
        why: holder.why,
      });
    }
    rows.push({
      id: def.id,
      name: def.name,
      tone: TONES[def.id],
      metric: METRICS[def.id],
      lines: [...lines.values()],
    });
  }
  return rows;
}

/**
 * Los mínimos para optar a un título, para el estado vacío del bloque (I5): los de los títulos
 * individuales y los de dúo y trío, tal como los escribe el dominio.
 */
export function titlesMinimumText(): string {
  const player = TITLE_DEFINITIONS.find((d) => d.subject === "player");
  const team = TITLE_DEFINITIONS.find((d) => d.subject !== "player");
  return `Los individuales piden ${player?.minimumText}; los de dúo y trío, ${team?.minimumText}.`;
}

// ---------------------------------------------------------------------------------------------
// El grupo hoy y distancias del ELO
// ---------------------------------------------------------------------------------------------

/** Una partida reciente de hoy de un miembro: el retrato con su puesto. */
export interface TodayLast {
  /** Para la `key` del elemento: un mismo campeón puede repetirse. */
  matchId: string;
  /** Nombre de visualización (`es_ES`) del catálogo; sin él, el `championName` de la partida. */
  championName: string;
  /** Retrato de Data Dragon; `null` si el campeón no está en el catálogo. */
  portraitUrl: string | null;
  placement: number;
}

export interface GroupTodayRow {
  position: number;
  name: string;
  /** Slug del perfil del miembro (`/euw/<slug>`). */
  slug: string;
  leagueId: EloStanding["league"]["id"];
  /** Rating redondeado. */
  rating: number;
  provisional: boolean;
  /** Cambio del día mostrado en la Clasificación; `null` si no jugó en él. */
  dayChange: number | null;
  /** La fila del dueño del perfil. */
  me: boolean;
  /** De HOY (estricto): partidas, 1º, puesto medio (`"3,17"`, `null` sin partidas) y campeones. */
  games: number;
  firsts: number;
  avgPlacement: string | null;
  /** Hasta 5, la más reciente primero. */
  last: TodayLast[];
}

/**
 * Las filas de «El grupo hoy»: todos los miembros en el orden de la Clasificación (posiciones
 * compartidas en empate de rating redondeado, como en la pestaña Grupo) con su actividad de hoy.
 * Una posición sin miembro en `view.members` (no debería ocurrir) se omite.
 */
export function groupTodayRows(
  view: Pick<GroupView, "elo" | "members" | "today">,
  ownerKey: string,
  catalog: ChampionCatalog,
): GroupTodayRow[] {
  const byKey = new Map(view.members.map((m) => [m.key, m]));
  const champions = new Map(catalog.champions.map((c) => [c.championId, c]));
  const rows: GroupTodayRow[] = [];
  for (const s of view.elo.standings) {
    const member = byKey.get(s.key);
    if (!member) continue;
    const today = view.today.members[s.key];
    rows.push({
      position: s.position,
      name: member.gameName,
      slug: member.slug,
      leagueId: s.league.id,
      rating: s.roundedRating,
      provisional: s.provisional,
      dayChange: s.dayChange,
      me: s.key === ownerKey,
      games: today?.games ?? 0,
      firsts: today?.firsts ?? 0,
      avgPlacement:
        today?.avgPlacement == null
          ? null
          : formatAvgPlacement(today.avgPlacement),
      last: (today?.last ?? []).map((g) => {
        const champion = champions.get(g.championId);
        return {
          matchId: g.matchId,
          championName: champion?.name ?? g.championName,
          portraitUrl: champion?.portraitUrl ?? null,
          placement: g.placement,
        };
      }),
    });
  }
  return rows;
}

export interface EloFacts {
  position: number;
  total: number;
  /** El miembro inmediatamente por encima (menor rating redondeado estrictamente mayor). */
  above: { name: string; diff: number } | null;
  /** Ventaja sobre el siguiente (0 si empata); solo sin nadie por encima, `null` si es el único. */
  leadBy: number | null;
  /** Siguiente liga y puntos que faltan; `null` en Diamante. */
  nextLeague: { name: string; diff: number } | null;
}

/**
 * Distancias del dueño en la Clasificación, para la línea de liga de la identidad y el pie de la escalera.
 * `null` si `ownerKey` no está en ella (no miembro): quien llama no debe pintar el trofeo.
 * Con varios miembros igualados encima, `above` es el primero en `standings`.
 */
export function eloFacts(
  standings: readonly EloStanding[],
  members: readonly GroupViewMember[],
  ownerKey: string,
): EloFacts | null {
  const own = standings.find((s) => s.key === ownerKey);
  if (!own) return null;
  const names = new Map(members.map((m) => [m.key, m.gameName]));
  const nameOf = (s: EloStanding) => names.get(s.key) ?? "";

  let above: EloStanding | null = null;
  let nextBelow: EloStanding | null = null;
  for (const s of standings) {
    if (s.key === ownerKey) continue;
    if (s.roundedRating > own.roundedRating) {
      if (!above || s.roundedRating < above.roundedRating) above = s;
    } else if (!nextBelow || s.roundedRating > nextBelow.roundedRating) {
      nextBelow = s;
    }
  }

  const next = ELO_LEAGUES.find((l) => l.min > own.roundedRating);
  return {
    position: own.position,
    total: standings.length,
    above: above
      ? { name: nameOf(above), diff: above.roundedRating - own.roundedRating }
      : null,
    leadBy:
      above || !nextBelow ? null : own.roundedRating - nextBelow.roundedRating,
    nextLeague: next
      ? { name: next.name, diff: next.min - own.roundedRating }
      : null,
  };
}

/** Cambio para los chips: "+12", "−7" (menos tipográfico U+2212) y "0". */
export function deltaText(n: number): string {
  return formatEloChange(n).replace("-", "−");
}

/** Color del cambio, según el valor mostrado (redondeado): sube, baja o se queda igual. */
export function deltaTone(n: number): "up" | "down" | "zero" {
  const text = formatEloChange(n);
  return text.startsWith("+") ? "up" : text.startsWith("-") ? "down" : "zero";
}

/**
 * La distancia con el de arriba ("a 3 de Azpekaa") o, sin nadie por encima, la ventaja ("líder
 * por 12"; "empatado en cabeza" si el siguiente tiene el mismo rating). `null` si es el único.
 */
export function aboveText(facts: EloFacts): string | null {
  if (facts.above) return `a ${facts.above.diff} de ${facts.above.name}`;
  if (facts.leadBy === null) return null;
  return facts.leadBy > 0 ? `líder por ${facts.leadBy}` : "empatado en cabeza";
}

/** Lo que falta para la siguiente liga ("a 18 de Oro"); `null` en Diamante. */
export function nextLeagueText(facts: EloFacts): string | null {
  return facts.nextLeague
    ? `a ${facts.nextLeague.diff} de ${facts.nextLeague.name}`
    : null;
}

// ---------------------------------------------------------------------------------------------
// Fondo
// ---------------------------------------------------------------------------------------------

export interface SplashChampion {
  name: string;
  splashUrl: string;
}

/**
 * El campeón del fondo: el del 1º más reciente (`lastWinAt`; a igualdad, el `championId` mayor,
 * para que sea determinista). `null` sin verificados o si el campeón no está en el catálogo (no
 * hay `ddId` con que construir el splash): el banner usa entonces el degradado de la liga.
 */
export function splashChampion(
  verified: readonly VerifiedChampion[],
  catalog: ChampionCatalog,
): SplashChampion | null {
  let latest: VerifiedChampion | null = null;
  for (const v of verified) {
    if (
      !latest ||
      v.lastWinAt > latest.lastWinAt ||
      (v.lastWinAt === latest.lastWinAt && v.championId > latest.championId)
    ) {
      latest = v;
    }
  }
  if (!latest) return null;
  const champion = catalog.champions.find(
    (c) => c.championId === latest.championId,
  );
  if (!champion) return null;
  return { name: champion.name, splashUrl: championSplashUrl(champion.ddId) };
}

// ---------------------------------------------------------------------------------------------
// Lo que viaja a la página
// ---------------------------------------------------------------------------------------------

/** Títulos, el grupo hoy y distancias del ELO de un miembro: lo que pinta la vitrina, ya derivado. */
export interface VitrinaGroup {
  titles: TitleRow[];
  /** Todos los miembros en el orden de la Clasificación, con su actividad de hoy. */
  today: GroupTodayRow[];
  /** Partidas distintas del día (para la cabecera de «El grupo hoy»). */
  todayGames: number;
  facts: EloFacts;
}

export interface ProfileVitrina {
  /** Campeón del fondo (todos los perfiles); `null`: degradado. */
  splash: SplashChampion | null;
  /** Solo miembros con fila en la Clasificación; `null` en el resto (I1: solo Dios de Arena). */
  group: VitrinaGroup | null;
}

/**
 * La vitrina de un perfil a partir de lo que la carga ya tiene: sus verificados, el catálogo, sus
 * títulos y la vista del grupo (`null` en no miembros). De la vista solo se leen la Clasificación,
 * los miembros y lo de hoy, y solo sale lo que se pinta: la `GroupView` no viaja.
 */
export function profileVitrina(input: {
  verified: readonly VerifiedChampion[];
  catalog: ChampionCatalog;
  titles: readonly PlayerTitle[];
  view: Pick<GroupView, "elo" | "members" | "today"> | null;
  ownerKey: string;
}): ProfileVitrina {
  const { view, ownerKey } = input;
  const facts = view && eloFacts(view.elo.standings, view.members, ownerKey);
  return {
    splash: splashChampion(input.verified, input.catalog),
    group:
      view && facts
        ? {
            titles: titleRows(input.titles, ownerKey, view.members),
            today: groupTodayRows(view, ownerKey, input.catalog),
            todayGames: view.today.games,
            facts,
          }
        : null,
  };
}
