// Enlaces externos «Builds y meta» de un campeón (brief §4.9) como función pura. Cada web tiene su
// propia forma de escribir el nombre; las plantillas y las excepciones salen de comprobar el
// catálogo de Data Dragon (16.19.1, 173 campeones) contra las propias webs:
//
//   op.gg       `lower(ddId)`, sin excepciones (173/173 contra su tier list de Arena).
//   LoLalytics  `lower(ddId)`; `MonkeyKing` es `wukong` (173/173 contra su home de Arena).
//   METAsrc     `kebab(ddId)`, con cinco excepciones (173/173 contra su tier list de Arena).
//   u.gg        `lower(ddId)` (comprobado a mano en diez campeones, `monkeyking` y `wukong` valen).
//   Blitz       el `ddId` tal cual, con sus mayúsculas (`ahri` redirige a `Ahri`; ocho a mano).
//
// `ddId` es el `id` de Data Dragon (`MonkeyKing`, no `Wukong`; `Nunu`, no `Nunu & Willump`). Sin él
// (campeón fuera del catálogo) no se inventa ningún enlace.

export type LinkSite = "opgg" | "lolalytics" | "metasrc" | "ugg" | "blitz";

export interface ChampionLink {
  site: LinkSite;
  /** Texto visible. */
  label: string;
  href: string;
  /** Nombre accesible: dice a qué web va y que se abre en otra pestaña. */
  ariaLabel: string;
}

/** `TwistedFate` -> `twisted-fate`; `KSante` -> `ksante` (solo parte minúscula + mayúscula). */
const kebab = (ddId: string) =>
  ddId.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

/** Campeones cuyo slug en METAsrc no sale de `kebab(ddId)`. */
const METASRC_EXCEPTIONS: Readonly<Record<string, string>> = {
  JarvanIV: "jarvan",
  KogMaw: "kogmaw",
  MonkeyKing: "wukong",
  RekSai: "reksai",
  Renata: "renata-glasc",
};

/** Campeones cuyo slug en LoLalytics no es `lower(ddId)`. */
const LOLALYTICS_EXCEPTIONS: Readonly<Record<string, string>> = {
  MonkeyKing: "wukong",
};

interface Site {
  site: LinkSite;
  label: string;
  href: (ddId: string) => string;
}

// El `ddId` es alfanumérico, pero viene de una fuente externa: se codifica al ponerlo en una ruta.
const SITES: readonly Site[] = [
  {
    site: "opgg",
    label: "op.gg",
    href: (id) =>
      `https://op.gg/lol/modes/arena/${encodeURIComponent(id.toLowerCase())}/build`,
  },
  {
    site: "lolalytics",
    label: "LoLalytics",
    href: (id) =>
      `https://lolalytics.com/lol/${encodeURIComponent(LOLALYTICS_EXCEPTIONS[id] ?? id.toLowerCase())}/arena/build/`,
  },
  {
    site: "metasrc",
    label: "METAsrc",
    href: (id) =>
      `https://www.metasrc.com/lol/arena/champions/${encodeURIComponent(METASRC_EXCEPTIONS[id] ?? kebab(id))}/build`,
  },
  {
    site: "ugg",
    label: "u.gg",
    href: (id) =>
      `https://u.gg/lol/champions/arena/${encodeURIComponent(id.toLowerCase())}-arena-build`,
  },
  {
    site: "blitz",
    label: "Blitz",
    href: (id) =>
      `https://blitz.gg/lol/champions/${encodeURIComponent(id)}/arena`,
  },
];

/**
 * Los cinco enlaces, en el orden op.gg, LoLalytics, METAsrc, u.gg y Blitz. `name` es el nombre de
 * visualización (para el nombre accesible). Sin `ddId` devuelve `[]`.
 */
export function championLinks(
  ddId: string | null,
  name: string,
): ChampionLink[] {
  if (ddId === null || ddId === "") return [];
  return SITES.map(({ site, label, href }) => ({
    site,
    label,
    href: href(ddId),
    ariaLabel: `${label}: builds y meta de ${name} (se abre en otra pestaña)`,
  }));
}
