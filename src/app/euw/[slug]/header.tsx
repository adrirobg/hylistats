"use client";

import { Crown, RefreshCw, Star } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { Badge } from "@/components/hy/badge";
import { Btn } from "@/components/hy/btn";
import { Chip } from "@/components/hy/chip";
import { Notice } from "@/components/hy/notice";
import { ToastRegion } from "@/components/hy/toast";
import { DEITY_CONDITION, DEITY_NAME } from "@/domain/arena-god";
import type { LocalState } from "@/lib/local-store";
import { normalizeRiotId } from "@/lib/riot-id";
import {
  localActions,
  useLocalReady,
  useLocalStore,
} from "@/lib/use-local-store";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import type { SyncProgress } from "./data";
import { LocalMenu } from "./local-menu";
import type { RefreshSnapshot } from "./refresh-outcome";
import { REFRESH_BUTTON_ID, useRefresh } from "./use-refresh";
import {
  arenaQuietPhrase,
  dataAgePhrase,
  incrementalStatus,
  initials,
  queuedLabel,
  rateLimitPhrase,
  whenPhrase,
} from "./view-model";

// Header de perfil (brief §4.1, `.hdr` de la maqueta): identidad, ★ favorito, «mi perfil»,
// frescura en dos líneas (más la etiqueta de Arena fuera de rotación, si toca) y botón Actualizar
// con su progreso: un incremental en cola lo dice el propio botón y el límite de peticiones un
// aviso bajo el header (§4.10; el backfill lo cuenta la banda). Es cliente porque lee el estado del
// navegador («mi perfil», favoritos) y porque el reloj de la frescura corre en cliente; lo del
// servidor llega por props (se renuevan con el polling de `AutoRefresh`).
//
// Rangos (container queries sobre `.app`): por debajo de 640 px el header se reduce a Riot ID,
// ★, ↻ y ⋯; la frescura pasa a una segunda línea y se ocultan las etiquetas fijas.

export interface ProfileHeaderProps {
  /** Slug de la URL, el que identifica al perfil en las actions. */
  slug: string;
  /** Forma canónica de Riot. */
  gameName: string;
  tagLine: string;
  /** Hora del servidor (ms): el primer render coincide con el HTML del servidor. */
  nowMs: number;
  lastGameAt: number | null;
  lastSyncedAt: number | null;
  sync: SyncProgress | null;
  /** Instante (ms) del último job fallido; `null` si el último terminado no falló. */
  lastJobErrorAt: number | null;
  /** La key de Riot está caducada: no se actualiza (lo explica la banda). */
  paused: boolean;
  /**
   * Última partida de Arena de la BD (ms) cuando es tan antigua que Arena puede estar fuera de
   * rotación (`ProfileView.arenaQuiet`); `null` si no hay nada que decir.
   */
  arenaQuietSince: number | null;
  /** Badge «Deidad de Arena» conseguido (`ProfileView.arenaGod.reached`, decidido en el dominio). */
  arenaDeity: boolean;
  games: number;
  champions: RefreshSnapshot["champions"];
}

const selectMyProfile = (state: LocalState) => state.myProfile;

