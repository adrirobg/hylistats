"use client";

import { Star, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import type { LocalState } from "@/lib/local-store";
import { normalizeRiotId, profileSlug, type RiotId } from "@/lib/riot-id";
import {
  localActions,
  useLocalReady,
  useLocalStore,
} from "@/lib/use-local-store";
import { cn } from "@/lib/utils";

type Tab = "recientes" | "favoritos";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "recientes", label: "Recientes" },
  { id: "favoritos", label: "Favoritos" },
];

const selectRecents = (state: LocalState) => state.recents;
const selectFavorites = (state: LocalState) => state.favorites;

/**
 * Recientes | Favoritos de la landing (`.recent` de la maqueta). Los datos son del navegador: el
 * servidor y la hidratación ven el estado vacío, así que hasta `useLocalReady()` se pintan
 * esqueletos en vez de «vacío» (que a alguien con datos le mentiría un instante).
 */
export function ProfileLists() {
  const [tab, setTab] = useState<Tab>("recientes");
  const ready = useLocalReady();
  const recents = useLocalStore(selectRecents);
  const favorites = useLocalStore(selectFavorites);

  return (
    <section className="grid gap-2.5" aria-label="Perfiles guardados">
      <div className="inline-flex w-fit overflow-hidden rounded-[6px] border border-line">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            // El contorno de foco va hacia dentro: el contenedor recorta (`overflow-hidden`).
            className="cursor-pointer border-r border-line bg-surface-1 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground last:border-r-0 focus-visible:-outline-offset-2 aria-pressed:bg-surface-2 aria-pressed:text-foreground aria-pressed:shadow-[inset_0_-2px_0_var(--place-1)]"
          >
            {label}
          </button>
        ))}
      </div>
      {ready ? (
        <Rows tab={tab} recents={recents} favorites={favorites} />
      ) : (
        <div aria-busy="true" className="grid gap-1.5">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      )}
    </section>
  );
}

function Rows({
  tab,
  recents,
  favorites,
}: {
  tab: Tab;
  recents: LocalState["recents"];
  favorites: LocalState["favorites"];
}) {
  // Solo se pinta con los datos ya leídos del navegador (nunca en el servidor): `Date.now()` no
  // puede desajustar la hidratación.
  const now = Date.now();
  const favoriteKeys = new Set(
    favorites.map((f) => normalizeRiotId(f.gameName, f.tagLine)),
  );

  if (tab === "recientes") {
    if (recents.length === 0) {
      return (
        <Empty>
          Aún no has visitado ningún perfil. Busca un Riot ID arriba y aparecerá
          aquí.
        </Empty>
      );
    }
    return (
      <ul className="grid gap-1.5">
        {recents.map((r) => (
          <Row
            key={normalizeRiotId(r.gameName, r.tagLine)}
            riotId={r}
            favorite={favoriteKeys.has(normalizeRiotId(r.gameName, r.tagLine))}
            time={formatRelative(r.visitedAt, now)}
            onRemove={() => localActions.removeRecent(r)}
          />
        ))}
      </ul>
    );
  }

  if (favorites.length === 0) {
    return (
      <Empty>
        Aún no tienes favoritos. Marca perfiles con ★ y los tendrás aquí.
      </Empty>
    );
  }
  return (
    <ul className="grid gap-1.5">
      {favorites.map((f) => (
        <Row
          key={normalizeRiotId(f.gameName, f.tagLine)}
          riotId={f}
          favorite
          time={`añadido ${formatRelative(f.addedAt, now)}`}
        />
      ))}
    </ul>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-[6px] bg-surface-1 px-3 py-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Fila: ★ (conmuta favorito), Riot ID enlazado, tiempo y, si se pasa `onRemove`, ✕. */
function Row({
  riotId,
  favorite,
  time,
  onRemove,
}: {
  riotId: RiotId;
  favorite: boolean;
  time: string;
  onRemove?: () => void;
}) {
  const label = `${riotId.gameName}#${riotId.tagLine}`;
  return (
    <li className="flex items-center gap-1 rounded-[6px] bg-surface-1 p-1 text-sm">
      <button
        type="button"
        onClick={() => localActions.toggleFavorite(riotId)}
        aria-label={
          favorite
            ? `Quitar de favoritos: ${label}`
            : `Añadir a favoritos: ${label}`
        }
        className={cn(
          "grid size-9 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-surface-2",
          favorite ? "text-place-1" : "text-faint hover:text-foreground",
        )}
      >
        <Star
          aria-hidden="true"
          size={18}
          fill={favorite ? "currentColor" : "none"}
        />
      </button>
      <Link
        // Sin prefetch: el perfil es dinámico y consulta la BD (y puede lanzar una sincronización).
        prefetch={false}
        href={`/euw/${profileSlug(riotId.gameName, riotId.tagLine)}`}
        className="min-w-0 flex-1 truncate py-2 hover:underline"
      >
        {riotId.gameName}
        <span className="text-faint">#{riotId.tagLine}</span>
      </Link>
      <span className="shrink-0 pl-1 text-faint">{time}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar de recientes: ${label}`}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-foreground"
        >
          <X aria-hidden="true" size={16} />
        </button>
      )}
    </li>
  );
}
