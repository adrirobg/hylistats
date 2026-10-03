"use client";

import { useId, useState } from "react";
import {
  type ArenaGodState,
  arenaGodHeading,
  arenaGodLabel,
  manualPhrase,
  officialPhrase,
  verifiedPhrase,
} from "@/domain/arena-god";
import { cn } from "@/lib/utils";
import {
  ArenaGodExplainButton,
  ArenaGodExplanation,
  ArenaGodNotice,
  type ArenaGodProps,
  useArenaGod,
} from "./arena-god-notice";

// Barra Arena God de tres capas y aviso de descuadre (brief §4.2 y §4.3, `.god` de la maqueta):
// verificados (oro sólido), marcas manuales (azul acero rayado y discontinuo) y el contador
// oficial de 602002 (marca vertical), con la meta y la escala. La lógica es `domain/arena-god.ts`
// y el estado, el aviso y la explicación los comparte con el trofeo (`arena-god-notice.tsx`); aquí
// solo se pinta la barra. Las transiciones de anchura las apaga el `prefers-reduced-motion` global.

export type ArenaGodBarProps = ArenaGodProps;

export function ArenaGodBar({
  checkedAt,
  goalName,
  nowMs,
  ...input
}: ArenaGodBarProps) {
  const explanationId = useId();
  const [explaining, setExplaining] = useState(false);
  const { state, mine } = useArenaGod(input);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[15px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            {arenaGodHeading(goalName)}
          </h2>
          <ArenaGodExplainButton
            label="¿Qué muestra esta barra?"
            controls={explanationId}
            open={explaining}
            onToggle={() => setExplaining((open) => !open)}
          />
        </div>
        <p className="num text-sm text-muted-foreground">
          <b className="mr-0.5 font-display text-[30px] font-extrabold tracking-[0.01em] text-place-1">
            {state.total}
          </b>{" "}
          de {state.goal} · {verifiedPhrase(state.verified)} +{" "}
          {manualPhrase(state.manual)} · {officialPhrase(state.official)}
        </p>
      </div>

      <Bar state={state} goalName={goalName} />

      <ArenaGodNotice
        state={state}
        mine={mine}
        checkedAt={checkedAt}
        nowMs={nowMs}
        onWhy={() => setExplaining(true)}
      />
      <ArenaGodExplanation id={explanationId} open={explaining} />
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

function Bar({ state, goalName }: { state: ArenaGodState; goalName: string }) {
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
            {/* En pantallas estrechas el nombre chocaría con el tick anterior («4060 · Deidad de Arena»). */}
            {tick === goal && (
              <span className="@max-[480px]:hidden"> · {goalName}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
