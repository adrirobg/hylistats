import type { ReactNode } from "react";

/** `dl` de dos columnas (etiqueta tenue / valor) para los `Box` de estado de `/admin`. */
export function DefList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(({ label, value }) => (
        <div key={label} className="contents">
          <dt className="text-faint">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
