import "server-only";

import type { Fase, Intencion } from "@/domain/session";
import type { LlmToolChoice } from "@/server/llm/port";

import { NOMBRE_TOOL } from "./tools";

// Política de fases (ARCHITECTURE §9, ADR-0007): para cada fase, si el modelo
// tiene que registrar el requerimiento y la instrucción que se le inyecta. La
// fase misma la deriva `derivarFase`; el modelo decide qué hacer dentro de ella.

export type PoliticaDeTurno = {
  toolChoice: LlmToolChoice;
  instruccionDeFase: string;
};

const FORZADA: LlmToolChoice = { name: NOMBRE_TOOL };

export const INSTRUCCIONES = {
  delimitar:
    "Todavía no hay propuesta. Si ya conocés la decisión, las entidades, el período y la sospecha, registrá el requerimiento. Si no, preguntá como máximo dos de las cosas que faltan.",
  proponer:
    "Ya hubo suficientes preguntas. Registrá ahora el requerimiento con lo que sabés: usá null para lo desconocido, agregá lo pendiente a preguntas_abiertas y marcá faltan_datos.",
  pedir:
    "Hay una propuesta a la que le faltan datos (ver motivos). Preguntá como máximo dos cosas que los resuelvan. Cuando una respuesta cambie el requerimiento, registrá una versión nueva.",
  pedirCierre:
    "La propuesta lleva varios turnos sin completarse. No hagas más preguntas: reducí el alcance a lo que se puede verificar o mové lo no resuelto a preguntas_abiertas, y registrá la versión.",
  confirmar:
    "La propuesta está completa. Invitá al usuario a revisarla en el panel y confirmarla. No hagas preguntas nuevas. Registrá una versión nueva solo si el usuario pide un ajuste.",
  ajuste:
    "El usuario quiere ajustar la versión vigente. Si el ajuste es claro, registrá la versión nueva. Si es ambiguo, hacé una sola pregunta.",
} as const;

export function politicaDeTurno(
  fase: Exclude<Fase, "confirmado">,
  cierre: boolean,
  intencion: Intencion,
): PoliticaDeTurno {
  const base: PoliticaDeTurno = (() => {
    switch (fase) {
      case "delimitar":
        return {
          toolChoice: "auto",
          instruccionDeFase: INSTRUCCIONES.delimitar,
        };
      case "proponer":
        return {
          toolChoice: FORZADA,
          instruccionDeFase: INSTRUCCIONES.proponer,
        };
      case "pedir":
        return cierre
          ? {
              toolChoice: FORZADA,
              instruccionDeFase: INSTRUCCIONES.pedirCierre,
            }
          : { toolChoice: "auto", instruccionDeFase: INSTRUCCIONES.pedir };
      case "confirmar":
        return {
          toolChoice: "auto",
          instruccionDeFase: INSTRUCCIONES.confirmar,
        };
    }
  })();

  // El ajuste agrega una instrucción y no cambia el toolChoice.
  return intencion === "ajuste"
    ? {
        ...base,
        instruccionDeFase: `${base.instruccionDeFase} ${INSTRUCCIONES.ajuste}`,
      }
    : base;
}
