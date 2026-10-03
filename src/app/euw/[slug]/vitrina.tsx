"use client";

import { Crown, RefreshCw, Star } from "lucide-react";
import Image from "next/image";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/hy/badge";
import { Btn } from "@/components/hy/btn";
import { Chip } from "@/components/hy/chip";
import { Notice } from "@/components/hy/notice";
import { ToastRegion } from "@/components/hy/toast";
import { DEITY_CONDITION, DEITY_NAME } from "@/domain/arena-god";
import type { LocalState } from "@/lib/local-store";
import { normalizeRiotId } from "@/lib/riot-id";
import { syncProgressFromJson } from "@/lib/status-payload";
import {
  localActions,
  useLocalReady,
  useLocalStore,
} from "@/lib/use-local-store";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { type LeagueId, LeagueShield, leagueColor } from "./league-shield";
import { LocalMenu } from "./local-menu";
import type { RefreshSnapshot } from "./refresh-outcome";
import { usePageStatus } from "./status-provider";
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
import { barCompact, barRootMargin } from "./vitrina-bar";

// Vitrina: la cabecera del perfil (iter-11, propuesta C2 de `.dev/research/cabecera`). Sustituye
// al header y a la barra Arena God: banner con el splash del último 1º (tratamiento oscuro),
// identidad grande (avatar con el sello de la Deidad, nombre, ★, «mi perfil», chip Deidad, aviso
// de Arena fuera de rotación) y los trofeos, que llegan hechos por `children` (servidor y cliente).
//
// Una sola cabecera pegajosa (I6), así hay un solo botón Actualizar (`REFRESH_BUTTON_ID`, al que
// llaman Sincronizar y Reintentar del trofeo): un `sticky` de alto 0 al principio de la cabina,
// con la barra en absoluto encima del banner. Con la identidad grande a la vista la barra es
// transparente y solo lleva frescura, Actualizar y ⋯ (arriba a la derecha); cuando la identidad
// empieza a pasar bajo ella (`IntersectionObserver`, decisión en `vitrina-bar.ts`) gana fondo,
// borde y la identidad compacta (avatar, nombre, liga · rating). Debajo del banner, los avisos de
// límite de peticiones y de error de la actualización y el toast, como en el header de antes. Es cliente
// porque lee el navegador («mi perfil», favoritos), el reloj de la frescura corre en cliente y la
// sincronización sale del estado de `StatusProvider`; el resto llega por props del servidor.
//
// Rangos (container queries sobre `.app`):
//   ≥ 900 px   identidad a la izquierda con hueco a la derecha para la barra (frescura y botones).
//   < 900 px   el banner deja arriba una franja de 68 px para la barra: la identidad usa el ancho.
//   < 640 px   franja de 54 px (frescura a la izquierda, botones a la derecha; compacta, la
//              identidad sustituye a la frescura), avatar de 60 px, nombre de 30 px y velo de
//              arriba abajo. Los trofeos se apilan por debajo de 700 px (`TrophyGrid`).

/** Liga del ELO del miembro: color del fondo y «liga · rating» de la barra compacta. */
export interface VitrinaLeague {
  id: LeagueId;
  name: string;
  /** Rating redondeado (el de su fila de la Clasificación). */
  rating: number;
  provisional: boolean;
}

export interface VitrinaProps {
  /** Slug de la URL, el que identifica al perfil en las actions. */
  slug: string;
  /** Forma canónica de Riot. */
  gameName: string;
  tagLine: string;
  /** Icono de invocador (Data Dragon); `null`: iniciales (también si la imagen no carga). */
  iconUrl: string | null;
  /** Hora del servidor (ms): el primer render coincide con el HTML del servidor. */
  nowMs: number;
  lastGameAt: number | null;
  /** Última partida de Arena de la BD (ms) si Arena puede estar fuera de rotación; si no, `null`. */
  arenaQuietSince: number | null;
  /** «Deidad de Arena» conseguida (`ProfileView.arenaGod.reached`): sello y chip. */
  arenaDeity: boolean;
  /** `null` si el perfil no es miembro (el fondo usa entonces el oro de Arena God). */
  league: VitrinaLeague | null;
  /** Splash del campeón del último 1º; `null` (o si no carga): degradado. */
  splashUrl: string | null;
  games: number;
  champions: RefreshSnapshot["champions"];
  /** Los trofeos (`TrophyGrid`), bajo la identidad. */
  children: ReactNode;
}

