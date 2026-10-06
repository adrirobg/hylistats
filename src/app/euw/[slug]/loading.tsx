import { Skeleton } from "@/components/ui/skeleton";
import { Cabin } from "./cabin";
import { TopBar } from "./top-bar";
import { TrophyCard, TrophyGrid } from "./vitrina-ui";

// Esqueleto de la navegación al perfil (brief §5): el layout final con huecos, nunca un spinner
// a pantalla completa. Usa `Cabin` y las piezas de la vitrina (`TrophyGrid`, `TrophyCard`), así que
// banner, trofeos, pestañas, cuadrícula y raíl tienen la forma (y los rangos responsive) de la
// página real (revisión v4): identidad en dos líneas (nombre y liga), El grupo hoy y Dios de Arena,
// y los Títulos, como un miembro (el caso de uso del grupo): en un no miembro la página llega más
// corta.
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col" aria-busy="true">
      <TopBar />
      <Cabin
        header={
          <div className="relative bg-[linear-gradient(180deg,var(--surface-1),var(--cabin))] px-5 pt-[18px] pb-4 @max-[900px]:pt-16 @max-[640px]:px-3 @max-[640px]:pt-[54px] @max-[640px]:pb-3">
            <div className="absolute top-3 right-4 flex items-center gap-3.5 @max-[640px]:top-2 @max-[640px]:right-2.5">
              <Skeleton className="h-9 w-36 @max-[640px]:hidden" />
              <Skeleton className="h-10 w-32 @max-[640px]:w-10" />
              <Skeleton className="size-10" />
            </div>
            <div className="flex items-center gap-4 @max-[640px]:gap-3">
              <Skeleton className="size-16 rounded-full @max-[640px]:size-[52px]" />
              <div className="grid gap-1.5">
                <Skeleton className="h-11 w-72 max-w-full @max-[640px]:h-7 @max-[640px]:w-44" />
                <Skeleton className="h-[26px] w-80 max-w-full @max-[640px]:w-56" />
              </div>
            </div>
            <TrophyGrid>
              <TrophyCard>
                <div className="grid gap-2.5">
                  <Skeleton className="h-3 w-28" />
                  {Array.from({ length: 6 }, (_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
                    <Skeleton key={i} className="h-6" />
                  ))}
                </div>
              </TrophyCard>
              <TrophyCard>
                <div className="grid gap-2.5">
                  <Skeleton className="h-3 w-28" />
                  <div className="flex items-center gap-3.5">
                    <Skeleton className="size-[78px] rounded-full @max-[640px]:size-11" />
                    <Skeleton className="h-[50px] w-36 @max-[640px]:h-[30px]" />
                  </div>
                  <Skeleton className="h-4 w-40 @max-[640px]:hidden" />
                </div>
              </TrophyCard>
            </TrophyGrid>
          </div>
        }
        group={
          <div className="grid content-start gap-2.5 px-5 pt-3.5 pb-4 @max-[640px]:p-3">
            <Skeleton className="h-3 w-20" />
            <div className="grid grid-cols-2 items-start gap-1.5 @max-[1000px]:grid-cols-1 @max-[640px]:gap-1">
              {Array.from({ length: 4 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
                <Skeleton key={i} className="h-[60px] @max-[640px]:h-12" />
              ))}
            </div>
          </div>
        }
        strip={<Skeleton className="h-10 w-full" />}
        tabs={
          <div className="mb-4 flex border-b border-line py-3.5">
            <Skeleton className="h-5 w-24" />
          </div>
        }
        main={
          <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2.5 gap-y-3">
            {Array.from({ length: 24 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        }
        rail={
          <>
            {/* El marcador del raíl solo existe a partir de 1100 px (por debajo, la franja). */}
            <Skeleton className="h-32 @max-[1100px]:hidden" />
            <Skeleton className="h-24" />
          </>
        }
      />
    </main>
  );
}
