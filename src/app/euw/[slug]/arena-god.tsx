"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useMemo, useState } from "react";
import { Btn } from "@/components/hy/btn";
import { Notice } from "@/components/hy/notice";
import { ToastRegion, useToast } from "@/components/hy/toast";
import {
  ARENA_GOD_EXPLANATION,
  type ArenaGodAction,
  type ArenaGodState,
  arenaGodActions,
  arenaGodLabel,
  arenaGodMessage,
  arenaGodState,
  manualPhrase,
  officialPhrase,
  verifiedPhrase,
} from "@/domain/arena-god";
import { type LocalState, profileData } from "@/lib/local-store";
import { normalizeRiotId } from "@/lib/riot-id";
import { useLocalReady, useLocalStore } from "@/lib/use-local-store";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { REFRESH_BUTTON_ID } from "./use-refresh";
import { markByHandHref, whenPhrase } from "./view-model";

// Barra Arena God de tres capas y aviso de descuadre (brief §4.2 y §4.3, `.god` de la maqueta):
// verificados (oro sólido), marcas manuales (azul acero rayado y discontinuo) y el contador
// oficial de 602002 (marca vertical), con la meta y la escala. La lógica es `domain/arena-god.ts`;
// aquí solo se pinta. Es cliente porque los manuales viven en el navegador y solo cuentan en «mi
// perfil» (D12). Las transiciones de anchura las apaga el `prefers-reduced-motion` global.

export interface ArenaGodBarProps {
  /** Forma canónica de Riot: con ella se decide si el perfil es «mi perfil». */
  gameName: string;
  tagLine: string;
  /** `championId` con algún 1º (lista verificada). */
  verifiedIds: number[];
  /** Contador oficial de 602002; `null` si no se pudo leer. */
  official: number | null;
  /** Instante (ms) en que se consultó el contador; `null` si nunca. */
  checkedAt: number | null;
  /** Meta de la barra (`ARENA_GOD_THRESHOLD`). */
  goal: number;
  /** Hora del servidor (ms): el primer render coincide con el HTML del servidor. */
  nowMs: number;
}

const selectMyProfile = (state: LocalState) => state.myProfile;
/** Sin marcas: la misma referencia siempre, para que el `useMemo` del estado no se invalide. */
const NO_IDS: readonly number[] = [];

export function ArenaGodBar({
  gameName,
  tagLine,
  verifiedIds,
  official,
  checkedAt,
  goal,
  nowMs,
}: ArenaGodBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast, show } = useToast();
  const explanationId = useId();
  const [explaining, setExplaining] = useState(false);
  const now = useNow(nowMs);

  // «Mi perfil» se decide igual que en el header. Hasta que el cliente lee `localStorage`
  // (`ready`) el estado es el vacío del servidor, así que ahí no se cuenta ningún manual.
  const norm = normalizeRiotId(gameName, tagLine);
  const ready = useLocalReady();
  const myProfile = useLocalStore(selectMyProfile);
  const mine =
    ready &&
    myProfile !== null &&
    normalizeRiotId(myProfile.gameName, myProfile.tagLine) === norm;
  const selectManual = useCallback(
    (state: LocalState) => profileData(state, norm).manual,
    [norm],
  );
  const localManual = useLocalStore(selectManual);
  const manualIds = mine ? localManual : NO_IDS;

  const state = useMemo(
    () => arenaGodState({ verifiedIds, manualIds, official, goal }),
    [verifiedIds, manualIds, official, goal],
  );

  /** [Sincronizar] y [Reintentar]: pulsan Actualizar del header, con su progreso y su toast. */
  function refresh() {
    const button = document.getElementById(REFRESH_BUTTON_ID);
    if (!(button instanceof HTMLButtonElement)) return;
    // Un botón deshabilitado ignora `.click()`: se avisa en lugar de no hacer nada.
    if (button.disabled) show("Ya se está actualizando");
    else button.click();
  }

  /**
   * [Marcar a mano]: lleva al álbum filtrado por «sin ganar» y guía hasta la marca. Vale desde
   * cualquier pestaña: `markByHandHref` vuelve a Campeones, donde vive el filtro.
   */
  function markByHand() {
    router.replace(markByHandHref(pathname, searchParams.toString()), {
      scroll: false,
    });
    show("Abre el menú ⋯ de un campeón y usa «Marcar como ganado a mano»");
  }

  const actions: Record<ArenaGodAction, { label: string; run: () => void }> = {
    sync: { label: "Sincronizar", run: refresh },
    manual: { label: "Marcar a mano", run: markByHand },
    why: { label: "Qué significa", run: () => setExplaining(true) },
    retry: { label: "Reintentar", run: refresh },
  };
  const noticeActions = arenaGodActions(state.status, mine);
  const parts = arenaGodMessage(
    state,
    checkedAt === null ? null : whenPhrase(checkedAt, now),
  );

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[15px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Arena God · temporada actual
          </h2>
          <button
            type="button"
            aria-label="¿Qué muestra esta barra?"
            aria-expanded={explaining}
            aria-controls={explanationId}
            onClick={() => setExplaining((open) => !open)}
            className="grid size-5 flex-none cursor-pointer place-items-center rounded-full border border-line text-xs text-muted-foreground hover:border-faint hover:text-foreground"
          >
            ?
          </button>
        </div>
        <p className="num text-sm text-muted-foreground">
          <b className="mr-0.5 font-display text-[30px] font-extrabold tracking-[0.01em] text-place-1">
            {state.total}
          </b>{" "}
          de {state.goal} · {verifiedPhrase(state.verified)} +{" "}
          {manualPhrase(state.manual)} · {officialPhrase(state.official)}
        </p>
      </div>

      <Bar state={state} />

      <Notice
        role="status"
        variant={state.status === "match" ? "okay" : "trust"}
        actions={
          noticeActions.length > 0
            ? noticeActions.map((name) => (
                <Btn
                  key={name}
                  size="small"
                  variant="trust"
                  onClick={actions[name].run}
                >
                  {actions[name].label}
                </Btn>
              ))
            : undefined
        }
      >
        {parts.map((part, i) =>
          typeof part === "string" ? (
            part
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: trozos de un mensaje fijo, sin identidad propia.
            <b key={i}>{part.strong}</b>
          ),
        )}
      </Notice>

      <p
        id={explanationId}
        hidden={!explaining}
        className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-muted-foreground"
      >
        {ARENA_GOD_EXPLANATION}
      </p>
      <ToastRegion>{toast}</ToastRegion>
    </>
  );
}

