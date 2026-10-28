import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  conDemora,
  falla,
  llamada,
  rechazo,
  texto,
  truncada,
  type PasoFake,
} from "./client";

// Escenarios del e2e: un archivo JSON con la lista de respuestas que el fake
// devuelve, en orden, una por llamada al modelo. Viven en
// tests/fixtures/scenarios para que src/ no contenga datos de ningún dominio.

export const DIRECTORIO_DE_ESCENARIOS = "tests/fixtures/scenarios";

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
      kind: z.enum([
        "timeout",
        "rate_limited",
        "quota_exceeded",
        "unavailable",
        "auth",
        "bad_request",
        "aborted",
        "unknown",
      ]),
      retryAfterMs: z.int().positive().optional(),
    }),
    ...Demora,
  }),
]);

export const EscenarioSchema = z.array(PasoJsonSchema).min(1);

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

export function parsearEscenario(json: unknown): PasoFake[] {
  return EscenarioSchema.parse(json).map(aPaso);
}

/** Carga `<directorio>/<nombre>.json`. El nombre no puede salirse del directorio. */
export function cargarEscenario(
  nombre: string,
  directorio = path.resolve(process.cwd(), DIRECTORIO_DE_ESCENARIOS),
): PasoFake[] {
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
