"use client";

import { useEffect, useState } from "react";

/**
 * Reloj en ms para textos relativos ("hace 5 min"). `initial` es la hora del servidor: el primer
 * render (servidor e hidratación) usa el mismo valor y el HTML coincide; al montar salta a la
 * hora del navegador y se actualiza cada `everyMs` (30 s por defecto).
 */
export function useNow(initial: number, everyMs = 30_000): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
