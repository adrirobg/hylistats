"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef } from "react";
import {
  PROFILE_TABS,
  type ProfileTab,
  panelId,
  TAB_LABEL,
  tabForKey,
  tabHref,
  tabId,
} from "./view-model";

// Barra de pestañas del perfil (brief §2 y §3.2). Cada pestaña es un enlace (`?tab`) que navega sin
// recargar la página y sin saltar arriba (`scroll={false}`); el servidor lee el `?tab` y carga solo
// los datos de esa pestaña. Los enlaces se calculan con la URL del momento (`useSearchParams`): al
// cambiar de pestaña se quitan los filtros de la anterior y se conserva el resto (`?campeon`…).
//
// Patrón WAI-ARIA de pestañas con activación manual: solo la activa entra en el orden de tabulación
// (roving tabindex), las flechas mueven el foco entre pestañas y Enter (nativo en un enlace) o
// Espacio la activan.

export function Tabs({ active }: { active: ProfileTab }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const listRef = useRef<HTMLDivElement>(null);

  // En un contenedor estrecho las cuatro pestañas no caben y la barra se desplaza: se centra la
  // activa para que se vea (al abrir `?tab=partidas` por URL directa, por ejemplo). Se mueve el
  // scroll de la barra, no `scrollIntoView`, que también desplazaría la página.
  useEffect(() => {
    const list = listRef.current;
    const tab = document.getElementById(tabId(active));
    if (!list || !tab) return;
    const offset =
      tab.getBoundingClientRect().left -
      list.getBoundingClientRect().left +
      list.scrollLeft;
    list.scrollLeft = offset - (list.clientWidth - tab.offsetWidth) / 2;
  }, [active]);

  function onKeyDown(event: KeyboardEvent<HTMLAnchorElement>, tab: ProfileTab) {
    // Un enlace solo responde a Enter: el Espacio de una pestaña también activa.
    if (event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
      return;
    }
    const next = tabForKey(tab, event.key);
    if (next === null) return;
    event.preventDefault();
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Secciones del perfil"
      className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
    >
      {PROFILE_TABS.map((tab) => (
        <Link
          key={tab}
          role="tab"
          id={tabId(tab)}
          href={tabHref(pathname, search, tab)}
          scroll={false}
          aria-selected={tab === active}
          aria-controls={panelId(tab)}
          tabIndex={tab === active ? 0 : -1}
          onKeyDown={(event) => onKeyDown(event, tab)}
          // El foco va por dentro (`-outline-offset-2`): la barra recorta lo que sobresale.
          className="px-3 pt-3.5 pb-3 font-medium whitespace-nowrap text-muted-foreground -outline-offset-2 hover:text-foreground aria-selected:text-foreground aria-selected:shadow-[inset_0_-2px_0_var(--place-1)]"
        >
          {TAB_LABEL[tab]}
        </Link>
      ))}
    </div>
  );
}
