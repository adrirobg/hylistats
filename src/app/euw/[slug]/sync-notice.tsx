"use client";

import type { ReactNode } from "react";
import { FloatingItem } from "@/components/hy/floating";
import { cn } from "@/lib/utils";
import {
  SYNC_PRIORITY,
  type SyncNoticeModel,
  syncNoticeId,
} from "./floating-notices";
import { dataAgePhrase, rateLimitPhrase, sharingPhrase } from "./view-model";

// Avisos de sincronización en la pila flotante global (brief §4.10; T08, revisión v5b): error de la
// actualización con [Reintentar], pausa por key caducada, límite de peticiones (del backfill o del
// incremental) y progreso del backfill y la cola (`.sync-band` de la maqueta, que ya no va en el
// flujo). Cada uno se registra en la pila (`FloatingItem`, familia `sync`) con su prioridad de
// `floating-notices.ts`; los registra la vitrina (`vitrina.tsx`), que tiene el botón Actualizar. Los
// cierres, en memoria. El progreso va en el tono neutro (esperar turno no avisa de nada); el resto,
// en azul acero: no es un error del usuario (§4.3).

/** Progreso: no avisa de nada, va sin marca y en el tono neutro. */
const NEUTRAL = new Set<SyncNoticeModel["kind"]>([
  "resolving",
  "listing",
  "fetching",
  "queued",
]);

export function SyncNotice({
  notice,
  lastSyncedAt,
  now,
  retry,
}: {
  notice: SyncNoticeModel;
  lastSyncedAt: number | null;
  /** En ms. */
  now: number;
  /** Botón [Reintentar] del error (el formulario de Actualizar de la vitrina). */
  retry: ReactNode;
}) {
  const neutral = NEUTRAL.has(notice.kind);
  return (
    <FloatingItem
      id={syncNoticeId(notice.kind)}
      priority={SYNC_PRIORITY[notice.kind]}
      group="sync"
      tone={neutral ? "neutral" : "trust"}
      icon={neutral ? null : "!"}
    >
      <div className="grid gap-1.5 [&_b]:font-medium [&_small]:text-xs">
        <Body
          model={notice}
          lastSyncedAt={lastSyncedAt}
          now={now}
          retry={retry}
        />
      </div>
    </FloatingItem>
  );
}

/** Barra `.track`; sin `value` es indeterminada (pulsa). */
function Track({
  value,
  max,
  label,
  paused,
}: {
  value?: number;
  max?: number;
  label: string;
  paused?: boolean;
}) {
  const determinate = value !== undefined && max !== undefined && max > 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
      className="h-1.5 overflow-hidden rounded-[3px] bg-surface-2"
    >
      <i
        className={cn(
          "block h-full",
          paused ? "bg-trust" : "bg-place-1",
          !determinate && "w-1/3 animate-pulse",
        )}
        style={
          determinate
            ? { width: `${Math.min(100, ((value ?? 0) / (max ?? 1)) * 100)}%` }
            : undefined
        }
      />
    </div>
  );
}

function Body({
  model,
  lastSyncedAt,
  now,
  retry,
}: {
  model: SyncNoticeModel;
  lastSyncedAt: number | null;
  now: number;
  retry: ReactNode;
}) {
  switch (model.kind) {
    case "error":
      return (
        <>
          <b>No se pudo actualizar (Riot no responde).</b>
          <small className="text-muted-foreground">
            {dataAgePhrase(lastSyncedAt, now)}
          </small>
          <div className="mt-0.5">{retry}</div>
        </>
      );
    case "resolving":
      return (
        <>
          <b>Buscando el Riot ID…</b>
          <Track label="Buscando el Riot ID" />
        </>
      );
    case "listing":
      return (
        <>
          <b>
            Listando partidas… <span className="num">{model.listedIds}</span>
          </b>
          <Track label="Listando partidas" />
        </>
      );
    case "fetching":
      return (
        <>
          <b>
            Descargando la temporada:{" "}
            <span className="num">
              {model.fetched} / {model.total}
            </span>{" "}
            partidas · ~{model.etaMinutes} min
            {model.sharing > 0 && <> · {sharingPhrase(model.sharing)}</>}
          </b>
          <Track
            value={model.fetched}
            max={model.total}
            label="Partidas descargadas"
          />
          <small className="text-muted-foreground">
            Puedes cerrar la pestaña, la descarga sigue. El álbum y el marcador
            se rellenan solos.
          </small>
        </>
      );
    case "queued":
      return (
        <>
          <b>
            En cola: posición <span className="num">{model.position}</span> ·
            empieza en ~{model.startMinutes} min
          </b>
          <small className="text-muted-foreground">
            Otros perfiles se están sincronizando antes y compartimos la misma
            clave de Riot. Puedes cerrar la pestaña, la sincronización sigue.
          </small>
        </>
      );
    case "rate_limit":
      if (model.job === "incremental") {
        return (
          <>
            <b>{rateLimitPhrase(model.minutes)}</b>
            <small className="text-muted-foreground">
              {dataAgePhrase(lastSyncedAt, now)}
            </small>
          </>
        );
      }
      return (
        <>
          <b>{rateLimitPhrase(model.minutes)}</b>
          {model.progress && (
            <Track
              value={model.progress.fetched}
              max={model.progress.total}
              label="Partidas descargadas"
              paused
            />
          )}
          <small className="text-muted-foreground">
            {model.progress && (
              <>
                <span className="num">
                  {model.progress.fetched} / {model.progress.total}
                </span>{" "}
                partidas descargadas.{" "}
              </>
            )}
            Los datos ya descargados siguen visibles.
          </small>
        </>
      );
    case "paused":
      return (
        <>
          <b>Actualización pausada: la clave de Riot ha caducado.</b>
          {model.progress && (
            <Track
              value={model.progress.fetched}
              max={model.progress.total}
              label="Partidas descargadas"
              paused
            />
          )}
          <small className="text-muted-foreground">
            {model.progress && (
              <>
                <span className="num">
                  {model.progress.fetched} / {model.progress.total}
                </span>{" "}
                partidas descargadas.{" "}
              </>
            )}
            Los datos son los de la última sincronización.
          </small>
        </>
      );
  }
}
