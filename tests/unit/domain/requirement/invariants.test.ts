import { describe, expect, it } from "vitest";

import {
  analizarRequerimiento,
  type CodigoObservacion,
} from "@/domain/requirement";
import {
  corpus,
  FIXTURES,
  unRequerimiento,
} from "@tests/fixtures/requerimientos";

const codigos = (req: ReturnType<typeof unRequerimiento>) => {
  const a = analizarRequerimiento(req, corpus);
  return [...a.errores, ...a.advertencias].map((o) => o.codigo);
};

const observaciones = (
  req: ReturnType<typeof unRequerimiento>,
  codigo: CodigoObservacion,
) => {
  const a = analizarRequerimiento(req, corpus);
  return [...a.errores, ...a.advertencias].filter((o) => o.codigo === codigo);
};

describe("invariantes semánticas", () => {
  it.each(Object.entries(FIXTURES))(
    "el fixture %s no tiene errores ni advertencias",
    (_, { requerimiento, corpus }) => {
      const a = analizarRequerimiento(requerimiento, corpus);
      expect(a.errores).toEqual([]);
      expect(a.advertencias).toEqual([]);
    },
  );

  describe("ID_DUPLICADO", () => {
    it("detecta un predicado repetido (E3)", () => {
      const req = unRequerimiento((r) => {
        r.esquema.relaciones[1]!.predicado = "asignadoA";
      });
      const [error] = observaciones(req, "ID_DUPLICADO");
      expect(error?.ruta).toBe("esquema.relaciones[1].predicado");
      expect(error?.mensaje).toContain("esquema.relaciones[0].predicado");
    });

    it("detecta una clase con el mismo nombre que un predicado", () => {
      const req = unRequerimiento((r) => {
        r.esquema.clases.push("registra");
      });
      expect(codigos(req)).toContain("ID_DUPLICADO");
    });

    it("detecta una regla con un id repetido", () => {
      const req = unRequerimiento((r) => {
        r.reglas_candidatas[1]!.id = "R1";
      });
      expect(observaciones(req, "ID_DUPLICADO")[0]?.ruta).toBe(
        "reglas_candidatas[1].id",
      );
    });

    it("detecta una columna repetida dentro de una fuente", () => {
      const req = unRequerimiento((r) => {
        r.fuentes_requeridas[0]!.columnas_minimas[1]!.nombre = "empleado_id";
      });
      expect(observaciones(req, "ID_DUPLICADO")[0]?.ruta).toBe(
        "fuentes_requeridas[0].columnas_minimas[1].nombre",
      );
    });

    it("permite la misma columna en fuentes distintas", () => {
      // empleado_id está en las dos fuentes del fixture.
      expect(codigos(unRequerimiento())).not.toContain("ID_DUPLICADO");
    });

    it("detecta una fuente repetida", () => {
      const req = unRequerimiento((r) => {
        r.fuentes_requeridas[1]!.nombre = "Nómina";
      });
      expect(observaciones(req, "ID_DUPLICADO")[0]?.ruta).toBe(
        "fuentes_requeridas[1].nombre",
      );
    });
  });

  describe("CLASE_INEXISTENTE", () => {
    it("detecta una relación hacia una clase que no está en el esquema", () => {
      const req = unRequerimiento((r) => {
        r.esquema.relaciones[1]!.objeto = "Jefe";
      });
      const [error] = observaciones(req, "CLASE_INEXISTENTE");
      expect(error).toMatchObject({
        severidad: "error",
        ruta: "esquema.relaciones[1].objeto",
        mensaje: '"Jefe" no está en esquema.clases.',
      });
    });

    it("sugiere el nombre correcto cuando solo difiere en mayúsculas", () => {
      const req = unRequerimiento((r) => {
        r.esquema.relaciones[0]!.sujeto = "empleado";
      });
      expect(observaciones(req, "CLASE_INEXISTENTE")[0]?.mensaje).toContain(
        '¿Quisiste decir "Empleado"?',
      );
    });

    it("no se dispara con sujeto y objeto válidos", () => {
      expect(codigos(unRequerimiento())).not.toContain("CLASE_INEXISTENTE");
    });
  });

  describe("REFERENCIA_INEXISTENTE", () => {
    it("detecta una columna que justifica algo que no existe", () => {
      const req = unRequerimiento((r) => {
        r.fuentes_requeridas[0]!.columnas_minimas[3]!.justifica = ["Motivo"];
      });
      expect(observaciones(req, "REFERENCIA_INEXISTENTE")[0]?.ruta).toBe(
        "fuentes_requeridas[0].columnas_minimas[3].justifica[0]",
      );
    });

    it("detecta una fuente que justifica algo que no existe", () => {
      const req = unRequerimiento((r) => {
        r.fuentes_requeridas[0]!.justifica.push("R9");
      });
      expect(observaciones(req, "REFERENCIA_INEXISTENTE")[0]?.ruta).toBe(
        "fuentes_requeridas[0].justifica[3]",
      );
    });

    it("acepta citas a clases, predicados y reglas", () => {
      expect(codigos(unRequerimiento())).not.toContain(
        "REFERENCIA_INEXISTENTE",
      );
    });
  });

  describe("USA_INVALIDO", () => {
    it("rechaza que una regla use otra regla", () => {
      const req = unRequerimiento((r) => {
        r.reglas_candidatas[1]!.usa.push("R1");
      });
      const [error] = observaciones(req, "USA_INVALIDO");
      expect(error?.ruta).toBe("reglas_candidatas[1].usa[5]");
      expect(error?.mensaje).toContain("es una regla");
    });

    it("rechaza un elemento que no existe", () => {
      const req = unRequerimiento((r) => {
        r.reglas_candidatas[0]!.usa.push("Contrato");
      });
      expect(codigos(req)).toContain("USA_INVALIDO");
    });

    it("acepta clases y predicados", () => {
      expect(codigos(unRequerimiento())).not.toContain("USA_INVALIDO");
    });
  });
});
