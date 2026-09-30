import { cn } from "@/lib/utils";
import { TabLink } from "./tab-link";
import { SmallSampleBadge, TeammateName } from "./teammate-parts";
import type { RailTeammate } from "./teammates-view";

// Caja «Compañeros» del raíl (brief §3.2, `.mates` de la maqueta): los que más partidas han jugado
// contigo, en filas compactas (nombre, partidas, % 1º y puesto medio), y el enlace a la pestaña.
// Componente de servidor: solo enlaza; la ★ de favoritos vive en la tabla de la pestaña.

// Columnas fijas para que las cifras de todas las filas queden alineadas (el nombre absorbe el resto).
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_1.75rem] items-baseline gap-x-2";
const VALUE = "num text-right font-mono text-[13px]";

export function RailTeammates({ teammates }: { teammates: RailTeammate[] }) {
  if (teammates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay partidas: aquí aparecerán los compañeros con más partidas
        juntos.
      </p>
    );
  }
  return (
    <>
      <ul
        aria-label="Compañeros con más partidas juntos"
        className="grid gap-2"
      >
        {/* Los rótulos de las columnas son solo visuales: para lectores van dentro de cada cifra. */}
        <li aria-hidden="true" className={cn(COLUMNS, "text-xs text-faint")}>
          <span />
          <span />
          <span className="text-right">% 1º</span>
          <span className="text-right">medio</span>
        </li>
        {teammates.map((t) => {
          const tone = t.small ? "text-faint" : "text-muted-foreground";
          return (
            <li key={t.key} className={cn(COLUMNS, "text-sm")}>
              <span className="min-w-0">
                <TeammateName
                  gameName={t.gameName}
                  tagLine={t.tagLine}
                  href={t.href}
                  className="block"
                />
                {t.small && <SmallSampleBadge className="block" />}
              </span>
              <span className={cn(VALUE, tone)}>{t.games} p</span>
              <span className={cn(VALUE, tone)}>
                <span className="sr-only">% 1º </span>
                {t.pct1}
              </span>
              <span className={cn(VALUE, tone)}>
                <span className="sr-only">Puesto medio </span>
                {t.medio}
              </span>
            </li>
          );
        })}
      </ul>
      <TabLink
        tab="companeros"
        label="Ver todos los compañeros"
        className="mt-2.5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        Ver todos <span aria-hidden="true">→</span>
      </TabLink>
    </>
  );
}
