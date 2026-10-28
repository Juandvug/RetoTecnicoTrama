import "server-only";

// Puerto RateLimiter (ADR-0005): en producción, Upstash Redis; en desarrollo y
// tests, memoria. Cada regla es una ventana deslizante con su propio límite.

export type ReglaDeLimite = {
  nombre: string; // también separa las claves en el almacén
  limite: number;
  ventanaMs: number;
};

export type ResultadoDeLimite = {
  permitido: boolean;
  restantes: number;
  /** Cuánto falta para que se libere un lugar; 0 si está permitido. */
  reintentarEnMs: number;
};

export interface RateLimiter {
  consumir(clave: string, regla: ReglaDeLimite): Promise<ResultadoDeLimite>;
}

const HORA = 60 * 60 * 1000;

/** Reglas de ADR-0005, con los límites de la configuración. */
export function reglasDeLimite(limites: {
  sesion: number;
  ip: number;
  global: number;
}) {
  return {
    sesion: { nombre: "sesion", limite: limites.sesion, ventanaMs: 24 * HORA },
    ip: { nombre: "ip", limite: limites.ip, ventanaMs: HORA },
    global: { nombre: "global", limite: limites.global, ventanaMs: 24 * HORA },
    acceso: { nombre: "acceso", limite: 5, ventanaMs: 10 * 60 * 1000 },
  } satisfies Record<string, ReglaDeLimite>;
}

export type ReglasDeLimite = ReturnType<typeof reglasDeLimite>;
