import "server-only";

import type { CampoDeLog, Logger } from "@/server/interview";
import type { CampoDeTelemetria, Telemetria } from "@/server/llm/telemetry";

// Logger estructurado con lista blanca (ARCHITECTURE §12, ADR-0005). Solo
// escribe los campos permitidos y solo valores escalares: nunca el contenido de
// los mensajes, el requerimiento, cabeceras ni variables de entorno. Un campo
// que no está en la lista se descarta en silencio, así que agregar contenido a
// un log por error no lo filtra.

export const CAMPOS_PERMITIDOS = new Set([
  "turnId",
  "sesion", // hash del id de sesión
  "fase",
  "cierre",
  "promptVersion",
  "llamadas",
  "reparaciones",
  "latenciaMs",
  "tokensEntrada",
  "tokensSalida",
  "resultado",
  "completitudEfectiva",
  "guardaCifras",
  "finishReason",
  "reintentable",
  "kind",
  "codigos",
  "status",
  "code",
  "regla",
  "backend",
]);

/** Ningún valor de texto se escribe entero: acota lo que un error podría filtrar. */
const LARGO_MAXIMO = 80;

export type Sink = (linea: string) => void;

export type LoggerDelServidor = Logger &
  Telemetria & {
    error(evento: string, campos?: Record<string, CampoDeLog>): void;
  };

function filtrar(campos: Record<string, CampoDeLog | CampoDeTelemetria> = {}) {
  const permitidos: Record<string, CampoDeLog> = {};
  for (const [clave, valor] of Object.entries(campos)) {
    if (!CAMPOS_PERMITIDOS.has(clave)) continue;
    if (
      valor === null ||
      typeof valor === "number" ||
      typeof valor === "boolean"
    ) {
      permitidos[clave] = valor;
    } else if (typeof valor === "string") {
      permitidos[clave] = valor.slice(0, LARGO_MAXIMO);
    }
  }
  return permitidos;
}

export function crearLogger(
  sink: Sink = (linea) => console.log(linea),
  clock: { now(): number } = { now: () => Date.now() },
): LoggerDelServidor {
  const escribir = (
    nivel: string,
    evento: string,
    campos?: Record<string, CampoDeLog>,
  ) => {
    sink(
      JSON.stringify({
        nivel,
        evento: evento.slice(0, LARGO_MAXIMO),
        en: new Date(clock.now()).toISOString(),
        ...filtrar(campos),
      }),
    );
  };

  return {
    info: (evento, campos) => escribir("info", evento, campos),
    warn: (evento, campos) => escribir("warn", evento, campos),
    error: (evento, campos) => escribir("error", evento, campos),
    registrar: ({ evento, ...campos }) =>
      escribir("info", typeof evento === "string" ? evento : "llm", campos),
  };
}
