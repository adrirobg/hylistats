"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { parseRiotId, profileSlug } from "@/lib/riot-id";

/** Buscador de Riot ID (`Nombre#TAG`): navega a `/euw/{nombre}-{tag}`. */
export function RiotIdForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("riotId");
    const text = typeof value === "string" ? value.trim() : "";
    if (!text.includes("#")) {
      setError("Falta el tag: escribe el Riot ID como Nombre#TAG.");
      return;
    }
    const riotId = parseRiotId(text);
    if (!riotId) {
      setError(
        "Riot ID no válido: el nombre tiene de 3 a 16 caracteres y el tag de 2 a 5 letras o números.",
      );
      return;
    }
    setError(null);
    router.push(`/euw/${profileSlug(riotId.gameName, riotId.tagLine)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        Riot ID (Nombre#TAG)
        <input
          type="text"
          name="riotId"
          placeholder="Nombre#TAG"
          autoComplete="off"
          required
          className="rounded border border-gray-400 px-2 py-1"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="self-start rounded border border-gray-400 px-3 py-1"
      >
        Buscar
      </button>
    </form>
  );
}
