"use client";

import { useActionState, useEffect, useState } from "react";
import { type RefreshState, refreshAction } from "./actions";

/** Tras este tiempo se oculta el mensaje del último intento (no debe quedar obsoleto). */
const MESSAGE_MS = 8_000;

function messageFor(
  result: NonNullable<RefreshState>["result"],
  cooldownSeconds: number,
): string {
  switch (result) {
    case "queued":
      return "Actualización en cola.";
    case "active":
      return "Ya hay una sincronización en curso.";
    case "cooldown":
      return `Espera un momento: la última sincronización terminó hace menos de ${cooldownSeconds} s.`;
    case "not_found":
      return "Perfil no encontrado.";
  }
}

/** Botón "Actualizar": pide un refresco interactivo y muestra si se encoló, ya había uno o hay cooldown. */
export function RefreshButton({
  slug,
  cooldownSeconds,
}: {
  slug: string;
  cooldownSeconds: number;
}) {
  const [state, action, pending] = useActionState(refreshAction, null);
  const [hidden, setHidden] = useState<RefreshState>(null);

  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => setHidden(state), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-gray-400 px-3 py-1 disabled:opacity-50"
      >
        Actualizar
      </button>
      {state && state !== hidden && (
        <output className="text-sm">
          {messageFor(state.result, cooldownSeconds)}
        </output>
      )}
    </form>
  );
}