export function ProfileHeader({
  slug,
  gameName,
  tagLine,
  nowMs,
  lastGameAt,
  lastSyncedAt,
  sync,
  lastJobErrorAt,
  paused,
  arenaQuietSince,
  arenaDeity,
  games,
  champions,
}: ProfileHeaderProps) {
  const now = useNow(nowMs);
  const riotId = useMemo(() => ({ gameName, tagLine }), [gameName, tagLine]);
  const norm = normalizeRiotId(gameName, tagLine);
  const label = `${gameName}#${tagLine}`;

  // Al visitar un perfil registrado entra en «recientes» (la landing no lo hace).
  useEffect(() => {
    localActions.addRecent(riotId);
  }, [riotId]);

  const ready = useLocalReady();
  const myProfile = useLocalStore(selectMyProfile);
  const mine =
    myProfile !== null &&
    normalizeRiotId(myProfile.gameName, myProfile.tagLine) === norm;
  const selectFavorite = useCallback(
    (state: LocalState) =>
      state.favorites.some(
        (f) => normalizeRiotId(f.gameName, f.tagLine) === norm,
      ),
    [norm],
  );
  const favorite = useLocalStore(selectFavorite);

  const snapshot: RefreshSnapshot = {
    games,
    champions,
    lastSyncedAt,
    errorAt: lastJobErrorAt,
    active: sync !== null,
  };
  const refresh = useRefresh(snapshot);
  // Solo el descargado de partidas tiene un total con el que medir; el resto es indeterminado.
  const progress =
    sync?.phase === "fetching" && sync.total > 0
      ? sync.fetched / sync.total
      : null;

  // Con la key caducada la banda ya explica por qué no se actualiza: no se duplica el aviso.
  const showError = lastJobErrorAt !== null && sync === null && !paused;
  // Un incremental en cola o frenado por el límite de peticiones (el backfill lo pinta la banda).
  const status = incrementalStatus(sync, paused, now);

  return (
    <>
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-line bg-[color-mix(in_srgb,var(--surface-1)_94%,transparent)] px-5 py-3.5 backdrop-blur-[6px] @max-[640px]:gap-y-2 @max-[640px]:px-3.5 @max-[640px]:py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div
            aria-hidden="true"
            className="grid size-11 flex-none place-items-center rounded-lg border border-won-deep bg-[radial-gradient(circle_at_30%_30%,#6b5a3a,#2a2418)] font-display text-lg font-extrabold text-place-1 @max-[640px]:size-9 @max-[640px]:text-base"
          >
            {initials(gameName)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h1 className="min-w-0 font-display text-[26px] leading-none font-extrabold tracking-[0.02em] [overflow-wrap:anywhere] @max-[640px]:text-[22px]">
                {gameName}
                <span className="font-body text-base font-medium tracking-normal text-faint">
                  #{tagLine}
                </span>
              </h1>
              <button
                type="button"
                onClick={() => localActions.toggleFavorite(riotId)}
                aria-pressed={favorite}
                aria-label={`Favorito: ${label}`}
                className={cn(
                  "grid size-8 flex-none cursor-pointer place-items-center self-center rounded-md hover:bg-surface-2",
                  favorite
                    ? "text-place-1"
                    : "text-faint hover:text-foreground",
                )}
              >
                <Star
                  aria-hidden="true"
                  size={18}
                  fill={favorite ? "currentColor" : "none"}
                />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {ready && (
                <IdentityChip
                  mine={mine}
                  hasMine={myProfile !== null}
                  gameName={gameName}
                  onThisIsMe={() => localActions.setMyProfile(riotId)}
                />
              )}
              <Chip className="@max-[640px]:hidden">EUW</Chip>
              <Chip className="@max-[640px]:hidden">
                Arena · temporada actual
              </Chip>
              {arenaDeity && (
                <Badge
                  title={DEITY_NAME}
                  description={DEITY_CONDITION}
                  emblem={<Crown size={12} />}
                />
              )}
            </div>
          </div>
        </div>

        {/* En móvil el grupo se "disuelve": el botón y el menú van junto al nombre y la frescura
            baja a su propia línea. */}
        <div className="flex items-center gap-3.5 @max-[640px]:contents">
          <div className="text-right text-[13px] leading-[1.35] text-muted-foreground @max-[640px]:order-last @max-[640px]:basis-full @max-[640px]:text-left @max-[640px]:text-xs">
            <p>
              {lastGameAt === null ? (
                "Sin partidas de Arena"
              ) : (
                <>
                  Última partida{" "}
                  <b className="font-medium text-foreground">
                    {whenPhrase(lastGameAt, now)}
                  </b>
                </>
              )}
            </p>
            <p>
              {lastSyncedAt === null
                ? "Aún sin comprobar"
                : `Comprobado ${whenPhrase(lastSyncedAt, now)}`}
            </p>
            {/* `<output>` es una región viva (`role="status"`). Va siempre presente y vacía si no hay
                nada: el lector de pantalla solo anuncia el texto cuando aparece o cambia, no en
                cada relectura de la página. */}
            <output className="block max-w-[280px] text-faint empty:hidden @max-[640px]:max-w-none">
              {arenaQuietSince !== null &&
                arenaQuietPhrase(arenaQuietSince, now)}
            </output>
          </div>
          <form action={refresh.formAction}>
            <input type="hidden" name="slug" value={slug} />
            <Btn
              id={REFRESH_BUTTON_ID}
              type="submit"
              onClick={refresh.markPress}
              disabled={refresh.busy}
              aria-busy={refresh.busy}
              className="@max-[640px]:px-2.5"
            >
              <RefreshCw aria-hidden="true" size={16} />
              <span className="@max-[640px]:sr-only">
                {refresh.busy
                  ? status?.kind === "queued"
                    ? queuedLabel(status.position)
                    : "Comprobando…"
                  : "Actualizar"}
              </span>
              {refresh.busy && (
                <i
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-0 left-0 h-0.5 bg-place-1",
                    progress === null
                      ? "w-full animate-pulse"
                      : "transition-[width] duration-1000 ease-linear",
                  )}
                  style={
                    progress === null
                      ? undefined
                      : { width: `${Math.round(progress * 100)}%` }
                  }
                />
              )}
            </Btn>
          </form>
          <LocalMenu riotId={riotId} />
        </div>
      </header>

      {status?.kind === "rate_limit" && (
        <div className="px-5 pt-3 @max-[640px]:px-3.5">
          <Notice role="status" icon="!">
            {rateLimitPhrase(status.minutes)}.{" "}
            {dataAgePhrase(lastSyncedAt, now)}
          </Notice>
        </div>
      )}
      {showError && (
        <div className="px-5 pt-3 @max-[640px]:px-3.5">
          <Notice
            role="status"
            icon="!"
            actions={
              <form action={refresh.formAction}>
                <input type="hidden" name="slug" value={slug} />
                <Btn
                  type="submit"
                  size="small"
                  variant="trust"
                  onClick={refresh.markPress}
                  disabled={refresh.busy}
                >
                  Reintentar
                </Btn>
              </form>
            }
          >
            No se pudo actualizar (Riot no responde).{" "}
            {dataAgePhrase(lastSyncedAt, now)}
          </Notice>
        </div>
      )}
      <ToastRegion>{refresh.toast}</ToastRegion>
    </>
  );
}

/** «Mi perfil» / «Este soy yo» / «Viendo el perfil de X» (brief §4.1 y §5). */
function IdentityChip({
  mine,
  hasMine,
  gameName,
  onThisIsMe,
}: {
  mine: boolean;
  hasMine: boolean;
  gameName: string;
  onThisIsMe: () => void;
}) {
  if (mine) return <Chip variant="me">Mi perfil</Chip>;
  if (hasMine) {
    return (
      <Chip
        className="max-w-full truncate"
        title="Tus objetivos y marcas solo se ven en tu perfil"
      >
        Viendo el perfil de {gameName}
      </Chip>
    );
  }
  return (
    <Btn size="small" onClick={onThisIsMe}>
      Este soy yo
    </Btn>
  );
}
