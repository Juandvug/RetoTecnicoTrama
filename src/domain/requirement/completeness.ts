import { observacion, type Cobertura, type Observacion } from "./observations";
import type { Completitud, RequerimientoMotor } from "./schema";

// Completitud efectiva (ARCHITECTURE §6.4). El LLM propone la completitud; el
// sistema la decide. Puede bajarla, pero nunca subirla: si el modelo declara
// faltan_datos, se respeta aunque la cobertura esté completa. Los motivos se
// calculan siempre, para que el panel pueda mostrarlos en cualquier caso.

export function completitudEfectiva(
  req: RequerimientoMotor,
  cobertura: Cobertura,
  hayErrores = false,
): { valor: Completitud; motivos: string[] } {
  const motivos: string[] = [];
  if (hayErrores) motivos.push("El requerimiento tiene errores de validación.");
  if (req.decision_objetivo === null)
    motivos.push("La decisión objetivo no está definida.");
  if (req.alcance.periodo === null)
    motivos.push("El período no está definido.");
  if (req.reglas_candidatas.length === 0)
    motivos.push("No hay reglas candidatas.");
  if (req.fuentes_requeridas.length === 0)
    motivos.push("No hay fuentes requeridas.");
  for (const [id, c] of Object.entries(cobertura.reglas)) {
    if (!c.cubierta)
      motivos.push(`${id} no tiene datos para: ${c.faltantes.join(", ")}.`);
  }

  const suficiente =
    req.completitud === "suficiente_para_confirmar" && motivos.length === 0;
  return {
    valor: suficiente ? "suficiente_para_confirmar" : "faltan_datos",
    motivos,
  };
}

/** DATO_SIN_DEFINIR: lo que falta definir y por eso baja la completitud. */
export function datosSinDefinir(req: RequerimientoMotor): Observacion[] {
  const faltantes: Array<[string, string]> = [];
  if (req.decision_objetivo === null)
    faltantes.push(["decision_objetivo", "La decisión objetivo es null."]);
  if (req.alcance.periodo === null)
    faltantes.push(["alcance.periodo", "El período es null."]);
  if (req.reglas_candidatas.length === 0)
    faltantes.push(["reglas_candidatas", "No hay reglas candidatas."]);
  if (req.fuentes_requeridas.length === 0)
    faltantes.push(["fuentes_requeridas", "No hay fuentes requeridas."]);
  return faltantes.map(([ruta, mensaje]) =>
    observacion("DATO_SIN_DEFINIR", ruta, mensaje),
  );
}
