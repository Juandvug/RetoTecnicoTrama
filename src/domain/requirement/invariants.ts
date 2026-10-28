import { observacion, type Observacion } from "./observations";
import type { RequerimientoMotor } from "./schema";

// Invariantes semánticas (ARCHITECTURE §6.3, ADR-0006). Las referencias se
// resuelven contra un único espacio de nombres: clases ∪ predicados ∪ ids de
// regla, sin repetidos.

export type EspacioDeNombres = {
  clases: Set<string>;
  predicados: Set<string>;
  reglas: Set<string>;
};

export function espacioDeNombres(req: RequerimientoMotor): EspacioDeNombres {
  return {
    clases: new Set(req.esquema.clases),
    predicados: new Set(req.esquema.relaciones.map((r) => r.predicado)),
    reglas: new Set(req.reglas_candidatas.map((r) => r.id)),
  };
}

const todos = (ns: EspacioDeNombres) => [
  ...ns.clases,
  ...ns.predicados,
  ...ns.reglas,
];

/** Sugiere un nombre que solo difiere en mayúsculas, para facilitar la reparación. */
function sugerencia(nombre: string, candidatos: string[]): string {
  const parecido = candidatos.find(
    (c) => c.toLowerCase() === nombre.toLowerCase(),
  );
  return parecido ? ` ¿Quisiste decir "${parecido}"?` : "";
}

export function verificarInvariantes(req: RequerimientoMotor): Observacion[] {
  return [
    ...duplicados(req),
    ...clasesDeRelaciones(req),
    ...referencias(req),
    ...usos(req),
  ];
}

function duplicados(req: RequerimientoMotor): Observacion[] {
  const errores: Observacion[] = [];
  const vistos = new Map<string, string>(); // nombre → ruta de la primera aparición

  const registrar = (nombre: string, ruta: string) => {
    const anterior = vistos.get(nombre);
    if (anterior === undefined) {
      vistos.set(nombre, ruta);
      return;
    }
    errores.push(
      observacion(
        "ID_DUPLICADO",
        ruta,
        `"${nombre}" ya está definido en ${anterior}. Clases, predicados e ids de regla comparten un mismo espacio de nombres y no se pueden repetir.`,
      ),
    );
  };

  req.esquema.clases.forEach((c, i) => registrar(c, `esquema.clases[${i}]`));
  req.esquema.relaciones.forEach((r, i) =>
    registrar(r.predicado, `esquema.relaciones[${i}].predicado`),
  );
  req.reglas_candidatas.forEach((r, i) =>
    registrar(r.id, `reglas_candidatas[${i}].id`),
  );

  const fuentes = new Map<string, number>();
  req.fuentes_requeridas.forEach((fuente, i) => {
    const anterior = fuentes.get(fuente.nombre);
    if (anterior !== undefined) {
      errores.push(
        observacion(
          "ID_DUPLICADO",
          `fuentes_requeridas[${i}].nombre`,
          `La fuente "${fuente.nombre}" ya está en fuentes_requeridas[${anterior}].`,
        ),
      );
    } else {
      fuentes.set(fuente.nombre, i);
    }

    const columnas = new Set<string>();
    fuente.columnas_minimas.forEach((columna, j) => {
      if (columnas.has(columna.nombre)) {
        errores.push(
          observacion(
            "ID_DUPLICADO",
            `fuentes_requeridas[${i}].columnas_minimas[${j}].nombre`,
            `La columna "${columna.nombre}" se repite en la fuente "${fuente.nombre}".`,
          ),
        );
      }
      columnas.add(columna.nombre);
    });
  });

  return errores;
}

function clasesDeRelaciones(req: RequerimientoMotor): Observacion[] {
  const clases = new Set(req.esquema.clases);
  const errores: Observacion[] = [];
  req.esquema.relaciones.forEach((relacion, i) => {
    for (const extremo of ["sujeto", "objeto"] as const) {
      const nombre = relacion[extremo];
      if (!clases.has(nombre)) {
        errores.push(
          observacion(
            "CLASE_INEXISTENTE",
            `esquema.relaciones[${i}].${extremo}`,
            `"${nombre}" no está en esquema.clases.${sugerencia(nombre, [...clases])}`,
          ),
        );
      }
    }
  });
  return errores;
}

function referencias(req: RequerimientoMotor): Observacion[] {
  const ns = espacioDeNombres(req);
  const validos = new Set(todos(ns));
  const errores: Observacion[] = [];

  const verificar = (lista: string[], ruta: string) => {
    lista.forEach((ref, k) => {
      if (!validos.has(ref)) {
        errores.push(
          observacion(
            "REFERENCIA_INEXISTENTE",
            `${ruta}[${k}]`,
            `"${ref}" no es una clase, un predicado ni un id de regla del requerimiento.${sugerencia(ref, todos(ns))}`,
          ),
        );
      }
    });
  };

  req.fuentes_requeridas.forEach((fuente, i) => {
    verificar(fuente.justifica, `fuentes_requeridas[${i}].justifica`);
    fuente.columnas_minimas.forEach((columna, j) =>
      verificar(
        columna.justifica,
        `fuentes_requeridas[${i}].columnas_minimas[${j}].justifica`,
      ),
    );
  });

  return errores;
}

function usos(req: RequerimientoMotor): Observacion[] {
  const ns = espacioDeNombres(req);
  const elementos = [...ns.clases, ...ns.predicados];
  const errores: Observacion[] = [];

  req.reglas_candidatas.forEach((regla, i) => {
    regla.usa.forEach((ref, k) => {
      if (ns.clases.has(ref) || ns.predicados.has(ref)) return;
      const motivo = ns.reglas.has(ref)
        ? `"${ref}" es una regla; usa solo puede citar clases y predicados.`
        : `"${ref}" no es una clase ni un predicado del esquema.${sugerencia(ref, elementos)}`;
      errores.push(
        observacion(
          "USA_INVALIDO",
          `reglas_candidatas[${i}].usa[${k}]`,
          motivo,
        ),
      );
    });
  });

  return errores;
}
