"use client";

import { useEffect, useState } from "react";

/** "45 s", "3 min", "2 h 5 min": cuánto falta para poder reintentar. */
export function formatearEspera(ms: number): string {
  const segundos = Math.ceil(ms / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.ceil(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto > 0 ? `${horas} h ${resto} min` : `${horas} h`;
}

/** Milisegundos que faltan hasta `hasta` (0 si ya pasó o es null), actualizado cada segundo. */
export function useCuentaRegresiva(hasta: number | null): number {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (hasta === null) return;
    const id = setInterval(() => {
      const instante = Date.now();
      setAhora(instante);
      if (instante >= hasta) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [hasta]);

  return hasta === null ? 0 : Math.max(0, hasta - ahora);
}
