import type { StatusPayload } from "@/lib/status-payload";

// Política del poller único de la página (F26, AC2) como funciones puras (sin React ni DOM),
// para poder probarla: la UI de este repo no tiene jsdom. `status-provider.tsx` solo aplica lo
// que decide este módulo.
//
// La página consulta el estado barato (`GET /api/estado`) y solo rehace el render del servidor
// (`router.refresh()`) si cambió la versión de lo que pinta. Lo que es solo estado (botones
// ocupados, progreso, avisos, toast) se pinta desde el JSON, sin repintar. La frescura va dentro
// de la misma petición (latido), así que no hay otro intervalo.

/** Sin sincronización en marcha el estado se consulta cada 10 s; con ella, cada 5 s. */
export const POLL_IDLE_MS = 10_000;
export const POLL_SYNCING_MS = 5_000;

/** Lo que decide si la página pintada sigue al día: tipo de página y versiones de datos. */
export interface PageVersions {
  kind: StatusPayload["kind"];
  version: string | null;
  /** La del grupo si el perfil es miembro (la cabecera lleva títulos y ELO del grupo). */
  groupVersion: string | null;
}

export const versionsOf = ({
  kind,
  version,
  groupVersion,
}: PageVersions): PageVersions => ({ kind, version, groupVersion });

export function sameVersions(a: PageVersions, b: PageVersions): boolean {
  return (
    a.kind === b.kind &&
    a.version === b.version &&
    a.groupVersion === b.groupVersion
  );
}

/** ¿Se sincroniza algo de lo que mira la página? (el perfil o, en la vista del grupo, un miembro) */
export function isSyncing(status: StatusPayload): boolean {
  return status.profile?.sync != null || (status.group?.active ?? 0) > 0;
}

/**
 * Milisegundos hasta la siguiente consulta; `null` = ninguna (pestaña oculta). Sin consulta previa
 * (`lastPollAt = null`: al montar o al volver a la pestaña) toca ya. El intervalo cuenta desde que
 * volvió la última consulta: si cambia el ritmo (empieza o acaba una sincronización), no se
 * reinicia.
 */
export function nextPollDelay({
  visible,
  syncing,
  lastPollAt,
  now,
}: {
  visible: boolean;
  syncing: boolean;
  lastPollAt: number | null;
  now: number;
}): number | null {
  if (!visible) return null;
  if (lastPollAt === null) return 0;
  const every = syncing ? POLL_SYNCING_MS : POLL_IDLE_MS;
  return Math.max(0, lastPollAt + every - now);
}

/**
 * Tras una consulta: ¿repintar? Solo si la versión cambió respecto a la que pintó la página
 * (`rendered`) y no hay ya un repintado en curso (en producción un render tarda segundos: no se
 * apilan). Se decide una vez por consulta, así que como mucho hay un repintado por consulta.
 */
export function shouldRefresh({
  rendered,
  status,
  refreshing,
}: {
  rendered: PageVersions;
  status: PageVersions;
  refreshing: boolean;
}): boolean {
  return !refreshing && !sameVersions(rendered, status);
}

/**
 * El estado que se pinta: el de la página (`initial`, renderizado en el servidor) o el último
 * consultado, el más reciente por la hora del servidor. Un repintado trae un `initial` nuevo, que
 * manda sobre una consulta anterior a él.
 */
export function currentStatus(
  initial: StatusPayload,
  polled: StatusPayload | null,
): StatusPayload {
  return polled !== null && polled.now >= initial.now ? polled : initial;
}
