"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Box } from "@/components/hy/box";
import { Btn } from "@/components/hy/btn";
import { RiotIdSearch } from "@/components/landing/riot-id-search";
import { refreshAction, registerProfileAction } from "./actions";

// Estados de la página de perfil previos a tener datos (brief §5): el Riot ID no está registrado
// y el Riot ID no existe en Riot. Son tarjetas centradas, sin la cabina.

/** Cada cuánto se relee la página mientras se espera a que el worker resuelva el reintento. */
const RETRY_POLL_MS = 3_000;
/** Tras este tiempo sin novedades se deja de esperar. */
const RETRY_MAX_MS = 25_000;

function SubmitButton({
  children,
  pendingText,
}: {
  children: ReactNode;
  pendingText: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Btn type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </Btn>
  );
}

function Riot({ gameName, tagLine }: { gameName: string; tagLine: string }) {
  return (
    <span className="[overflow-wrap:anywhere]">
      {gameName}
      <span className="text-faint">#{tagLine}</span>
    </span>
  );
}

/** Riot ID sin registrar: ofrece darlo de alta (empieza el backfill, que se ve en la banda). */
export function UnregisteredCard({
  slug,
  gameName,
  tagLine,
}: {
  slug: string;
  gameName: string;
  tagLine: string;
}) {
  return (
    <Box className="grid gap-3.5 p-5">
      <p>
        <Riot gameName={gameName} tagLine={tagLine} /> todavía no está
        registrado en hylistats.
      </p>
      <p className="text-sm text-muted-foreground">
        Al registrarlo descargamos las partidas de Arena de la temporada actual.
        Puedes cerrar la pestaña mientras tanto.
      </p>
      <form action={registerProfileAction}>
        <input type="hidden" name="slug" value={slug} />
        <SubmitButton pendingText="Registrando…">
          Registrar y sincronizar
        </SubmitButton>
      </form>
    </Box>
  );
}

/**
 * Riot (Account-V1) no conoce el Riot ID: mensaje, campo con lo escrito para corregir el #TAG y
 * «Reintentar» (vuelve a preguntar a Riot por el mismo Riot ID). El reintento lo resuelve el
 * worker, así que la página se relee cada pocos segundos hasta que el perfil aparezca.
 */
export function NotFoundCard({
  slug,
  gameName,
  tagLine,
}: {
  slug: string;
  gameName: string;
  tagLine: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(refreshAction, null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (state?.result === "queued" || state?.result === "active") {
      setWaiting(true);
    }
  }, [state]);

  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(() => router.refresh(), RETRY_POLL_MS);
    const stop = setTimeout(() => setWaiting(false), RETRY_MAX_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [waiting, router]);

  let message: string | null = null;
  if (waiting) message = "Preguntando a Riot…";
  else if (state?.result === "cooldown") {
    message = "Espera un momento antes de volver a intentarlo.";
  } else if (state?.result === "queued" || state?.result === "active") {
    message = "Riot sigue sin encontrarlo. Revisa el #TAG.";
  }

  return (
    <Box className="grid gap-3.5 p-5">
      <p role="alert">
        No encontramos «<Riot gameName={gameName} tagLine={tagLine} />» en EUW.
        Revisa el #TAG.
      </p>
      <RiotIdSearch defaultValue={`${gameName}#${tagLine}`} />
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="slug" value={slug} />
        <Btn type="submit" disabled={pending || waiting} aria-busy={waiting}>
          Reintentar
        </Btn>
        <span className="text-sm text-muted-foreground">
          Vuelve a preguntar a Riot por este mismo Riot ID.
        </span>
      </form>
      <output className="min-h-5 text-sm text-muted-foreground">
        {message}
      </output>
    </Box>
  );
}
