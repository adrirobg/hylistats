import { cn } from "@/lib/utils";
import type { SyncBandModel } from "./view-model";

// Banda de progreso de la sincronización bajo el header (brief §4.10, `.sync-band` de la
// maqueta). Solo la pinta el backfill (el incremental va dentro del botón Actualizar) y la
// pausa por key caducada, en azul acero: no es un error del usuario (§4.3).

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

export function SyncBand({ model }: { model: SyncBandModel }) {
  const paused = model.kind === "paused";
  return (
    <div className="px-5 pt-3 @max-[640px]:px-3.5">
      <output
        className={cn(
          "grid gap-2 rounded-md border p-3 text-sm",
          paused ? "border-trust/35 bg-trust-bg" : "border-line bg-background",
        )}
      >
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
