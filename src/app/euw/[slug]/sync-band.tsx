"use client";

import { useMemo, useState } from "react";
import { FloatingNotice } from "@/components/hy/toast";
import { syncProgressFromJson } from "@/lib/status-payload";
import { cn } from "@/lib/utils";
import { usePageStatus } from "./status-provider";
import {
  rateLimitPhrase,
  type SyncBandModel,
  sharingPhrase,
  syncBandModel,
} from "./view-model";

// Banda de progreso de la sincronización bajo la vitrina (brief §4.10, `.sync-band` de la
// maqueta). Solo la pinta el backfill (el incremental va dentro del botón Actualizar y en los
// avisos de la vitrina, `vitrina.tsx`), la pausa por key caducada y el límite de peticiones. El
// progreso y la cola van en el flujo, con el tono neutro (esperar turno no avisa de nada); la pausa
// y el límite de peticiones (en azul acero: no son un error del usuario, §4.3) salen desde la
// revisión v4 como aviso flotante que se puede cerrar (`FloatingNotice`, D6): cerrado, no vuelve
// hasta que cambia el tipo de aviso. Es cliente porque se pinta desde el estado que consulta
// `StatusProvider`, sin repintar la página.

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

/** Los modelos que salen como aviso flotante y no en el flujo. */
type FloatingModel = Extract<SyncBandModel, { kind: "paused" | "rate_limit" }>;

function isFloating(model: SyncBandModel): model is FloatingModel {
  return model.kind === "paused" || model.kind === "rate_limit";
}

/** La banda (o el aviso flotante) según el estado de la página; nada si no toca (`syncBandModel`). */
export function SyncBand() {
  const { status } = usePageStatus();
  const syncJson = status.profile?.sync ?? null;
  const paused = status.profile?.paused ?? false;
  // La hora del servidor del estado: el primer render coincide con el HTML.
  const model = useMemo(
    () =>
      syncBandModel(
        syncJson && syncProgressFromJson(syncJson),
        paused,
        status.now,
      ),
    [syncJson, paused, status.now],
  );
  const floating = model && isFloating(model) ? model : null;

  // Cerrado vale para ese tipo de aviso: si cambia (o desaparece), el siguiente vuelve a salir.
  const floatingKind = floating?.kind ?? null;
  const [dismissed, setDismissed] = useState(false);
  const [shownKind, setShownKind] = useState(floatingKind);
  if (floatingKind !== shownKind) {
    setShownKind(floatingKind);
    setDismissed(false);
  }

  return (
    <>
      {model && !floating && <Band model={model} />}
      <FloatingNotice onClose={() => setDismissed(true)}>
        {floating && !dismissed && (
          <div className="grid gap-1.5 [&_b]:font-medium [&_small]:text-xs">
            <Body model={floating} />
          </div>
        )}
      </FloatingNotice>
    </>
  );
}

function Band({ model }: { model: SyncBandModel }) {
  return (
    <div className="px-5 pt-3 @max-[640px]:px-3.5">
      <output className="grid gap-2 rounded-md border border-line bg-background p-3 text-sm">
        <Body model={model} />
      </output>
    </div>
  );
}

function Body({ model }: { model: SyncBandModel }) {
  switch (model.kind) {
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
