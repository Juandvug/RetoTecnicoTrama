import { z } from "zod";

import { COMPLETITUD } from "./schema";

// Códigos de docs/ARCHITECTURE.md §6.3. La severidad es fija por código.
export const SEVERIDAD = {
  JSON_INVALIDO: "error",
  ESQUEMA_INVALIDO: "error",
  ID_DUPLICADO: "error",
  CLASE_INEXISTENTE: "error",
  REFERENCIA_INEXISTENTE: "error",
  USA_INVALIDO: "error",
  CIFRA_NO_APORTADA: "error",
  REGLA_SIN_COBERTURA: "advertencia",
  DATO_SIN_DEFINIR: "advertencia",
  ELEMENTO_HUERFANO: "advertencia",
  UMBRAL_NO_CONFIRMADO: "advertencia",
} as const;

export type CodigoObservacion = keyof typeof SEVERIDAD;

const CODIGOS = Object.keys(SEVERIDAD) as [
  CodigoObservacion,
  ...CodigoObservacion[],
];

export const ObservacionSchema = z.strictObject({
  codigo: z.enum(CODIGOS),
  severidad: z.enum(["error", "advertencia"]),
  ruta: z.string(), // p. ej. "fuentes_requeridas[0].columnas_minimas[2].justifica[0]"
  mensaje: z.string(), // en español; está pensado para devolvérselo al modelo
});

export const CoberturaSchema = z.strictObject({
  reglas: z.record(
    z.string(),
    z.strictObject({ cubierta: z.boolean(), faltantes: z.array(z.string()) }),
  ),
  alimentacion: z.record(z.string(), z.array(z.string())), // elemento → ["Fuente.columna", …]
});

export const AnalisisSchema = z.strictObject({
  errores: z.array(ObservacionSchema),
  advertencias: z.array(ObservacionSchema),
  cobertura: CoberturaSchema,
  completitudEfectiva: z.enum(COMPLETITUD),
  motivos: z.array(z.string()), // por qué se bajó la completitud, si se bajó
});

export type Observacion = z.infer<typeof ObservacionSchema>;
export type Cobertura = z.infer<typeof CoberturaSchema>;
export type Analisis = z.infer<typeof AnalisisSchema>;

export function observacion(
  codigo: CodigoObservacion,
  ruta: string,
  mensaje: string,
): Observacion {
  return { codigo, severidad: SEVERIDAD[codigo], ruta, mensaje };
}

/** Convierte una ruta de Zod (["a", 0, "b"]) en "a[0].b". */
export function formatearRuta(ruta: readonly PropertyKey[]): string {
  let resultado = "";
  for (const segmento of ruta) {
    resultado +=
      typeof segmento === "number"
        ? `[${segmento}]`
        : `${resultado ? "." : ""}${String(segmento)}`;
  }
  return resultado || "(raíz)";
}
