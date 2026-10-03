"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Btn } from "@/components/hy/btn";
import { Notice } from "@/components/hy/notice";
import { ToastRegion, useToast } from "@/components/hy/toast";
import {
  ARENA_GOD_EXPLANATION,
  type ArenaGodAction,
  type ArenaGodState,
  arenaGodActions,
  arenaGodMessage,
  arenaGodState,
} from "@/domain/arena-god";
import { type LocalState, profileData } from "@/lib/local-store";
import { normalizeRiotId } from "@/lib/riot-id";
import { useLocalReady, useLocalStore } from "@/lib/use-local-store";
import { useNow } from "@/lib/use-now";
import { REFRESH_BUTTON_ID } from "./use-refresh";
import { markByHandHref, whenPhrase } from "./view-model";

// Piezas de Arena God del trofeo de la vitrina (`GodTrophy`): el estado de las tres capas con los
// manuales de «mi perfil», el aviso de descuadre con sus acciones, el botón «?» y la explicación.
// Las compartía con la barra Arena God, que la vitrina sustituyó (iter-11).

export interface ArenaGodProps {
  /** Forma canónica de Riot: con ella se decide si el perfil es «mi perfil». */
  gameName: string;
  tagLine: string;
  /** `championId` con algún 1º (lista verificada). */
  verifiedIds: number[];
  /** Contador oficial de 602002; `null` si no se pudo leer. */
  official: number | null;
  /** Instante (ms) en que se consultó el contador; `null` si nunca. */
  checkedAt: number | null;
  /** Meta: 60 o, con el badge conseguido, el catálogo (`arenaGodGoal`). */
  goal: number;
  /** Nombre de esa meta: «Deidad de Arena» o «Dios de Arena» (`arenaGodGoal`). */
  goalName: string;
  /** Hora del servidor (ms): el primer render coincide con el HTML del servidor. */
  nowMs: number;
}

const selectMyProfile = (state: LocalState) => state.myProfile;
/** Sin marcas: la misma referencia siempre, para que el `useMemo` del estado no se invalide. */
const NO_IDS: readonly number[] = [];

/**
 * Estado de las tres capas y si el perfil es «mi perfil». Es cliente porque los manuales viven en
 * el navegador y solo cuentan en «mi perfil» (D12).
 */
export function useArenaGod({
  gameName,
  tagLine,
  verifiedIds,
  official,
  goal,
}: Pick<
  ArenaGodProps,
  "gameName" | "tagLine" | "verifiedIds" | "official" | "goal"
>): { state: ArenaGodState; mine: boolean } {
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
  return { state, mine };
}

/** Aviso de descuadre con sus acciones (brief §4.3) y el toast de esas acciones. */
export function ArenaGodNotice({
  state,
  mine,
  checkedAt,
  nowMs,
  onWhy,
}: {
  state: ArenaGodState;
  mine: boolean;
  checkedAt: number | null;
  nowMs: number;
  /** [Qué significa]: abre la explicación. */
  onWhy: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast, show } = useToast();
  const now = useNow(nowMs);

  /** [Sincronizar] y [Reintentar]: pulsan Actualizar de la barra fija, con su progreso y su toast. */
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
    why: { label: "Qué significa", run: onWhy },
    retry: { label: "Reintentar", run: refresh },
  };
  const noticeActions = arenaGodActions(state.status, mine);
  const parts = arenaGodMessage(
    state,
    checkedAt === null ? null : whenPhrase(checkedAt, now),
  );

  return (
    <>
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
      <ToastRegion>{toast}</ToastRegion>
    </>
  );
}

/** Botón «?» que abre y cierra la explicación (`ArenaGodExplanation` con el mismo `id`). */
export function ArenaGodExplainButton({
  label,
  controls,
  open,
  onToggle,
}: {
  /** `aria-label`: qué explica («¿Qué muestra esta barra?»). */
  label: string;
  controls: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="grid size-5 flex-none cursor-pointer place-items-center rounded-full border border-line text-xs text-muted-foreground hover:border-faint hover:text-foreground"
    >
      ?
    </button>
  );
}

/** Las tres capas en dos frases, bajo el aviso. */
export function ArenaGodExplanation({
  id,
  open,
}: {
  id: string;
  open: boolean;
}) {
  return (
    <p
      id={id}
      hidden={!open}
      className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-muted-foreground"
    >
      {ARENA_GOD_EXPLANATION}
    </p>
  );
}
