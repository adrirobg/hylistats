// Vista-modelo de la vitrina de la cabecera del perfil (iter-11, T01): convierte lo que ya existe
// (títulos vigentes de un miembro, ELO del grupo, campeones verificados) en lo que pinta la
// cabecera, como funciones puras, sin React, BD ni navegador. Las reglas salen del dominio
// (`group-titles.ts`, `elo.ts`); aquí solo se agrupa, se ordena y se redacta. Sustituyó a
// `title-badges.ts`, que pintaba un badge por título y periodo. Importa `ddragon.ts`
// (`server-only`): se usa desde componentes de servidor y la carga, nunca desde cliente.

import { type EloStanding, formatEloChange, type GroupElo } from "@/domain/elo";
import {
  type PlayerTitle,
  TITLE_DEFINITIONS,
  type TitleId,
} from "@/domain/group-titles";
import type { GroupView, GroupViewMember } from "@/domain/group-view";
import type { VerifiedChampion } from "@/domain/stats";
import { ELO_LEAGUES } from "@/lib/config";
import { type ChampionCatalog, championSplashUrl } from "@/lib/ddragon";
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

/** Un título en un periodo: el «por qué» y, en dúos y tríos, los compañeros del dueño. */
export interface TitlePeriodLine {
  /** El `why` del poseedor: métrica, valor y partidas. */
  why: string;
  /** `gameName` de los otros miembros del dúo o trío, en el orden de `members`. Vacío en individuales. */
  partners: string[];
}

export interface TitleRow {
  id: TitleId;
  /** Nombre de la definición, sin periodo: "Equipo mental boom". */
  name: string;
  tone: TitleTone;
  /**
   * Lo que lleva en cada periodo. Vacío = no lo lleva (marca apagada). Casi siempre una línea;
   * con empate (el mismo título y periodo con dos poseedores del dueño, p. ej. dos dúos) una por
   * poseedor, en el orden recibido.
   */
  day: TitlePeriodLine[];
  week: TitlePeriodLine[];
}

/**
 * Una fila por título que lleva `ownerKey`, en el orden de `TITLE_DEFINITIONS` (no se separa por
 * tono). `titles` son los `PlayerTitle` del dueño (`titlesOf`); los títulos que no lleva no
 * generan fila.
 */
export function titleRows(
  titles: readonly PlayerTitle[],
  ownerKey: string,
  members: readonly GroupViewMember[],
): TitleRow[] {
  const rows: TitleRow[] = [];
  for (const def of TITLE_DEFINITIONS) {
    const mine = titles.filter(({ title }) => title.id === def.id);
    if (mine.length === 0) continue;
    const row: TitleRow = {
      id: def.id,
      name: def.name,
      tone: TONES[def.id],
      day: [],
      week: [],
    };
    for (const { title, holder } of mine) {
      const partners = members
        .filter((m) => m.key !== ownerKey && holder.puuids.includes(m.key))
        .map((m) => m.gameName);
      row[title.kind].push({ why: holder.why, partners });
    }
    rows.push(row);
  }
  return rows;
}

const PARTNERS = new Intl.ListFormat("es", {
  style: "long",
  type: "conjunction",
});
/**
 * Una línea del «por qué»: "Peor puesto medio juntos del día: 4,25 en 4 partidas · con Azpekaa y
 * zapas14". Sin prefijo de periodo: el `why` del dominio ya lo dice ("del día", "de la semana").
 */
export function titleLineText(line: TitlePeriodLine): string {
  const partners =
    line.partners.length > 0 ? ` · con ${PARTNERS.format(line.partners)}` : "";
  return `${line.why}${partners}`;
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

export interface TitleCounts {
  honor: number;
  shame: number;
}

/** Recuento por tono de las filas, para la cabecera del bloque ("2 de honor · 2 de vergüenza"). */
export function titleCounts(rows: readonly TitleRow[]): TitleCounts {
  const counts: TitleCounts = { honor: 0, shame: 0 };
  for (const row of rows) counts[row.tone] += 1;
  return counts;
}

// ---------------------------------------------------------------------------------------------
// Escalera y trofeo de Liga
// ---------------------------------------------------------------------------------------------

export interface LadderRow {
  position: number;
  name: string;
  /** Slug del perfil del miembro (`/euw/<slug>`). */
  slug: string;
  leagueId: EloStanding["league"]["id"];
  /** Rating redondeado. */
  rating: number;
  /** Cambio del día; `null` si no jugó en él. */
  dayChange: number | null;
  provisional: boolean;
  /** La fila del dueño del perfil. */
  me: boolean;
}

/**
 * La Clasificación completa en su orden (posiciones compartidas en empate de rating redondeado,
 * como en la pestaña Grupo). Una posición sin miembro en `members` (no debería ocurrir) se omite.
 */
export function ladderRows(
  elo: GroupElo,
  members: readonly GroupViewMember[],
  ownerKey: string,
): LadderRow[] {
  const byKey = new Map(members.map((m) => [m.key, m]));
  const rows: LadderRow[] = [];
  for (const s of elo.standings) {
    const member = byKey.get(s.key);
    if (!member) continue;
    rows.push({
      position: s.position,
      name: member.gameName,
      slug: member.slug,
      leagueId: s.league.id,
      rating: s.roundedRating,
      dayChange: s.dayChange,
      provisional: s.provisional,
      me: s.key === ownerKey,
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
 * Distancias del dueño en la Clasificación, para el trofeo de Liga y el pie de la escalera.
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

/** Títulos, escalera y distancias del ELO de un miembro: lo que pinta la vitrina, ya derivado. */
export interface VitrinaGroup {
  titles: TitleRow[];
  ladder: LadderRow[];
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
 * títulos y la vista del grupo (`null` en no miembros). De la vista solo se leen la Clasificación
 * y los miembros, y solo sale lo que se pinta: la `GroupView` no viaja.
 */
export function profileVitrina(input: {
  verified: readonly VerifiedChampion[];
  catalog: ChampionCatalog;
  titles: readonly PlayerTitle[];
  view: Pick<GroupView, "elo" | "members"> | null;
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
            ladder: ladderRows(view.elo, view.members, ownerKey),
            facts,
          }
        : null,
  };
}
