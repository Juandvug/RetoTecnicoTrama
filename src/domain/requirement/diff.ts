import type { RequerimientoMotor } from "./schema";

// Diff entre dos versiones, para marcar en el panel qué cambió. Cada elemento
// se identifica por su clave: la clase por su nombre, la relación por su
// predicado (E3), la regla por su id, la fuente por su nombre y la columna por
// "Fuente.columna".

export type CambiosDeLista = {
  agregados: string[];
  quitados: string[];
  modificados: string[];
};

export const CAMPOS_ESCALARES = [
  "necesidad",
  "decision_objetivo",
  "alcance.periodo",
  "alcance.unidades",
  "completitud",
] as const;

export type CampoEscalar = (typeof CAMPOS_ESCALARES)[number];

export type DiffRequerimiento = {
  campos: CampoEscalar[]; // los que cambiaron
  clases: CambiosDeLista;
  relaciones: CambiosDeLista;
  reglas: CambiosDeLista;
  fuentes: CambiosDeLista;
  columnas: CambiosDeLista;
  preguntas_abiertas: CambiosDeLista;
  sinCambios: boolean;
};

const igual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function compararPorClave<T>(
  anterior: T[],
  actual: T[],
  clave: (x: T) => string,
): CambiosDeLista {
  const previos = new Map(anterior.map((x) => [clave(x), x]));
  const nuevos = new Map(actual.map((x) => [clave(x), x]));
  return {
    agregados: [...nuevos.keys()].filter((k) => !previos.has(k)),
    quitados: [...previos.keys()].filter((k) => !nuevos.has(k)),
    modificados: [...nuevos]
      .filter(([k, x]) => previos.has(k) && !igual(previos.get(k), x))
      .map(([k]) => k),
  };
}

const columnas = (req: RequerimientoMotor) =>
  req.fuentes_requeridas.flatMap((f) =>
    f.columnas_minimas.map((c) => ({
      clave: `${f.nombre}.${c.nombre}`,
      justifica: c.justifica,
    })),
  );

const valorEscalar = (req: RequerimientoMotor, campo: CampoEscalar) => {
  switch (campo) {
    case "alcance.periodo":
      return req.alcance.periodo;
    case "alcance.unidades":
      return req.alcance.unidades;
    default:
      return req[campo];
  }
};

export function diffVersiones(
  anterior: RequerimientoMotor,
  actual: RequerimientoMotor,
): DiffRequerimiento {
  const diff = {
    campos: CAMPOS_ESCALARES.filter(
      (c) => !igual(valorEscalar(anterior, c), valorEscalar(actual, c)),
    ),
    clases: compararPorClave(
      anterior.esquema.clases,
      actual.esquema.clases,
      (c) => c,
    ),
    relaciones: compararPorClave(
      anterior.esquema.relaciones,
      actual.esquema.relaciones,
      (r) => r.predicado,
    ),
    reglas: compararPorClave(
      anterior.reglas_candidatas,
      actual.reglas_candidatas,
      (r) => r.id,
    ),
    // Una fuente cambia por su tipo o su justifica; sus columnas se comparan aparte.
    fuentes: compararPorClave(
      anterior.fuentes_requeridas.map(({ nombre, tipo, justifica }) => ({
        nombre,
        tipo,
        justifica,
      })),
      actual.fuentes_requeridas.map(({ nombre, tipo, justifica }) => ({
        nombre,
        tipo,
        justifica,
      })),
      (f) => f.nombre,
    ),
    columnas: compararPorClave(
      columnas(anterior),
      columnas(actual),
      (c) => c.clave,
    ),
    preguntas_abiertas: compararPorClave(
      anterior.preguntas_abiertas,
      actual.preguntas_abiertas,
      (p) => p,
    ),
  };

  const listas = [
    diff.clases,
    diff.relaciones,
    diff.reglas,
    diff.fuentes,
    diff.columnas,
    diff.preguntas_abiertas,
  ];
  const sinCambios =
    diff.campos.length === 0 &&
    listas.every(
      (l) =>
        l.agregados.length + l.quitados.length + l.modificados.length === 0,
    );

  return { ...diff, sinCambios };
}
