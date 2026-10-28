import type { DepsDelAcceso } from "@/server/http/access-handler";
import type { DepsDelTurno } from "@/server/http/interview-handler";
import { CONFIG_POR_DEFECTO } from "@/server/interview";
import { FakeLlmClient, type Guion } from "@/server/llm/fake/client";
import { crearLogger } from "@/server/observability/logger";
import { crearLimitadorEnMemoria } from "@/server/security/rate-limit/memory";
import { reglasDeLimite } from "@/server/security/rate-limit/port";
import { emitirSesion, NOMBRE_COOKIE } from "@/server/security/session-cookie";

// Dependencias y requests para los tests de los handlers HTTP. Los nombres de
// las variables evitan palabras como "secret" o "key" a propósito: gitleaks
// marca como secreto cualquier valor asignado a ellas.

export const HOST = "https://trama.test";
export const CODIGO = "codigo-de-prueba-123";
export const FIRMA = "f".repeat(48); // SESSION_SECRET de prueba
/** Valor que no puede aparecer en ninguna respuesta ni línea de log. */
export const CENTINELA = "centinela-0f9a3c7e5b";

export function unReloj(inicio = Date.parse("2026-10-28T12:00:00.000Z")) {
  let ahora = inicio;
  return {
    now: () => ahora,
    avanzar: (ms: number) => {
      ahora += ms;
    },
  };
}

export function armarDeps({
  guion = [],
  limites = { sesion: 50, ip: 60, global: 1000 },
  reloj = unReloj(),
}: {
  guion?: Guion;
  limites?: { sesion: number; ip: number; global: number };
  reloj?: ReturnType<typeof unReloj>;
} = {}) {
  const logs: string[] = [];
  const logger = crearLogger((linea) => logs.push(linea), reloj);
  const limitador = crearLimitadorEnMemoria(reloj);
  const reglas = reglasDeLimite(limites);
  const fake = new FakeLlmClient(guion);

  const turno: DepsDelTurno = {
    secretoDeSesion: FIRMA,
    limitador,
    reglas,
    logger,
    clock: reloj,
    interview: { llm: fake, clock: reloj, logger, config: CONFIG_POR_DEFECTO },
  };
  const acceso: DepsDelAcceso = {
    codigo: CODIGO,
    secretoDeSesion: FIRMA,
    limitador,
    reglas,
    logger,
    clock: reloj,
    cookieSegura: true,
  };
  return { turno, acceso, logs, fake, reloj };
}

export const cookieDeSesion = (ahora: number, id?: string) =>
  `${NOMBRE_COOKIE}=${emitirSesion(FIRMA, ahora, id).valor}`;

export function unPost(
  ruta: string,
  cuerpo: unknown,
  {
    cookie,
    origen = HOST,
    ip = "203.0.113.7",
    cabeceras = {},
  }: {
    cookie?: string;
    origen?: string | null;
    ip?: string;
    cabeceras?: Record<string, string>;
  } = {},
): Request {
  return new Request(`${HOST}${ruta}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": ip,
      ...(origen ? { origin: origen } : {}),
      ...(cookie ? { cookie } : {}),
      ...cabeceras,
    },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
}
