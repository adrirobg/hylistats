import { Skeleton } from "@/components/ui/skeleton";
import { Cabin } from "./cabin";
import { TopBar } from "./top-bar";

// Esqueleto de la navegación al perfil (brief §5): el layout final con huecos, nunca un spinner
// a pantalla completa. Usa `Cabin`, así que header, barra, pestañas, cuadrícula y raíl tienen la
// forma (y los rangos responsive) de la página real.
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col" aria-busy="true">
      <TopBar />
      <Cabin
        header={
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-line bg-surface-1 px-5 py-3.5 @max-[640px]:px-3.5 @max-[640px]:py-2.5">
            <div className="flex items-center gap-3.5">
              <Skeleton className="size-11 rounded-lg @max-[640px]:size-9" />
              <div className="grid gap-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="flex items-center gap-3.5">
              <Skeleton className="h-9 w-36 @max-[640px]:hidden" />
              <Skeleton className="h-10 w-32 @max-[640px]:w-10" />
            </div>
          </div>
        }
        god={
          <>
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3.5 w-full" />
          </>
        }
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
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </>
        }
      />
    </main>
  );
}
