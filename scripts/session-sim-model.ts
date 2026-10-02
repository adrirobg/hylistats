// Lógica pura del script de sesión simulada (`scripts/simulate-session.ts`): argumentos,
// planificación de los pollers, política del modo `despues` y agregación de las mediciones. Sin
// red ni temporizadores, para poder probarla (`tests/session-sim.test.ts`).

export type Mode = "antes" | "despues";

export const ALL_TABS = [
  "campeones",
  "resumen",
  "estadisticas",
  "companeros",
  "partidas",
  "grupo",
] as const;
export type Tab = (typeof ALL_TABS)[number];

/** Periodo del comportamiento real de `develop` (auto-refresh-policy.ts, grupo/group-freshness.tsx). */
export const POLL_IDLE_MS = 30_000;
/** Periodo de consulta del estado en el modo `despues` (spec AC2). */
export const STATUS_POLL_MS = 10_000;

/**
 * Contrato de la petición de estado de T02 (modo `despues`). PUNTO DE ENCHUFE: cuando T02 fije la
 * ruta y el campo, se rellenan estas dos constantes. Mientras tanto se pueden pasar por CLI con
 * `--status-path` y `--version-field`. `{slug}` en la ruta se sustituye por el slug del cliente.
 */
export const STATUS_CONTRACT: {
  path: string | null;
  versionField: string | null;
} = {
  path: null,
  versionField: null,
};

export const PENDING_CONTRACT_MESSAGE =
  'Modo "despues": pendiente del contrato de T02 (ruta de la petición de estado y campo de versión). ' +
  "Rellena STATUS_CONTRACT en scripts/session-sim-model.ts o pasa --status-path y --version-field.";

export type RequestKind =
  /** Carga inicial de la página (HTML completo, como abrir el enlace). */
  | "carga"
  /** Cambio de pestaña (navegación cliente: petición RSC). */
  | "navegacion"
  /** `router.refresh()` (petición RSC de la página entera). */
  | "refresco"
  /** Petición de estado del modo `despues`. */
  | "estado";

/** Las que renderizan la página entera en el servidor. */
export function isPageRender(kind: RequestKind): boolean {
  return kind !== "estado";
}

export interface Options {
  baseUrl: string;
  /** Duración de la prueba. */
  durationMs: number;
  clients: number;
  slugs: string[];
  mode: Mode;
  tabs: Tab[];
  startTab: Tab;
  /** 0 = los clientes no cambian de pestaña. */
  switchEveryMs: number;
  timeoutMs: number;
  /** `true` = cabecera `RSC: 1` en navegaciones y refrescos (lo que hace `router.refresh()`). */
  rsc: boolean;
  statusPath: string | null;
  versionField: string | null;
}

export class UsageError extends Error {}

/** `Nombre#TAG` -> slug del perfil (`profileSlug`); si ya es un slug se respeta. */
export function toSlug(input: string): string {
  const raw = input.trim();
  const at = raw.lastIndexOf("#");
  if (at > 0) {
    return encodeURIComponent(
      `${raw.slice(0, at).trim()}-${raw.slice(at + 1).trim()}`,
    );
  }
  // Ya codificado (`%20`) o sin caracteres especiales: tal cual.
  return /[^A-Za-z0-9\-_.~%]/.test(raw) ? encodeURIComponent(raw) : raw;
}

export interface RawArgs {
  "base-url"?: string;
  clients?: string;
  duration?: string;
  slugs?: string;
  mode?: string;
  tabs?: string;
  "start-tab"?: string;
  "switch-every"?: string;
  timeout?: string;
  "no-rsc"?: boolean;
  "status-path"?: string;
  "version-field"?: string;
}

function num(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) {
    throw new UsageError(`--${name}: número inválido (${value}).`);
  }
  return n;
}

function asTab(value: string): Tab {
  const tab = ALL_TABS.find((t) => t === value);
  if (!tab) {
    throw new UsageError(
      `Pestaña desconocida: ${value} (válidas: ${ALL_TABS.join(", ")}).`,
    );
  }
  return tab;
}

