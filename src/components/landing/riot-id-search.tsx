"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { parseRiotIdInput, profileSlug, riotIdInputError } from "@/lib/riot-id";
import { cn } from "@/lib/utils";

/**
 * Campo único de la landing (`.lsearch` de la maqueta): acepta `Nombre#TAG`, `Nombre-TAG` o la
 * URL de un perfil de op.gg. Solo valida el formato; que el Riot ID exista en Riot lo resuelve
 * la página de perfil. Si el formato falla, el error sale bajo el campo y se mantiene lo escrito.
 * `defaultValue` precarga el campo (el estado «no encontrado» del perfil lo usa con el Riot ID
 * que no apareció, para corregir el #TAG).
 */
export function RiotIdSearch({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const errorId = useId();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseRiotIdInput(value);
    if (!result.ok) {
      setError(riotIdInputError(result.reason));
      return;
    }
    setError(null);
    const { gameName, tagLine } = result.riotId;
    router.push(`/euw/${profileSlug(gameName, tagLine)}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <div
        className={cn(
          "flex overflow-hidden rounded-[6px] border border-line",
          error && "border-danger",
        )}
      >
        <input
          type="text"
          name="riotId"
          aria-label="Riot ID"
          placeholder="Nombre#TAG"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          // El contorno de foco va hacia dentro: el contenedor recorta (`overflow-hidden`).
          className="min-w-0 flex-1 bg-background px-3.5 py-3 text-lg placeholder:text-faint focus-visible:-outline-offset-2"
        />
        <button
          type="submit"
          className="cursor-pointer bg-place-1 px-[18px] font-bold text-[#231906] focus-visible:-outline-offset-2"
        >
          Ir
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
