import { Skeleton } from "@/components/ui/skeleton";
import { Cabin } from "./cabin";
import { TopBar } from "./top-bar";
import { TrophyCard, TrophyGrid } from "./vitrina-ui";

// Esqueleto de la navegación al perfil (brief §5): el layout final con huecos, nunca un spinner
// a pantalla completa. Usa `Cabin` y las piezas de la vitrina (`TrophyGrid`, `TrophyCard`), así que
// banner, trofeos, pestañas, cuadrícula y raíl tienen la forma (y los rangos responsive) de la
// página real. Lleva el bloque Títulos + Escalera, como un miembro (el caso de uso del grupo): en
// un no miembro la página llega más corta.
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col" aria-busy="true">
      <TopBar />
      <Cabin
        header={
          <div className="relative bg-[linear-gradient(180deg,var(--surface-1),var(--cabin))] px-6 pt-6 @max-[900px]:pt-[68px] @max-[640px]:px-3.5 @max-[640px]:pt-[54px]">
            <div className="absolute top-3 right-4 flex items-center gap-3.5 @max-[640px]:top-2 @max-[640px]:right-2.5">
              <Skeleton className="h-9 w-36 @max-[640px]:hidden" />
              <Skeleton className="h-10 w-32 @max-[640px]:w-10" />
              <Skeleton className="size-10" />
            </div>
            <div className="flex items-center gap-5 @max-[640px]:gap-3.5">
              <Skeleton className="size-[72px] rounded-full @max-[640px]:size-[60px]" />
              <div className="grid gap-2.5">
                <Skeleton className="h-12 w-64 max-w-full @max-[640px]:h-[30px] @max-[640px]:w-44" />
                <Skeleton className="h-5 w-28" />
              </div>
            </div>
            <TrophyGrid>
              {Array.from({ length: 2 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
                <TrophyCard key={i}>
                  <div className="grid gap-3">
                    <Skeleton className="h-3 w-28" />
                    <div className="flex items-center gap-[18px]">
                      <Skeleton className="size-[118px] rounded-full @max-[640px]:size-[88px]" />
                      <Skeleton className="h-[66px] w-40 @max-[640px]:h-12" />
                    </div>
                    <Skeleton className="h-4 w-48" />
                  </div>
                </TrophyCard>
              ))}
            </TrophyGrid>
          </div>
        }
        group={
          <div className="grid grid-cols-[minmax(0,1fr)_300px] @max-[980px]:grid-cols-1">
            <div className="grid content-start gap-2.5 px-6 pt-[18px] pb-5 @max-[640px]:p-3.5">
              <Skeleton className="h-3 w-20" />
              {Array.from({ length: 3 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
            <div className="grid content-start gap-2 border-l border-line px-5 py-[18px] @max-[980px]:border-t @max-[980px]:border-l-0 @max-[640px]:p-3.5">
              <Skeleton className="h-3 w-32" />
              {Array.from({ length: 6 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de marcadores sin identidad propia.
                <Skeleton key={i} className="h-7" />
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
