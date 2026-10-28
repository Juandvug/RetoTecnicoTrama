import { espacioDeNombres } from "./invariants";
import { observacion, type Cobertura, type Observacion } from "./observations";
import type { RequerimientoMotor } from "./schema";

// Alimentación y cobertura (ARCHITECTURE §6.3):
// - una columna alimenta cada clase o predicado que cita en su justifica; las
//   citas a reglas justifican la columna, pero no alimentan elementos;
// - una regla está cubierta si cada elemento de su usa lo alimenta al menos una
//   columna de alguna fuente.

export function analizarCobertura(req: RequerimientoMotor): Cobertura {
  const ns = espacioDeNombres(req);
  const alimentacion: Record<string, string[]> = {};
  for (const elemento of [...ns.clases, ...ns.predicados]) {
    alimentacion[elemento] = [];
  }

  for (const fuente of req.fuentes_requeridas) {
    for (const columna of fuente.columnas_minimas) {
      for (const ref of new Set(columna.justifica)) {
        alimentacion[ref]?.push(`${fuente.nombre}.${columna.nombre}`);
      }
    }
  }

  const reglas: Cobertura["reglas"] = {};
  for (const regla of req.reglas_candidatas) {
    const faltantes = [...new Set(regla.usa)].filter(
      (ref) => (alimentacion[ref]?.length ?? 0) === 0,
    );
    reglas[regla.id] = { cubierta: faltantes.length === 0, faltantes };
  }

  return { reglas, alimentacion };
}

export function observacionesDeCobertura(
  req: RequerimientoMotor,
  cobertura: Cobertura,
): Observacion[] {
  const advertencias: Observacion[] = [];

  req.reglas_candidatas.forEach((regla, i) => {
    const estado = cobertura.reglas[regla.id];
    if (estado && !estado.cubierta) {
      advertencias.push(
        observacion(
          "REGLA_SIN_COBERTURA",
          `reglas_candidatas[${i}]`,
          `${regla.id} no tiene columnas que alimenten: ${estado.faltantes.join(", ")}.`,
        ),
      );
    }
  });

  const usados = new Set(req.reglas_candidatas.flatMap((r) => r.usa));
  const huerfano = (nombre: string) =>
    !usados.has(nombre) && (cobertura.alimentacion[nombre]?.length ?? 0) === 0;

  req.esquema.clases.forEach((clase, i) => {
    if (huerfano(clase)) {
      advertencias.push(
        observacion(
          "ELEMENTO_HUERFANO",
          `esquema.clases[${i}]`,
          `La clase ${clase} no la usa ninguna regla ni la alimenta ninguna columna. Puede sobrar.`,
        ),
      );
    }
  });
  req.esquema.relaciones.forEach((relacion, i) => {
    if (huerfano(relacion.predicado)) {
      advertencias.push(
        observacion(
          "ELEMENTO_HUERFANO",
          `esquema.relaciones[${i}]`,
          `La relación ${relacion.predicado} no la usa ninguna regla ni la alimenta ninguna columna. Puede sobrar.`,
        ),
      );
    }
  });

  return advertencias;
}
