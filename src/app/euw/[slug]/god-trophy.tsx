"use client";

import { Check, Crown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { FloatingItem, useFloatingStack } from "@/components/hy/floating";
import {
  type ArenaGodState,
  arenaGodLabel,
  GOD_NAME,
} from "@/domain/arena-god";
import { ARENA_GOD_THRESHOLD } from "@/lib/config";
import { normalizeRiotId } from "@/lib/riot-id";
import { cn } from "@/lib/utils";
import {
  ArenaGodExplainButton,
  ArenaGodExplanation,
  ArenaGodNotice,
  type ArenaGodProps,
  useArenaGod,
} from "./arena-god-notice";
import { championHref } from "./champion-panel-view";
import {
  closedNoticeKey,
  GOD_PRIORITY,
  godNoticeSignature,
  godTrace,
} from "./floating-notices";
import { type GodBar, godBar, godRemaining } from "./god-bar";
import { usePageStatus } from "./status-provider";
import { initials } from "./view-model";
import type { RecentConquest } from "./vitrina-view";

// Trofeo Dios de Arena de la vitrina (tarjeta `.tw.g5`, variante 1 de `propuestas-v5-dios.html`,
// revisión v5): la cifra «N / meta» con el %, la barra con hitos (verificados en oro, manuales en
// azul rayado y la marca del oficial; la Deidad, 60, con ✓ si se pasó, y el final), la línea de
// datos («faltan N», «+N esta semana» y, cuando cuadra, el ✓ de «oficial N», que sustituye al
// «Cuadra con el contador oficial» del aviso) y los últimos conquistados (cada uno abre su panel de
// campeón, `?campeon=`). Sin envoltorio de tarjeta: fondo, borde y radio los pone la vitrina. La
// geometría es `god-bar.ts`; las transiciones de las capas las apaga el `prefers-reduced-motion`
// global.
//
// Si no cuadra, el aviso con sus acciones no va en la tarjeta sino en la pila flotante global
// (revisión v5b, D8–D12): no ocupa sitio al salir. En su lugar, donde iría el «✓ oficial N», un
// rastro corto en azul acero que lleva a él (`godTrace`), sin alto extra. Su cierre se recuerda en
// `localStorage` por perfil y por estado (`godNoticeSignature`). La explicación «?» sí se despliega
// en su sitio: la abre el usuario (también desde [Qué significa] del aviso).
//
// Dos disposiciones. En columna (miembros, junto a El grupo hoy) la tarjeta reparte el alto de la
// fila. A lo ancho (`wide`, fuera del grupo, T08) va a su medida.
//
// Rangos (container query `/god`: la propia tarjeta en columna; la rejilla de los trofeos a lo ancho,
// `TrophyGrid single`): por debajo de 420 px cifra de 36 y retratos de 32 (la barra sigue entera);
// desde 560 px (apilada o a lo ancho) más aire entre filas.

export interface GodTrophyProps extends ArenaGodProps {
  /** Hasta 5 campeones con el primer 1º más reciente (`recentConquests`); vacío sin verificados. */
  recent: readonly RecentConquest[];
  /** Campeones con el primer 1º en la semana de juego actual (`newThisWeek`). */
  weekNew: number;
  /** A lo ancho (fuera del grupo): la tarjeta va a su medida, sin repartir el alto de la fila. */
  wide?: boolean;
  className?: string;
}

export function GodTrophy({
  checkedAt,
  goalName,
  nowMs,
  recent,
  weekNew,
  wide = false,
  className,
  ...input
}: GodTrophyProps) {
  const explanationId = useId();
  const [explaining, setExplaining] = useState(false);
  const { state, mine, ready } = useArenaGod(input);
  const bar = godBar(state);
  const { status: pageStatus } = usePageStatus();
  // Cuando cuadra, el ✓ de «oficial N» ya lo dice: el aviso solo sale con descuadre. Con la key
  // caducada el job sigue en la cola pero no avanza: no se dice «sincronizando».
  const syncing =
    (pageStatus.profile?.sync ?? null) !== null &&
    !(pageStatus.profile?.paused ?? false);
  const trace = godTrace(state, syncing);
  const noticeId = godNoticeSignature(state);
  const { reveal } = useFloatingStack();

  /** [Qué significa]: abre la explicación en la tarjeta y la trae a la vista. */
  function explain() {
    setExplaining(true);
    requestAnimationFrame(() =>
      document
        .getElementById(explanationId)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }

  return (
    <div
      className={cn(
        "grid content-start gap-3",
        // En columna ocupa el alto que le da El grupo hoy y lo reparte (`align-content: space-between`).
        !wide && "@container/god h-full content-between",
        className,
      )}
    >
      <div
        className={cn(
          // Juntos para caber junto a El grupo hoy; con más aire cuando la tarjeta es ancha (apilada).
          "grid content-start gap-1.5 @min-[560px]/god:gap-2.5",
          !wide && "h-full content-between",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {goalName}
            </h2>
            <ArenaGodExplainButton
              label="¿Qué muestra esta barra?"
              controls={explanationId}
              open={explaining}
              onToggle={() => setExplaining((open) => !open)}
            />
          </div>
          <span className="text-xs text-faint">temporada</span>
        </div>

        <div className="flex items-baseline justify-between gap-2.5">
          <p className="num font-display text-[50px] leading-none font-extrabold text-place-1 @max-[420px]/god:text-[36px]">
            {state.total}
            <small className="text-[22px] font-bold text-muted-foreground @max-[420px]/god:text-base">
              {" "}
              / {state.goal}
            </small>
          </p>
          <p className="num font-mono text-sm font-medium text-muted-foreground">
            <b className="text-xl font-medium text-foreground">{bar.percent}</b>{" "}
            %
          </p>
        </div>

        <Bar state={state} bar={bar} />

        <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] leading-tight text-muted-foreground">
          <span>
            faltan{" "}
            <b className="num font-medium text-foreground">
              {godRemaining(state)}
            </b>
          </span>
          {weekNew > 0 && (
            <span className="num text-ok">+{weekNew} esta semana</span>
          )}
          {trace === null ? (
            <span className="inline-flex items-center gap-1">
              <Check aria-hidden="true" size={13} className="text-ok" />
              oficial {state.official}
            </span>
          ) : (
            // Rastro del aviso de la pila: lo reabre si se cerró (o lo despliega) y le lleva el foco.
            <button
              type="button"
              onClick={() => reveal(noticeId)}
              className="cursor-pointer text-trust underline-offset-2 hover:underline"
            >
              {trace.alert && <span aria-hidden="true">! </span>}
              {trace.text}
            </button>
          )}
        </p>

        {recent.length > 0 && <Recent recent={recent} />}
      </div>

      {/* Hasta leer `localStorage` (`ready`) los manuales no cuentan: así no sale un aviso que se va. */}
      {trace !== null && ready && (
        <FloatingItem
          id={noticeId}
          priority={GOD_PRIORITY}
          group="dios"
          remember={closedNoticeKey(
            normalizeRiotId(input.gameName, input.tagLine),
            "dios",
          )}
          title={GOD_NAME}
          icon="!"
        >
          <ArenaGodNotice
            state={state}
            mine={mine}
            checkedAt={checkedAt}
            nowMs={nowMs}
            onWhy={explain}
          />
        </FloatingItem>
      )}
      {/* A lo ancho, con tope: en la tarjeta a su medida no la estira hasta el borde. */}
      <ArenaGodExplanation
        id={explanationId}
        open={explaining}
        className={cn(wide && "max-w-[460px]")}
      />
    </div>
  );
}

// --- Barra -------------------------------------------------------------------------------

const LAYER =
  "absolute inset-y-0 left-0 rounded-md transition-[width] duration-400 ease-[ease]";
/** Marcas verticales, centradas en su posición (2 px de ancho). */
const MARK = "absolute w-0.5 rounded-[1px]";
const LABEL =
  "absolute top-[18px] inline-flex items-center gap-1 font-mono text-[11px] leading-none font-medium whitespace-nowrap text-faint";

function Bar({ state, bar }: { state: ArenaGodState; bar: GodBar }) {
  const left = (percent: number) => ({ left: `calc(${percent}% - 1px)` });
  // La Deidad: a medio camino con la meta en el catálogo; si la meta es ella, es el final.
  const deity = (
    <>
      <Crown aria-hidden="true" size={11} />
      Deidad · {ARENA_GOD_THRESHOLD}
      {bar.deityReached && (
        <>
          <span aria-hidden="true">✓</span>
          <span className="sr-only">(conseguida)</span>
        </>
      )}
    </>
  );

  return (
    // Las etiquetas van fuera del `role="img"` (sus hijos no los lee un lector de pantalla).
    <div className="relative mb-[17px]">
      <div
        role="img"
        aria-label={arenaGodLabel(state)}
        className="relative h-3 rounded-md bg-[rgba(255,255,255,.08)]"
      >
        {/* Los manuales van debajo, desde el 0: el extremo redondeado del oro tapa su arranque. */}
        {bar.total > bar.verified && (
          <span
            className={cn(
              LAYER,
              "bg-[repeating-linear-gradient(45deg,var(--trust)_0_3px,transparent_3px_6px)]",
            )}
            style={{ width: `${bar.total}%` }}
          />
        )}
        {bar.verified > 0 && (
          <span
            className={cn(
              LAYER,
              "bg-[linear-gradient(90deg,#b5852c,var(--place-1))] shadow-[0_0_14px_color-mix(in_srgb,var(--place-1)_40%,transparent)]",
            )}
            style={{ width: `${bar.verified}%` }}
          />
        )}
        {bar.godGoal && (
          <span
            className={cn(MARK, "-inset-y-[5px] bg-foreground")}
            style={left(bar.deity)}
          />
        )}
        {bar.official !== null && (
          <span
            className={cn(MARK, "-inset-y-[3px] bg-trust")}
            style={left(bar.official)}
          />
        )}
      </div>
      <span className={cn(LABEL, "left-0")}>0</span>
      {bar.godGoal ? (
        <>
          <span
            className={cn(LABEL, "-translate-x-1/2 text-place-1")}
            style={{ left: `${bar.deity}%` }}
          >
            {deity}
          </span>
          <span className={cn(LABEL, "right-0")}>Dios · {state.goal}</span>
        </>
      ) : (
        <span className={cn(LABEL, "right-0 text-place-1")}>{deity}</span>
      )}
    </div>
  );
}

// --- Últimos conquistados ----------------------------------------------------------------

function Recent({ recent }: { recent: readonly RecentConquest[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return (
    // La etiqueta a la izquierda de los retratos si caben (así la tarjeta no pasa del alto de El
    // grupo hoy a 1440 px); si no, encima.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <h3 className="font-display text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Últimos conquistados
      </h3>
      <ul className="flex gap-1.5">
        {recent.map((champion, index) => (
          <li key={champion.championId}>
            {/* Como el álbum: abre el panel conservando la pestaña y el resto de la query. */}
            <Link
              prefetch={false}
              scroll={false}
              href={championHref(pathname, search, champion.slug)}
              title={`${champion.name} · primer 1º el ${champion.dateText}`}
              className="grid w-11 justify-items-center gap-0.5 rounded-md text-[10px] leading-none text-faint hover:text-muted-foreground @max-[420px]/god:w-[38px]"
            >
              <span
                className={cn(
                  "relative grid size-9 place-items-center overflow-hidden rounded-md bg-surface-2 font-display text-[11px] font-extrabold text-muted-foreground @max-[420px]/god:size-8",
                  index === 0
                    ? "outline-2 outline-place-1"
                    : "outline-1 outline-won-deep",
                )}
              >
                <span aria-hidden="true">{initials(champion.name)}</span>
                {champion.portraitUrl && (
                  // Sin clave: si la imagen falla quedan las iniciales de debajo, como en `PortraitImage`.
                  <Image
                    src={champion.portraitUrl}
                    alt=""
                    width={72}
                    height={72}
                    draggable={false}
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
              </span>
              <span className="sr-only">{champion.name}, </span>
              {champion.dateText}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
