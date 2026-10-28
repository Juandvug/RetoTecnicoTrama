import { z } from "zod";

import {
  COMPLETITUD,
  TIPOS_FUENTE,
  type Completitud,
  type RequerimientoMotor,
} from "./schema";

// Forma base del enunciado, tal cual (docs/enunciado.md). Sirve para exportar
// el requerimiento sin las extensiones de ADR-0006 y para comprobar en los
// tests que la proyección la respeta.
export const ContratoBaseSchema = z.strictObject({
  necesidad: z.string(),
  decision_objetivo: z.string(),
  alcance: z.strictObject({
    periodo: z.string(),
    unidades: z.array(z.string()),
  }),
  esquema: z.strictObject({
    clases: z.array(z.string()),
    relaciones: z.array(
      z.strictObject({
        sujeto: z.string(),
        predicado: z.string(),
        objeto: z.string(),
      }),
    ),
  }),
  reglas_candidatas: z.array(
    z.strictObject({ id: z.string(), enunciado: z.string() }),
  ),
  fuentes_requeridas: z.array(
    z.strictObject({
      nombre: z.string(),
      tipo: z.enum(TIPOS_FUENTE),
      columnas_minimas: z.array(z.string()),
      justifica: z.array(z.string()),
    }),
  ),
  preguntas_abiertas: z.array(z.string()),
  completitud: z.enum(COMPLETITUD),
});

export type ContratoBase = z.infer<typeof ContratoBaseSchema>;

export const SIN_DEFINIR = "sin definir";

/**
 * Proyección al contrato base (ADR-0006): las columnas vuelven a ser nombres,
 * el justifica de cada fuente une el suyo con el de sus columnas y null pasa a
 * "sin definir". La completitud que se exporta es la efectiva cuando se pasa:
 * el sistema puede haberla bajado respecto de la declarada.
 */
export function aContratoBase(
  req: RequerimientoMotor,
  completitud: Completitud = req.completitud,
): ContratoBase {
  return {
    necesidad: req.necesidad,
    decision_objetivo: req.decision_objetivo ?? SIN_DEFINIR,
    alcance: {
      periodo: req.alcance.periodo ?? SIN_DEFINIR,
      unidades: [...req.alcance.unidades],
    },
    esquema: {
      clases: [...req.esquema.clases],
      relaciones: req.esquema.relaciones.map(
        ({ sujeto, predicado, objeto }) => ({
          sujeto,
          predicado,
          objeto,
        }),
      ),
    },
    reglas_candidatas: req.reglas_candidatas.map(({ id, enunciado }) => ({
      id,
      enunciado,
    })),
    fuentes_requeridas: req.fuentes_requeridas.map((fuente) => ({
      nombre: fuente.nombre,
      tipo: fuente.tipo,
      columnas_minimas: fuente.columnas_minimas.map((c) => c.nombre),
      justifica: [
        ...new Set([
          ...fuente.justifica,
          ...fuente.columnas_minimas.flatMap((c) => c.justifica),
        ]),
      ],
    })),
    preguntas_abiertas: [...req.preguntas_abiertas],
    completitud,
  };
}
