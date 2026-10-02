"use client";

import { X } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Btn } from "@/components/hy/btn";
import {
  ARENA_TEAM_SIZE,
  type DrawnTeam,
  shuffle,
  splitTeams,
  validateName,
} from "@/domain/team-draw";
import { cn } from "@/lib/utils";

/** Pausa entre un nombre y el siguiente, como una ruleta que se detiene. */
const REVEAL_MS = 900;
/** Cambio del nombre que «gira» en el hueco siguiente mientras tanto. */
const SPIN_MS = 70;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Nombre del equipo según cuántos desconocidos completan el hueco. */
function teamLabel(team: DrawnTeam, index: number): string {
  const suffix =
    team.unknowns === 0
      ? "trío"
      : team.unknowns === 1
        ? "dúo + desconocido"
        : "va solo";
  return `Equipo ${index + 1} · ${suffix}`;
}

/** Reparto que saldrá con `count` jugadores, p. ej. «3 + 2». */
function shapeLabel(count: number): string {
  return splitTeams(Array.from({ length: count }, () => ""))
    .map((team) => team.players.length)
    .join(" + ");
}

/**
 * Sorteo de equipos (#19): se marcan los miembros del grupo que juegan y se añaden a mano los
 * demás; al sortear, los nombres salen de uno en uno y se reparten de 3 en 3 en ese orden.
 * Cambiar a los jugadores borra el sorteo anterior.
 */
export function TeamDraw({ members }: { members: readonly string[] }) {
  const inputId = useId();
  const errorId = useId();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [typed, setTyped] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [spin, setSpin] = useState(0);

  const players = [...members.filter((name) => selected.has(name)), ...typed];
  const drawing = order !== null && revealed < order.length;

  useEffect(() => {
    if (order === null || revealed >= order.length) return;
    const reveal = setTimeout(() => setRevealed((n) => n + 1), REVEAL_MS);
    const spinner = setInterval(() => setSpin((n) => n + 1), SPIN_MS);
    return () => {
      clearTimeout(reveal);
      clearInterval(spinner);
    };
  }, [order, revealed]);

  function resetDraw() {
    setOrder(null);
    setRevealed(0);
  }

  function toggleMember(name: string) {
    const next = new Set(selected);
    if (!next.delete(name)) next.add(name);
    setSelected(next);
    resetDraw();
  }

  function addTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateName(value, [...members, ...typed]);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTyped([...typed, result.name]);
    setValue("");
    setError(null);
    resetDraw();
  }

  function removeTyped(name: string) {
    setTyped(typed.filter((other) => other !== name));
    resetDraw();
  }

  function draw() {
    const next = shuffle(players);
    setOrder(next);
    setRevealed(prefersReducedMotion() ? next.length : 0);
  }

  const teams = order ? splitTeams(order) : [];
  // Nombre que «gira» en el hueco siguiente: va pasando por los que aún no han salido.
  const pending = order ? order.slice(revealed) : [];
  const spinning = pending.length > 0 ? pending[spin % pending.length] : null;
  const lastOut = order && revealed > 0 ? order[revealed - 1] : null;

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 rounded-[8px] border border-line bg-surface-1 p-3.5">
        <h2 className="font-display text-[14px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          ¿Quién juega?
        </h2>
        {members.length > 0 && (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Miembros del grupo</legend>
            {members.map((name) => (
              <label
                key={name}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm has-checked:border-place-1 has-checked:text-place-1"
              >
                <input
                  type="checkbox"
                  checked={selected.has(name)}
                  onChange={() => toggleMember(name)}
                  className="size-4 accent-place-1"
                />
                {name}
              </label>
            ))}
          </fieldset>
        )}
        {typed.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Nombres añadidos">
            {typed.map((name) => (
              <li
                key={name}
                className="inline-flex items-center gap-1 rounded-full border border-place-1 py-1.5 pr-1.5 pl-3 text-sm text-place-1"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeTyped(name)}
                  aria-label={`Quitar a ${name}`}
                  className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addTyped} className="grid gap-1.5">
          <label htmlFor={inputId} className="text-sm text-muted-foreground">
            Añadir a alguien más
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              type="text"
              placeholder="Nombre"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                "min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 placeholder:text-faint",
                error && "border-danger",
              )}
            />
            <Btn type="submit">Añadir</Btn>
          </div>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={draw}
          disabled={players.length < 2 || drawing}
          className="cursor-pointer rounded-lg bg-place-1 px-5 py-2.5 font-bold text-[#231906] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {order ? "Sortear de nuevo" : "Sortear"}
        </button>
        {drawing && (
          <Btn onClick={() => setRevealed(order.length)}>Mostrar todo</Btn>
        )}
        <p className="font-mono text-xs text-muted-foreground">
          {players.length < 2
            ? "Elige al menos 2 jugadores"
            : `${players.length} jugadores · ${shapeLabel(players.length)}`}
        </p>
      </div>

      <p className="sr-only" aria-live="polite">
        {lastOut && `Sale ${lastOut}`}
        {order && !drawing && ". Sorteo terminado"}
      </p>

      {order && (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((team, teamIndex) => {
            const start = teamIndex * ARENA_TEAM_SIZE;
            return (
              <section
                key={start}
                className="rounded-[8px] border border-line bg-surface-1 p-3.5"
              >
                <h2 className="mb-2.5 font-display text-[14px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  {teamLabel(team, teamIndex)}
                </h2>
                <ol className="grid gap-1.5">
                  {team.players.map((name, i) => {
                    const position = start + i;
                    const shown = position < revealed;
                    const next = position === revealed;
                    return (
                      <li
                        key={position}
                        className="flex items-baseline gap-3 rounded-md bg-surface-2 px-3 py-2"
                      >
                        <span className="num w-5 font-mono text-xs text-faint">
                          {position + 1}
                        </span>
                        {shown ? (
                          <span className="animate-in text-lg font-bold duration-300 fade-in-0 zoom-in-90">
                            {name}
                          </span>
                        ) : (
                          <span
                            aria-hidden="true"
                            className="text-lg text-faint"
                          >
                            {next && spinning ? spinning : "?"}
                          </span>
                        )}
                      </li>
                    );
                  })}
                  {Array.from({ length: team.unknowns }, (_, i) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: huecos idénticos, sin identidad.
                      key={i}
                      className="flex items-baseline gap-3 rounded-md border border-dashed border-line px-3 py-2 text-faint"
                    >
                      <span className="w-5" />
                      Desconocido
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
