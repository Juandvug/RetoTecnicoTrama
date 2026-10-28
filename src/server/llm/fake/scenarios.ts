import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { LlmRequest } from "@/server/llm/port";

import {
  conDemora,
  falla,
  llamada,
  rechazo,
  texto,
  truncada,
  type Guion,
  type PasoFake,
} from "./client";

// Escenarios del e2e. Viven en tests/fixtures/scenarios para que src/ no
// contenga datos de ningún dominio. Un archivo JSON tiene una de dos formas:
//
// - Secuencial: la lista de respuestas que el fake devuelve, en orden, una por
//   llamada al modelo. La comparte todo el proceso.
// - Conversacional: { turnos, porDefecto }. Cada turno elige sus pasos por un
//   fragmento del último mensaje del usuario (`cuando`), y el paso dentro del
//   turno es la cantidad de respuestas del asistente que ya hay después de ese
//   mensaje. No depende del orden de las requests, así que varios tests pueden
//   compartir un servidor.

export const DIRECTORIO_DE_ESCENARIOS = "tests/fixtures/scenarios";

const KindSchema = z.enum([
  "timeout",
  "rate_limited",
  "quota_exceeded",
  "unavailable",
  "auth",
  "bad_request",
  "aborted",
  "unknown",
]);

const Demora = { demoraMs: z.int().positive().optional() };

const PasoJsonSchema = z.union([
  z.strictObject({ texto: z.string(), ...Demora }),
  z.strictObject({
    llamada: z.strictObject({
      nombre: z.string(),
      argumentos: z.union([z.string(), z.record(z.string(), z.unknown())]),
    }),
    ...Demora,
  }),
  z.strictObject({ rechazo: z.string(), ...Demora }),
  z.strictObject({
    truncada: z.strictObject({
      parcial: z.string(),
      comoLlamada: z.string().optional(),
    }),
    ...Demora,
  }),
  z.strictObject({
    error: z.strictObject({
      kind: KindSchema,
      retryAfterMs: z.int().positive().optional(),
    }),
    ...Demora,
  }),
]);

const TurnoJsonSchema = z.strictObject({
  /** Fragmento del último mensaje del usuario, sin distinguir mayúsculas. */
  cuando: z.string().min(1),
  /**
   * Antes del primer paso, el fake falla `veces` intentos con ese error, una
   * sola vez por texto exacto del mensaje. Cuenta intentos de transporte: con
   * los 2 reintentos de withRetry, 3 fallas hacen fallar el turno.
   */
  fallasAntes: z
    .strictObject({ kind: KindSchema, veces: z.int().positive() })
    .optional(),
  pasos: z.array(PasoJsonSchema).min(1),
});

const ConversacionJsonSchema = z.strictObject({
  turnos: z.array(TurnoJsonSchema).min(1),
  /** Para un mensaje que no coincide con ningún turno. */
  porDefecto: z.array(PasoJsonSchema).min(1),
});

export const EscenarioSchema = z.union([
  z.array(PasoJsonSchema).min(1),
  ConversacionJsonSchema,
]);

function aPaso(paso: z.infer<typeof PasoJsonSchema>): PasoFake {
  let resultado: PasoFake;
  if ("texto" in paso) resultado = texto(paso.texto);
  else if ("llamada" in paso)
    resultado = llamada(paso.llamada.nombre, paso.llamada.argumentos);
  else if ("rechazo" in paso) resultado = rechazo(paso.rechazo);
  else if ("truncada" in paso)
    resultado = truncada(paso.truncada.parcial, paso.truncada.comoLlamada);
  else resultado = falla(paso.error.kind, paso.error.retryAfterMs);
  return paso.demoraMs ? conDemora(paso.demoraMs, resultado) : resultado;
}

/** El último mensaje del usuario y cuántas respuestas del asistente lo siguen. */
function posicionEnElTurno(request: LlmRequest) {
  const indice = request.messages.findLastIndex((m) => m.role === "user");
  const ultimo = request.messages[indice];
  return {
    mensaje: ultimo?.role === "user" ? ultimo.content : "",
    paso: request.messages
      .slice(indice + 1)
      .filter((m) => m.role === "assistant").length,
  };
}

function guionConversacional(
  conversacion: z.infer<typeof ConversacionJsonSchema>,
): Guion {
  const turnos = conversacion.turnos.map((t) => ({
    cuando: t.cuando.toLowerCase(),
    fallasAntes: t.fallasAntes,
    pasos: t.pasos.map(aPaso),
  }));
  const porDefecto = conversacion.porDefecto.map(aPaso);
  const fallasServidas = new Map<string, number>();

  return (request) => {
    const { mensaje, paso } = posicionEnElTurno(request);
    const turno = turnos.find((t) => mensaje.toLowerCase().includes(t.cuando));

    if (turno?.fallasAntes && paso === 0) {
      const servidas = fallasServidas.get(mensaje) ?? 0;
      if (servidas < turno.fallasAntes.veces) {
        fallasServidas.set(mensaje, servidas + 1);
        return falla(turno.fallasAntes.kind);
      }
    }
    // Pasado el último paso, se repite: un turno que se reintenta o una
    // reparación inesperada no dejan al fake sin respuesta.
    const pasos = turno?.pasos ?? porDefecto;
    return pasos[Math.min(paso, pasos.length - 1)]!;
  };
}

export function parsearEscenario(json: unknown): Guion {
  const escenario = EscenarioSchema.parse(json);
  return Array.isArray(escenario)
    ? escenario.map(aPaso)
    : guionConversacional(escenario);
}

/** Carga `<directorio>/<nombre>.json`. El nombre no puede salirse del directorio. */
export function cargarEscenario(
  nombre: string,
  directorio = path.resolve(process.cwd(), DIRECTORIO_DE_ESCENARIOS),
): Guion {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nombre)) {
    throw new Error(
      `Nombre de escenario inválido: "${nombre}". Usá minúsculas, números y guiones.`,
    );
  }
  const archivo = path.join(directorio, `${nombre}.json`);
  let crudo: string;
  try {
    crudo = readFileSync(archivo, "utf8");
  } catch {
    throw new Error(`No existe el escenario "${nombre}" (${archivo}).`);
  }
  try {
    return parsearEscenario(JSON.parse(crudo));
  } catch (error) {
    throw new Error(
      `El escenario "${nombre}" no es válido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