export function parseOptions(raw: RawArgs): Options {
  const mode = raw.mode ?? "antes";
  if (mode !== "antes" && mode !== "despues") {
    throw new UsageError(`--mode: "antes" o "despues" (recibido: ${mode}).`);
  }
  const slugs = (raw.slugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(toSlug);
  if (slugs.length === 0) {
    throw new UsageError(
      "Falta --slugs (lista separada por comas: Nombre#TAG o slug).",
    );
  }
  const baseUrl = (raw["base-url"] ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  try {
    new URL(baseUrl);
  } catch {
    throw new UsageError(`--base-url inválida: ${baseUrl}`);
  }
  const tabs = raw.tabs
    ? raw.tabs.split(",").map((t) => asTab(t.trim()))
    : [...ALL_TABS];
  return {
    baseUrl,
    clients: Math.floor(num("clients", raw.clients, 5, 1)),
    durationMs: num("duration", raw.duration, 15, 0.01) * 60_000,
    slugs,
    mode,
    tabs,
    startTab: raw["start-tab"] ? asTab(raw["start-tab"]) : "grupo",
    switchEveryMs: num("switch-every", raw["switch-every"], 30, 0) * 1000,
    timeoutMs: num("timeout", raw.timeout, 60, 1) * 1000,
    rsc: !raw["no-rsc"],
    statusPath: raw["status-path"] ?? STATUS_CONTRACT.path,
    versionField: raw["version-field"] ?? STATUS_CONTRACT.versionField,
  };
}

export function pageUrl(baseUrl: string, slug: string, tab: Tab): string {
  return `${baseUrl}/euw/${slug}?tab=${tab}`;
}

export function statusUrl(baseUrl: string, path: string, slug: string): string {
  return `${baseUrl}${path.replaceAll("{slug}", slug)}`;
}

/** Siguiente pestaña del ciclo (si la actual no está en la lista, empieza por la primera). */
export function nextTab(tabs: readonly Tab[], current: Tab): Tab {
  const i = tabs.indexOf(current);
  return tabs[(i + 1) % tabs.length] ?? current;
}

/**
 * Pollers de `router.refresh()` activos en una pestaña, en el modo `antes` (imita `develop`):
 * `AutoRefresh` siempre (cada 30 s en reposo) y `GroupFreshness` solo en la pestaña Grupo (otros
 * 30 s). El modo `despues` no repinta por reloj: lo hace el poller de estado.
 */
export function refreshPollers(mode: Mode, tab: Tab): number[] {
  if (mode === "despues") return [];
  return tab === "grupo" ? [POLL_IDLE_MS, POLL_IDLE_MS] : [POLL_IDLE_MS];
}

/** Lee un campo (ruta con puntos: `grupo.version`) de la respuesta de estado como texto estable. */
export function readVersion(body: unknown, field: string): string | null {
  let cur: unknown = body;
  for (const key of field.split(".")) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur === undefined || cur === null) return null;
  return typeof cur === "object" ? JSON.stringify(cur) : String(cur);
}

/**
 * Modo `despues`: pedir la página solo si la versión cambió. La primera lectura fija la línea base
 * (la página ya se pintó con ella); una lectura ausente no repinta.
 */
export function shouldRepaint(
  previous: string | null,
  current: string | null,
): boolean {
  return previous !== null && current !== null && previous !== current;
}

/** Retardo inicial aleatorio de un poller: desfasa a los clientes como lo harían pestañas reales. */
export function initialOffset(periodMs: number, rand: () => number): number {
  return Math.floor(rand() * periodMs);
}

export interface Sample {
  kind: RequestKind;
  tab: Tab;
  /** `0` = fallo de red o timeout. */
  status: number;
  ms: number;
  bytes: number;
  /** ms desde el inicio de la prueba. */
  at: number;
  /** Motivo del fallo de red (`status` 0). */
  error?: string;
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number;
}

export interface Stat {
  n: number;
  p50: number;
  p95: number;
  max: number;
}

export function summarize(values: readonly number[]): Stat {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.length ? (sorted[sorted.length - 1] as number) : Number.NaN,
  };
}

export interface Report {
  total: number;
  byKind: Record<string, Stat>;
  byTab: Record<string, Stat>;
  byKindTab: Record<string, Stat>;
  byStatus: Record<string, number>;
  failures: number;
  pageRenders: number;
  rendersPerMinute: number;
  /** Renders de página en cada minuto de la prueba (índice 0 = primer minuto). */
  rendersPerMinuteBuckets: number[];
  bytesMean: number;
}

function group(
  samples: readonly Sample[],
  key: (s: Sample) => string,
): Record<string, Stat> {
  const buckets = new Map<string, number[]>();
  for (const s of samples) {
    const k = key(s);
    const list = buckets.get(k);
    if (list) list.push(s.ms);
    else buckets.set(k, [s.ms]);
  }
  return Object.fromEntries(
    [...buckets].sort().map(([k, v]) => [k, summarize(v)]),
  );
}

/** Agrega las muestras. `elapsedMs` = lo que duró de verdad la prueba (puede cortarse en un 5xx). */
export function buildReport(
  samples: readonly Sample[],
  elapsedMs: number,
): Report {
  const renders = samples.filter((s) => isPageRender(s.kind));
  const minutes = Math.max(elapsedMs / 60_000, 1e-9);
  const buckets: number[] = [];
  for (const s of renders) {
    const i = Math.floor(s.at / 60_000);
    buckets[i] = (buckets[i] ?? 0) + 1;
  }
  const byStatus: Record<string, number> = {};
  for (const s of samples) {
    const k = s.status === 0 ? "fallo-red" : String(s.status);
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  return {
    total: samples.length,
    byKind: group(samples, (s) => s.kind),
    byTab: group(renders, (s) => s.tab),
    byKindTab: group(renders, (s) => `${s.kind}/${s.tab}`),
    byStatus,
    failures: samples.filter((s) => s.status === 0 || s.status >= 500).length,
    pageRenders: renders.length,
    rendersPerMinute: renders.length / minutes,
    rendersPerMinuteBuckets: Array.from(
      { length: Math.max(1, Math.ceil(minutes - 0.005)) },
      (_, i) => buckets[i] ?? 0,
    ),
    bytesMean: samples.length
      ? samples.reduce((a, s) => a + s.bytes, 0) / samples.length
      : 0,
  };
}
