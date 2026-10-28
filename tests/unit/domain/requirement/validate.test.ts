import { describe, expect, it } from "vitest";

import { validarArgumentos } from "@/domain/requirement";
import { corpus, unRequerimiento } from "@tests/fixtures/requerimientos";

const json = (valor: unknown) => JSON.stringify(valor);

describe("validarArgumentos", () => {
  it("devuelve el requerimiento y su análisis cuando es válido", () => {
    const resultado = validarArgumentos(json(unRequerimiento()), corpus);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.requerimiento).toEqual(unRequerimiento());
    expect(resultado.analisis.completitudEfectiva).toBe(
      "suficiente_para_confirmar",
    );
  });

  it("JSON_INVALIDO: argumentos truncados", () => {
    const truncado = json(unRequerimiento()).slice(0, 120);
    expect(validarArgumentos(truncado, corpus)).toEqual({
      ok: false,
      errores: [
        expect.objectContaining({
          codigo: "JSON_INVALIDO",
          severidad: "error",
        }),
      ],
    });
  });

  it("ESQUEMA_INVALIDO: una observación por cada problema, con su ruta y en español", () => {
    const req = unRequerimiento() as unknown as Record<string, unknown> & {
      fuentes_requeridas: { columnas_minimas: { justifica: string[] }[] }[];
    };
    delete req.necesidad;
    req.fuentes_requeridas[0]!.columnas_minimas[2]!.justifica = [];

    const resultado = validarArgumentos(json(req), corpus);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.map((e) => [e.codigo, e.ruta])).toEqual([
      ["ESQUEMA_INVALIDO", "necesidad"],
      [
        "ESQUEMA_INVALIDO",
        "fuentes_requeridas[0].columnas_minimas[2].justifica",
      ],
    ]);
    expect(resultado.errores[1]?.mensaje).toMatch(/se esperaba/);
  });

  it("ESQUEMA_INVALIDO en la raíz cuando sobra un campo", () => {
    const resultado = validarArgumentos(
      json({ ...unRequerimiento(), extra: 1 }),
      corpus,
    );
    expect(resultado).toMatchObject({
      ok: false,
      errores: [{ codigo: "ESQUEMA_INVALIDO", ruta: "(raíz)" }],
    });
  });

  it("rechaza un requerimiento con errores semánticos", () => {
    const req = unRequerimiento((r) => {
      r.esquema.relaciones[1]!.objeto = "Jefe";
    });
    expect(validarArgumentos(json(req), corpus)).toEqual({
      ok: false,
      errores: [expect.objectContaining({ codigo: "CLASE_INEXISTENTE" })],
    });
  });

  it("acepta un requerimiento con advertencias", () => {
    const req = unRequerimiento((r) => {
      r.alcance.periodo = null;
    });
    const resultado = validarArgumentos(json(req), corpus);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.analisis.completitudEfectiva).toBe("faltan_datos");
  });
});