// --- Barra -------------------------------------------------------------------------------

/** Alineación de una etiqueta sobre su marca: centrada, salvo en los extremos para no salirse. */
function edgeClass(percent: number): string {
  if (percent < 10) return "";
  if (percent > 90) return "-translate-x-full";
  return "-translate-x-1/2";
}

function Bar({ state }: { state: ArenaGodState }) {
  const { verified, manual, official, goal, scaleMax, ticks } = state;
  const at = (value: number) => (value / scaleMax) * 100;
  const officialAt = official === null ? null : at(official);

  return (
    <div>
      {/* `mt-3.5` deja sitio a la etiqueta «oficial N», que sobresale por encima de la barra. */}
      <div
        role="img"
        aria-label={arenaGodLabel(state)}
        className="relative mt-3.5 h-3.5 rounded-[3px] bg-surface-2"
      >
        <i
          className="absolute inset-y-0 left-0 rounded-l-[3px] bg-[linear-gradient(180deg,#F2C865,var(--place-1))] transition-[width] duration-400 ease-[ease]"
          style={{ width: `${at(verified)}%` }}
        />
        {manual > 0 && (
          <i
            className="absolute inset-y-0 border border-dashed border-trust bg-[repeating-linear-gradient(135deg,var(--trust)_0_3px,transparent_3px_6px)] transition-[left,width] duration-400 ease-[ease]"
            style={{ left: `${at(verified)}%`, width: `${at(manual)}%` }}
          />
        )}
        {/* Meta: una raya fina; la escala de debajo la nombra. */}
        <i
          className="absolute -top-[3px] -bottom-[3px] w-px -translate-x-full bg-faint"
          style={{ left: `${at(goal)}%` }}
        />
        {officialAt !== null && (
          <i
            className="absolute -top-[5px] -bottom-[5px] w-0.5 -translate-x-1/2 bg-foreground transition-[left] duration-400 ease-[ease]"
            style={{ left: `${officialAt}%` }}
          >
            <span
              className={cn(
                "absolute -top-[18px] font-mono text-[11px] font-normal whitespace-nowrap text-foreground not-italic",
                officialAt < 10
                  ? "left-0"
                  : officialAt > 90
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2",
              )}
            >
              oficial {official}
            </span>
          </i>
        )}
      </div>
      <div
        aria-hidden="true"
        className="num relative mt-2.5 h-4 font-mono text-[11px] text-faint"
      >
        {ticks.map((tick) => (
          <span
            key={tick}
            className={cn(
              "absolute top-0 whitespace-nowrap",
              edgeClass(at(tick)),
            )}
            style={{ left: `${at(tick)}%` }}
          >
            {tick}
            {/* En pantallas estrechas el nombre chocaría con el tick anterior («4060 · Arena God»). */}
            {tick === goal && (
              <span className="@max-[480px]:hidden"> · Arena God</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
