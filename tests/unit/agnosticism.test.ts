import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT } from "@/server/interview";
import { FIXTURES } from "@tests/fixtures/requerimientos";

// Guarda de agnosticismo (PLAN F5.6, ARCHITECTURE §10.4): ningún identificador
// de los fixtures de dominio (clases, predicados, columnas y fuentes) puede
// aparecer en el prompt ni en src/. Así se detecta una lista de datos o de
// clases fija para un caso de uso, que haría que la solución solo sirva para
// un dominio.
//
// No se buscan palabras sueltas del texto libre: con tres fixtures chicos, eso
// marca castellano general y choca con el vocabulario propio del sistema (el
// "turno" de la conversación no es el turno de trabajo de un fixture).

/** Un identificador compuesto (snake_case o con mayúsculas internas) no choca con una palabra común. */
const esCompuesto = (id: string) => /_|\p{Ll}\p{Lu}/u.test(id);

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function identificadoresDeDominio(): Array<{
  id: string;
  dominio: string;
  patron: RegExp;
}> {
  return Object.entries(FIXTURES).flatMap(([dominio, { requerimiento: r }]) => {
    const ids = new Set([
      ...r.esquema.clases,
      ...r.esquema.relaciones.map((rel) => rel.predicado),
      ...r.fuentes_requeridas.map((f) => f.nombre),
      ...r.fuentes_requeridas.flatMap((f) =>
        f.columnas_minimas.map((c) => c.nombre),
      ),
    ]);
    // Un identificador que es una sola palabra en minúscula ("fecha", o el
    // predicado "registra") no se distingue de la prosa: queda fuera de la guarda.
    return [...ids]
      .filter((id) => !/^\p{Ll}+$/u.test(id))
      .map((id) => ({
        id,
        dominio,
        // Palabra completa; los compuestos sin distinguir mayúsculas, los simples
        // con su mayúscula (Turno como clase, no "turno" de la conversación).
        patron: new RegExp(
          `(?<![\\p{L}\\p{N}_])${escapar(id)}(?![\\p{L}\\p{N}_])`,
          esCompuesto(id) ? "iu" : "u",
        ),
      }));
  });
}

function archivosDe(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) return archivosDe(ruta);
    return /\.(ts|tsx|css)$/.test(entrada.name) ? [ruta] : [];
  });
}

const identificadores = identificadoresDeDominio();

const apariciones = (texto: string) =>
  identificadores
    .filter(({ patron }) => patron.test(texto))
    .map(({ id }) => id);

describe("guarda de agnosticismo", () => {
  it("extrae los identificadores de los tres dominios", () => {
    const ids = identificadores.map((i) => i.id);
    for (const id of [
      "Empleado",
      "asignadoA",
      "empleado_id",
      "Nómina",
      "Etapa",
      "ConteoFisico",
    ]) {
      expect(ids, id).toContain(id);
    }
    expect(new Set(identificadores.map((i) => i.dominio))).toEqual(
      new Set(Object.keys(FIXTURES)),
    );
  });

  it("el prompt no usa identificadores de ningún dominio de los fixtures", () => {
    expect(apariciones(SYSTEM_PROMPT)).toEqual([]);
  });

  it("src/ no usa identificadores de ningún dominio de los fixtures", () => {
    const hallazgos = archivosDe("src").flatMap((archivo) =>
      apariciones(readFileSync(archivo, "utf8")).map(
        (id) => `${archivo}: ${id}`,
      ),
    );
    expect(hallazgos).toEqual([]);
  });

  describe("la guarda detecta lo que tiene que detectar", () => {
    it.each([
      ['const clases = ["Empleado", "Turno"];', ["Empleado", "Turno"]],
      ["predicado: asignadoA", ["asignadoA"]],
      ["columna EMPLEADO_ID", ["empleado_id"]],
      ['fuente: "Remitos de recepción"', ["Remitos de recepción"]],
    ])("%j", (texto, esperado) => {
      expect(apariciones(texto)).toEqual(expect.arrayContaining(esperado));
    });

    it.each([
      "el turno de la conversación",
      "cada paso del guion",
      "las respuestas en orden",
      "la fecha_actual del contexto",
      "el decorador registra la latencia y la fecha",
    ])("y no marca el vocabulario propio del sistema: %j", (texto) => {
      expect(apariciones(texto)).toEqual([]);
    });
  });
});
