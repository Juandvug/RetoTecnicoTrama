import type { JsonSchema } from "@/server/llm/port";

// Lleva un JSON Schema al subconjunto del modo estricto de OpenAI (ADR-0002):
// todo objeto cierra sus propiedades (`additionalProperties: false`) y las
// declara todas en `required`. Las restricciones de largo, cantidad y patrón
// se conservan: así el modelo conoce los límites y no hace falta reparar lo que
// los excede (se comprobó con gpt-5-mini en F9). Se quitan las palabras clave
// que no se verificaron; Zod las sigue aplicando en el dominio. No muta el
// esquema recibido.

const NO_SOPORTADAS: ReadonlySet<string> = new Set([
  "$schema",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "uniqueItems",
  "default",
]);

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function adaptar(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(adaptar);
  if (!esObjeto(nodo)) return nodo;

  const resultado: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(nodo)) {
    if (NO_SOPORTADAS.has(clave)) continue;
    if (clave === "properties" && esObjeto(valor)) {
      resultado[clave] = Object.fromEntries(
        Object.entries(valor).map(([nombre, hijo]) => [nombre, adaptar(hijo)]),
      );
    } else if (clave === "$defs" && esObjeto(valor)) {
      resultado[clave] = Object.fromEntries(
        Object.entries(valor).map(([nombre, hijo]) => [nombre, adaptar(hijo)]),
      );
    } else if (clave === "enum" || clave === "const") {
      resultado[clave] = valor;
    } else {
      resultado[clave] = adaptar(valor);
    }
  }

  if (esObjeto(resultado.properties)) {
    resultado.additionalProperties = false;
    resultado.required = Object.keys(resultado.properties);
  }
  return resultado;
}

export function adaptarEsquemaEstricto(esquema: JsonSchema): JsonSchema {
  return adaptar(esquema) as JsonSchema;
}
