"use client";

import {
  type ReactNode,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { Box } from "@/components/hy/box";
import { Btn } from "@/components/hy/btn";
import { RiotIdSearch } from "@/components/landing/riot-id-search";
import { refreshAction, registerProfileAction } from "./actions";
import {
  advanceWatch,
  type RefreshSnapshot,
  type RefreshWatch,
  startWatch,
} from "./refresh-outcome";
import { usePageStatus } from "./status-provider";

// Estados de la página de perfil previos a tener datos (brief §5): el Riot ID no está registrado
// y el Riot ID no existe en Riot. Son tarjetas centradas, sin la cabina.

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
 * worker: la espera sigue el estado de `StatusProvider` (cada 5 s con el job en marcha). Si Riot
 * lo encuentra, el estado cambia de `kind` y la página se repinta como perfil; si no, el job acaba
 * en error y se deja de esperar.
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
  const [state, action, pending] = useActionState(refreshAction, null);
  const { status } = usePageStatus();
  // La misma vigilancia que Actualizar (`refresh-outcome.ts`), sin partidas que contar.
  const lastSyncedAt = status.profile?.lastSyncedAt ?? null;
  const errorAt = status.profile?.lastJobErrorAt ?? null;
  const active = status.profile?.sync != null;
  const snapshot: RefreshSnapshot = useMemo(
    () => ({ games: 0, champions: [], lastSyncedAt, errorAt, active }),
    [lastSyncedAt, errorAt, active],
  );
  const [watch, setWatch] = useState<RefreshWatch | null>(null);
  // La foto se toma al pulsar: cuando vuelve la action, la página ya viene refrescada.
  const before = useRef<RefreshSnapshot | null>(null);
  const latest = useRef(snapshot);
  useEffect(() => {
    latest.current = snapshot;
  });

  useEffect(() => {
    if (state?.result === "queued" || state?.result === "active") {
      setWatch(startWatch(before.current ?? latest.current));
    }
  }, [state]);

  useEffect(() => {
    if (!watch) return;
    const step = advanceWatch(watch, snapshot);
    if (step.watch !== watch) setWatch(step.watch);
  }, [watch, snapshot]);

  const waiting = watch !== null;
  useEffect(() => {
    if (!waiting) return;
    const stop = setTimeout(() => setWatch(null), RETRY_MAX_MS);
    return () => clearTimeout(stop);
  }, [waiting]);

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
        <Btn
          type="submit"
          onClick={() => {
            before.current = snapshot;
          }}
          disabled={pending || waiting}
          aria-busy={waiting}
        >
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
