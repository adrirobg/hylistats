import { randomUUID } from "node:crypto";

// Versión de datos (F26, palanca A): contadores en memoria que suben cuando el worker guarda algo
// que se ve (partidas, 602002, icono, perfil resuelto o `not_found`) y cuando `/admin` cambia la
// lista del grupo. El cliente consulta el estado barato y solo rehace la página si cambia la
// versión. Módulo puro (sin BD): quién sube qué lo deciden el worker y el dominio.
//
// En `globalThis`, como la señal de despertar de `src/worker/queue.ts`: las rutas de Next y el
// worker (`instrumentation.ts`) comparten proceso pero pueden cargar copias distintas de este
// módulo. Vale con UNA sola instancia de la app (AGENTS.md). El id de arranque hace que un
// reinicio cuente como cambio aunque los contadores vuelvan a 0.

interface DataVersions {
  /** Distinto en cada arranque del proceso. */
  bootId: string;
  /** Contador por `profileId`; un perfil sin entrada está en 0. */
  profiles: Map<number, number>;
  group: number;
}

const globalForVersions = globalThis as typeof globalThis & {
  __hylistatsDataVersions?: DataVersions;
};

function getVersions(): DataVersions {
  globalForVersions.__hylistatsDataVersions ??= {
    bootId: randomUUID().slice(0, 8),
    profiles: new Map(),
    group: 0,
  };
  return globalForVersions.__hylistatsDataVersions;
}

/**
 * Sube la versión de cada perfil de `profileIds` (sin repetir) y, con `group`, también la del
 * grupo: quien llama dice si alguno de ellos es miembro.
 */
export function bumpProfileVersions(
  profileIds: Iterable<number>,
  { group }: { group: boolean },
): void {
  const versions = getVersions();
  for (const id of new Set(profileIds)) {
    versions.profiles.set(id, (versions.profiles.get(id) ?? 0) + 1);
  }
  if (group) versions.group += 1;
}

/** Sube la versión del grupo (cambio de la lista de miembros en `/admin`). */
export function bumpGroupVersion(): void {
  getVersions().group += 1;
}

/** Versión de un perfil: cadena opaca que incluye el id de arranque. Solo se compara por igualdad. */
export function profileVersion(profileId: number): string {
  const versions = getVersions();
  return `${versions.bootId}.${versions.profiles.get(profileId) ?? 0}`;
}

/** Versión del grupo: cadena opaca que incluye el id de arranque. Solo se compara por igualdad. */
export function groupVersion(): string {
  const versions = getVersions();
  return `${versions.bootId}.${versions.group}`;
}