const selectMyProfile = (state: LocalState) => state.myProfile;

/** Velo oscuro sobre el splash: hacia el texto (izquierda; en estrecho, abajo). */
const VEIL =
  "bg-[linear-gradient(90deg,rgba(12,13,16,.92)_0%,rgba(12,13,16,.72)_48%,rgba(12,13,16,.55)_100%)] @max-[640px]:bg-[linear-gradient(180deg,rgba(12,13,16,.55)_0%,rgba(12,13,16,.72)_35%,rgba(12,13,16,.92)_100%)]";

/** Degradado de fondo (sin splash queda solo él): tinte de la liga sobre el morado de la maqueta. */
const BASE_GRADIENT =
  "radial-gradient(60% 120% at 85% 10%, color-mix(in srgb, var(--lg) 20%, transparent), transparent 60%), radial-gradient(70% 140% at 10% 0%, #3b2a4a, transparent 55%), linear-gradient(115deg, #1f1a2b, #2b2235 40%, #1a2230)";

export function Vitrina({
  slug,
  gameName,
  tagLine,
  iconUrl,
  nowMs,
  lastGameAt,
  arenaQuietSince,
  arenaDeity,
  league,
  splashUrl,
  games,
  champions,
  children,
}: VitrinaProps) {
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

  // Sincronización: del estado (se consulta cada pocos segundos), no de las props.
  const { status: pageStatus, dataCurrent } = usePageStatus();
  const syncJson = pageStatus.profile?.sync ?? null;
  const sync = useMemo(
    () => (syncJson ? syncProgressFromJson(syncJson) : null),
    [syncJson],
  );
  const lastSyncedAt = pageStatus.profile?.lastSyncedAt ?? null;
  const lastJobErrorAt = pageStatus.profile?.lastJobErrorAt ?? null;
  const paused = pageStatus.profile?.paused ?? false;

  const snapshot: RefreshSnapshot = {
    games,
    champions,
    lastSyncedAt,
    errorAt: lastJobErrorAt,
    active: sync !== null,
  };
  const refresh = useRefresh(snapshot, dataCurrent);
  // Solo el descargado de partidas tiene un total con el que medir; el resto es indeterminado.
  const progress =
    sync?.phase === "fetching" && sync.total > 0
      ? sync.fetched / sync.total
      : null;

  // Con la key caducada la banda ya explica por qué no se actualiza: no se duplica el aviso.
  const showError = lastJobErrorAt !== null && sync === null && !paused;
  // Un incremental en cola o frenado por el límite de peticiones (el backfill lo pinta la banda).
  const status = incrementalStatus(sync, paused, now);

  // Barra compacta en cuanto la identidad grande empieza a pasar bajo ella.
  const barRef = useRef<HTMLElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const bar = barRef.current;
    const identity = identityRef.current;
    if (!bar || !identity || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        setCompact(
          barCompact({
            ratio: entry.intersectionRatio,
            top: entry.boundingClientRect.top,
            rootTop: entry.rootBounds?.top ?? null,
          }),
        );
      },
      { rootMargin: barRootMargin(bar.offsetHeight), threshold: 1 },
    );
    observer.observe(identity);
    return () => observer.disconnect();
  }, []);

  // El splash que no carga deja el degradado (y sin velo, como sin splash). Por URL: si cambia el
  // campeón del fondo tras actualizar, se vuelve a intentar.
  const [failedSplash, setFailedSplash] = useState<string | null>(null);
  const splash =
    splashUrl !== null && failedSplash !== splashUrl ? splashUrl : null;

  return (
    <>
      {/* Alto 0: con la identidad a la vista, la barra flota sobre el banner sin desplazarlo. */}
      <div className="pointer-events-none sticky top-[env(safe-area-inset-top,0px)] z-5 h-0">
        <header
          ref={barRef}
          className={cn(
            "absolute inset-x-0 top-0 flex items-center justify-end gap-x-3.5 border-b px-4 py-3 transition-[background-color,border-color] duration-200 @max-[640px]:gap-x-2 @max-[640px]:px-2.5 @max-[640px]:py-2",
            compact
              ? "pointer-events-auto border-line bg-[color-mix(in_srgb,var(--surface-1)_94%,transparent)] backdrop-blur-[6px]"
              : "border-transparent",
          )}
        >
          {/* Repite lo que ya dice el banner: el lector de pantalla no lo necesita dos veces. */}
          <div
            aria-hidden="true"
            className={cn(
              "mr-auto flex min-w-0 items-center gap-2.5",
              !compact && "hidden",
            )}
          >
            <Avatar gameName={gameName} iconUrl={iconUrl} size="bar" />
            <span className="min-w-0 truncate font-display text-lg leading-none font-extrabold tracking-[0.02em] uppercase">
              {gameName}
            </span>
            {league && (
              <span className="flex flex-none items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
                <LeagueShield league={league.id} className="h-4 w-3.5" />
                <span className="@max-[420px]:hidden">{league.name} · </span>
                <span className="num text-foreground">{league.rating}</span>
              </span>
            )}
          </div>
          <div
            className={cn(
              "text-right text-[13px] leading-[1.35] text-muted-foreground @max-[640px]:mr-auto @max-[640px]:text-left @max-[640px]:text-xs",
              compact
                ? "@max-[640px]:hidden"
                : "[text-shadow:0_1px_2px_rgba(0,0,0,.7)]",
            )}
          >
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
          </div>
          <form action={refresh.formAction} className="pointer-events-auto">
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
          <div className="pointer-events-auto">
            <LocalMenu riotId={riotId} />
          </div>
        </header>
      </div>

      <div
        className="relative isolate overflow-hidden px-6 pt-6 @max-[900px]:pt-[68px] @max-[640px]:px-3.5 @max-[640px]:pt-[54px]"
        style={
          {
            "--lg": league ? leagueColor(league.id) : "var(--place-1)",
          } as CSSProperties
        }
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-3"
          style={{ backgroundImage: BASE_GRADIENT }}
        />
        {splash && (
          <>
            <Image
              src={splash}
              alt=""
              fill
              sizes="100vw"
              loading="eager"
              fetchPriority="low"
              decoding="async"
              draggable={false}
              onError={() => setFailedSplash(splash)}
              className="-z-2 scale-[1.02] object-cover object-[center_22%] blur-[1.5px] saturate-[.55] @max-[640px]:object-[70%_20%]"
            />
            <div
              aria-hidden="true"
              className={cn("absolute inset-0 -z-1", VEIL)}
            />
            {/* Sombra bajo la barra transparente: el velo es más claro arriba a la derecha (y arriba
                del todo en estrecho), justo donde van la frescura y los botones. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 -z-1 h-24 bg-[linear-gradient(180deg,rgba(12,13,16,.7)_0,rgba(12,13,16,.7)_52px,transparent)]"
            />
          </>
        )}
        {/* Fundido inferior al color de la cabina. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-1"
          style={{
            backgroundImage: `linear-gradient(180deg, transparent ${splash ? 35 : 25}%, var(--cabin) 100%)`,
          }}
        />

        <div
          ref={identityRef}
          className="flex min-w-0 items-center gap-5 @min-[900px]:pr-[380px] @max-[640px]:gap-3.5"
        >
          <Avatar
            gameName={gameName}
            iconUrl={iconUrl}
            size="hero"
            deity={arenaDeity}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="min-w-0 font-display text-[48px] leading-none font-extrabold tracking-[0.02em] uppercase [overflow-wrap:anywhere] @max-[640px]:text-[30px]">
                {gameName}
                <span className="ml-1 font-body text-xl font-medium tracking-normal whitespace-nowrap text-faint normal-case @max-[640px]:text-sm">
                  #{tagLine}
                </span>
              </h1>
              <button
                type="button"
                onClick={() => localActions.toggleFavorite(riotId)}
                aria-pressed={favorite}
                aria-label={`Favorito: ${label}`}
                className={cn(
                  "grid size-8 flex-none cursor-pointer place-items-center rounded-md hover:bg-surface-2",
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
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {ready && (
                <IdentityChip
                  mine={mine}
                  hasMine={myProfile !== null}
                  gameName={gameName}
                  onThisIsMe={() => localActions.setMyProfile(riotId)}
                />
              )}
              {arenaDeity && (
                <Badge
                  title={DEITY_NAME}
                  description={DEITY_CONDITION}
                  emblem={<Crown size={12} />}
                />
              )}
            </div>
            {/* `<output>` es una región viva (`role="status"`). Va siempre presente y vacía si no
                hay nada: el lector de pantalla solo anuncia el texto cuando aparece o cambia. */}
            <output className="mt-1.5 block max-w-[420px] text-[13px] text-muted-foreground empty:hidden">
              {arenaQuietSince !== null &&
                arenaQuietPhrase(arenaQuietSince, now)}
            </output>
          </div>
        </div>

        {children}
      </div>

      {status?.kind === "rate_limit" && (
        <div className="px-5 pb-3 @max-[640px]:px-3.5">
          <Notice role="status" icon="!">
            {rateLimitPhrase(status.minutes)}.{" "}
            {dataAgePhrase(lastSyncedAt, now)}
          </Notice>
        </div>
      )}
      {showError && (
        <div className="px-5 pb-3 @max-[640px]:px-3.5">
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

/**
 * Avatar: icono de invocador o, sin él (o si no carga), las iniciales. Grande en el banner, con el
 * sello de la Deidad (anillo dorado y corona) si la ha conseguido; pequeño en la barra compacta.
 * Decorativo: el nombre va al lado y la Deidad tiene su chip.
 */
function Avatar({
  gameName,
  iconUrl,
  size,
  deity = false,
}: {
  gameName: string;
  iconUrl: string | null;
  size: "hero" | "bar";
  deity?: boolean;
}) {
  const hero = size === "hero";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex-none",
        hero ? "size-[72px] @max-[640px]:size-[60px]" : "size-8",
      )}
    >
      <div
        className={cn(
          "relative grid size-full place-items-center overflow-hidden rounded-full border border-won-deep bg-[radial-gradient(circle_at_30%_30%,#6b5a3a,#2a2418)] font-display font-extrabold text-place-1",
          hero ? "text-[26px] @max-[640px]:text-[22px]" : "text-[13px]",
          hero &&
            deity &&
            "shadow-[0_0_0_3px_#201b28,0_0_0_5px_var(--place-1)]",
        )}
      >
        {initials(gameName)}
        {iconUrl !== null && (
          // Sin clave: si la imagen falla quedan las iniciales de debajo, como en `PortraitImage`.
          <Image
            src={iconUrl}
            alt=""
            width={hero ? 144 : 64}
            height={hero ? 144 : 64}
            draggable={false}
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </div>
      {hero && deity && (
        <span className="absolute -right-1 -bottom-1 grid size-[34px] place-items-center rounded-full border-[3px] border-[#201b28] bg-place-1 text-background @max-[640px]:size-[26px]">
          <Crown className="size-[18px] @max-[640px]:size-[13px]" />
        </span>
      )}
    </div>
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
  if (mine) {
    return (
      <Chip variant="me" className="bg-black/20">
        Mi perfil
      </Chip>
    );
  }
  if (hasMine) {
    return (
      <Chip
        className="max-w-full truncate bg-black/20"
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
