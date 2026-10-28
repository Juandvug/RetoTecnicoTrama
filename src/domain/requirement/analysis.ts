import { z } from "zod";

import { completitudEfectiva, datosSinDefinir } from "./completeness";
import { analizarCobertura, observacionesDeCobertura } from "./coverage";
import { observacionesDeCifras } from "./figures";
import { verificarInvariantes } from "./invariants";
import {
  formatearRuta,
  observacion,
  type Analisis,
  type Observacion,
} from "./observations";
import { RequerimientoMotorSchema, type RequerimientoMotor } from "./schema";

export type OpcionesDeAnalisis = {
  /**
   * Por defecto, true. El servidor lo apaga al revalidar la versión vigente que
   * manda el cliente: la ventana de mensajes puede haber perdido el mensaje en
   * el que el usuario dio una cifra, y esa versión ya pasó la guarda en su turno.
   */
  verificarCifras?: boolean;
};

export function analizarRequerimiento(
  req: RequerimientoMotor,
  corpusUsuario: string[],
  { verificarCifras = true }: OpcionesDeAnalisis = {},
): Analisis {
  const cobertura = analizarCobertura(req);
  const observaciones: Observacion[] = [
    ...verificarInvariantes(req),
    ...(verificarCifras ? observacionesDeCifras(req, corpusUsuario) : []),
    ...observacionesDeCobertura(req, cobertura),
    ...datosSinDefinir(req),
  ];

  const errores = observaciones.filter((o) => o.severidad === "error");
  const advertencias = observaciones.filter(
    (o) => o.severidad === "advertencia",
  );
  const completitud = completitudEfectiva(req, cobertura, errores.length > 0);

  return {
    errores,
    advertencias,
    cobertura,
    completitudEfectiva: completitud.valor,
    motivos: completitud.motivos,
  };
}

const zodEnEspanol = z.locales.es().localeError;

/** Único punto de entrada desde el engine: valida los argumentos crudos de la tool. */
export function validarArgumentos(
  argumentos: string,
  corpusUsuario: string[],
):
  | { ok: true; requerimiento: RequerimientoMotor; analisis: Analisis }
  | { ok: false; errores: Observacion[] } {
  let datos: unknown;
  try {
    datos = JSON.parse(argumentos);
  } catch {
    return {
      ok: false,
      errores: [
        observacion(
          "JSON_INVALIDO",
          "(raíz)",
          "Los argumentos no son JSON válido; puede que la respuesta se haya cortado. Enviá el requerimiento completo y más compacto.",
        ),
      ],
    };
  }

  const resultado = RequerimientoMotorSchema.safeParse(datos, {
    error: zodEnEspanol,
  });
  if (!resultado.success) {
    return {
      ok: false,
      errores: resultado.error.issues.map((issue) =>
        observacion(
          "ESQUEMA_INVALIDO",
          formatearRuta(issue.path),
          issue.message,
        ),
      ),
    };
  }

  const analisis = analizarRequerimiento(resultado.data, corpusUsuario);
  if (analisis.errores.length > 0)
    return { ok: false, errores: analisis.errores };
  return { ok: true, requerimiento: resultado.data, analisis };
}
