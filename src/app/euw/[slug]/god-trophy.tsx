"use client";

import { Check, Crown } from "lucide-react";
import { useId, useState } from "react";
import { type ArenaGodState, arenaGodLabel } from "@/domain/arena-god";
import { cn } from "@/lib/utils";
import {
  ArenaGodExplainButton,
  ArenaGodExplanation,
  ArenaGodNotice,
  type ArenaGodProps,
  useArenaGod,
} from "./arena-god-notice";
import { godMilestones, godRemaining, godRing } from "./god-ring";

// Trofeo Dios de Arena de la vitrina (propuesta C2 de `.dev/research/cabecera`, tarjeta `.tw.g`):
// las tres capas de la barra en un anillo (verificados en oro, manuales en azul rayado y la marca
// del oficial), la cifra, «faltan N», los hitos y el aviso con sus acciones de la antigua barra.
// Sin envoltorio de tarjeta: fondo, borde y radio los pone la vitrina. La geometría es
// `god-ring.ts`; las transiciones del arco las apaga el `prefers-reduced-motion` global.

export interface GodTrophyProps extends ArenaGodProps {
  className?: string;
}

export function GodTrophy({
  checkedAt,
  goalName,
  nowMs,
  className,
  ...input
}: GodTrophyProps) {
  const explanationId = useId();
  const [explaining, setExplaining] = useState(false);
  const { state, mine } = useArenaGod(input);

  return (
    <div className={cn("@container/god grid content-start gap-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {goalName}
          </h2>
          <ArenaGodExplainButton
            label="¿Qué muestra este anillo?"
            controls={explanationId}
            open={explaining}
            onToggle={() => setExplaining((open) => !open)}
          />
        </div>
        <span className="text-xs text-faint">temporada</span>
      </div>

      <div className="flex items-center gap-[18px] @max-[420px]/god:gap-3.5">
        <Ring state={state} />
        <div className="min-w-0">
          <p className="num font-display text-[66px] leading-none font-extrabold text-place-1 @max-[420px]/god:text-[48px]">
            {state.total}
            <small className="text-[26px] font-bold text-muted-foreground">
              {" "}
              / {state.goal}
            </small>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
            <span>
              faltan{" "}
              <b className="num font-medium text-foreground">
                {godRemaining(state)}
              </b>
            </span>
            {state.status === "match" && (
              <span className="inline-flex items-center gap-1">
                <Check aria-hidden="true" size={14} className="text-ok" />
                oficial {state.official}
              </span>
            )}
          </p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
        {godMilestones(state).map((milestone) => (
          <li
            key={milestone.label}
            className={cn(
              "inline-flex items-center gap-1.5",
              milestone.done && "text-place-1",
              milestone.later && "text-faint",
            )}
          >
            {milestone.done && <Crown aria-hidden="true" size={14} />}
            {milestone.label}
            {milestone.done && <span className="sr-only"> (conseguida)</span>}
          </li>
        ))}
      </ul>

      <ArenaGodNotice
        state={state}
        mine={mine}
        checkedAt={checkedAt}
        nowMs={nowMs}
        onWhy={() => setExplaining(true)}
      />
      <ArenaGodExplanation id={explanationId} open={explaining} />
    </div>
  );
}

// --- Anillo ------------------------------------------------------------------------------

/** Lienzo de 120 × 120: radio y trazo de `ringSvg` en la maqueta. */
const CENTER = 60;
const RADIUS = 50;
const STROKE = 12;
/** Marcas radiales (oficial e hito): un poco más largas que el grosor del trazo. */
const MARK_FROM = CENTER - RADIUS - STROKE / 2 - 2;
const MARK_TO = CENTER - RADIUS + STROKE / 2 + 2;
const ARC_TRANSITION =
  "transition-[stroke-dasharray,stroke-dashoffset] duration-400 ease-[ease]";

function Ring({ state }: { state: ArenaGodState }) {
  // `useId` puede traer caracteres que no valen en `url(#…)`.
  const stripesId = `stripes${useId().replace(/[^\w-]/g, "")}`;
  const ring = godRing(state, RADIUS);
  const circle = { cx: CENTER, cy: CENTER, r: RADIUS, fill: "none" } as const;
  const arc = (length: number, offset: number) => ({
    strokeDasharray: `${length} ${ring.circumference}`,
    strokeDashoffset: -offset,
  });

  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={arenaGodLabel(state)}
      className="size-[118px] flex-none @max-[420px]/god:size-[88px]"
    >
      <defs>
        <pattern
          id={stripesId}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="6" fill="var(--trust)" />
        </pattern>
      </defs>
      <circle {...circle} stroke="rgba(255,255,255,.08)" strokeWidth={STROKE} />
      {/* Desde las 12 en sentido horario. Los manuales van debajo: el extremo redondeado del oro
          tapa su arranque. */}
      <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
        {ring.manualLength > 0 && (
          <circle
            {...circle}
            stroke={`url(#${stripesId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            className={ARC_TRANSITION}
            style={arc(ring.manualLength, ring.verifiedLength)}
          />
        )}
        {ring.verifiedLength > 0 && (
          <circle
            {...circle}
            stroke="var(--place-1)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            className={ARC_TRANSITION}
            style={arc(ring.verifiedLength, 0)}
          />
        )}
      </g>
      {/* Hito de la Deidad (60) con la meta en el catálogo: marca de oro o, bajo el arco, muesca. */}
      {ring.milestoneAngle !== null && (
        <line
          x1={CENTER}
          y1={MARK_FROM + 1}
          x2={CENTER}
          y2={MARK_TO - 1}
          stroke={
            ring.milestoneCovered ? "var(--background)" : "var(--place-1)"
          }
          strokeWidth={ring.milestoneCovered ? 2 : 3}
          transform={`rotate(${ring.milestoneAngle} ${CENTER} ${CENTER})`}
        />
      )}
      {ring.officialAngle !== null && (
        <line
          x1={CENTER}
          y1={MARK_FROM}
          x2={CENTER}
          y2={MARK_TO}
          stroke="var(--foreground)"
          strokeWidth={2.5}
          strokeLinecap="round"
          transform={`rotate(${ring.officialAngle} ${CENTER} ${CENTER})`}
        >
          <title>{`oficial ${state.official}`}</title>
        </line>
      )}
      <text
        x={CENTER}
        y={CENTER + 6}
        textAnchor="middle"
        fontSize={18}
        className="num fill-foreground font-mono"
      >
        {ring.percent}%
      </text>
    </svg>
  );
}
