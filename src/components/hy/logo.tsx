// Logo de hylistats (T09, propuesta A «Sello 1º»): el sello dorado de los cromos ganados con el
// 1 de la victoria. Mismo dibujo que el favicon (`src/app/icon.svg`). Decorativo: va siempre junto
// al rótulo «hylistats», que es el nombre accesible.

export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
    >
      <polygon
        points="16.00,1.00 18.06,2.96 20.64,1.73 21.99,4.24 24.82,3.86 25.33,6.67 28.14,7.18 27.76,10.01 30.27,11.36 29.04,13.94 31.00,16.00 29.04,18.06 30.27,20.64 27.76,21.99 28.14,24.82 25.33,25.33 24.82,28.14 21.99,27.76 20.64,30.27 18.06,29.04 16.00,31.00 13.94,29.04 11.36,30.27 10.01,27.76 7.18,28.14 6.67,25.33 3.86,24.82 4.24,21.99 1.73,20.64 2.96,18.06 1.00,16.00 2.96,13.94 1.73,11.36 4.24,10.01 3.86,7.18 6.67,6.67 7.18,3.86 10.01,4.24 11.36,1.73 13.94,2.96"
        fill="var(--place-1)"
      />
      <circle
        cx="16"
        cy="16"
        r="10.2"
        fill="none"
        stroke="var(--background)"
        strokeWidth="1.4"
      />
      <path
        d="M17.6 9.2V22.8H14.6V13.4L12 14.5V11.8L15.9 9.2Z"
        fill="var(--background)"
      />
    </svg>
  );
}
