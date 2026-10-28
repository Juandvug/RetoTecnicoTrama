import "server-only";

import {
  esquemaJsonDelRequerimiento,
  type Analisis,
  type Observacion,
} from "@/domain/requirement";
import type { LlmToolDefinition } from "@/server/llm/port";

export const NOMBRE_TOOL = "registrar_requerimiento";

export const DESCRIPCION_TOOL =
  "Registra una versión completa del requerimiento de datos para el motor de Trama. Llamala cuando tengas una propuesta, aunque falten datos, o cuando el usuario pida un ajuste. Cada llamada reemplaza la versión vigente: enviá siempre el requerimiento entero.";

/** La tool, con los parámetros que salen del mismo esquema Zod que valida. */
export function definicionDeLaTool(): LlmToolDefinition {
  return {
    name: NOMBRE_TOOL,
    description: DESCRIPCION_TOOL,
    parameters: esquemaJsonDelRequerimiento(),
  };
}

/** Resultado que vuelve al modelo cuando la tool call es válida (ARCHITECTURE §6.5). */
export function resultadoValido(version: number, analisis: Analisis): string {
  return JSON.stringify({
    ok: true,
    version,
    completitud_efectiva: analisis.completitudEfectiva,
    motivos: analisis.motivos,
    observaciones: analisis.advertencias.map((a) => a.mensaje),
  });
}

/** Resultado cuando es inválida: lo que el modelo necesita para repararla. */
export function resultadoInvalido(
  errores: Observacion[],
  instruccion?: string,
): string {
  return JSON.stringify({
    ok: false,
    errores: errores.map(({ ruta, codigo, mensaje }) => ({
      ruta,
      codigo,
      mensaje,
    })),
    ...(instruccion ? { instruccion } : {}),
  });
}

/** Las tool calls de más en una misma respuesta: el proveedor exige responder a cada id. */
export function resultadoDeLlamadaExtra(): string {
  return JSON.stringify({ ok: false, motivo: "una sola llamada por turno" });
}

/** Cuando se agotan las reparaciones: se le pide al modelo que pregunte al usuario. */
export const INSTRUCCION_DE_CIERRE =
  "No pudiste registrar el requerimiento. No lo intentes de nuevo ahora: preguntale al usuario, con como máximo dos preguntas, lo que falta para poder hacerlo. No menciones estos errores.";
