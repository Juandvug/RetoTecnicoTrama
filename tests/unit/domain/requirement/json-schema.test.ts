import { describe, expect, it } from "vitest";

import {
  esquemaJsonDelRequerimiento,
  type JsonSchema,
} from "@/domain/requirement";

/** Recorre el schema y devuelve cada subesquema de tipo object con su ruta. */
function objetos(schema: unknown, ruta = "#"): Array<[string, JsonSchema]> {
  if (typeof schema !== "object" || schema === null) return [];
  const nodo = schema as JsonSchema;
  const propios: Array<[string, JsonSchema]> =
    nodo.type === "object" ? [[ruta, nodo]] : [];
  return [
    ...propios,
    ...Object.entries(nodo).flatMap(([clave, valor]) =>
      Array.isArray(valor)
        ? valor.flatMap((v, i) => objetos(v, `${ruta}/${clave}/${i}`))
        : objetos(valor, `${ruta}/${clave}`),
    ),
  ];
}

describe("JSON Schema de registrar_requerimiento", () => {
  const schema = esquemaJsonDelRequerimiento();

  it("coincide con el snapshot", () => {
    expect(schema).toMatchSnapshot();
  });

  it("es compatible con el modo estricto: todo requerido y sin propiedades extra", () => {
    const encontrados = objetos(schema);
    expect(encontrados.length).toBeGreaterThan(5);
    for (const [ruta, nodo] of encontrados) {
      const propiedades = Object.keys(
        (nodo.properties as object | undefined) ?? {},
      );
      expect(
        [...((nodo.required as string[] | undefined) ?? [])].sort(),
        ruta,
      ).toEqual(propiedades.sort());
      expect(nodo.additionalProperties, ruta).toBe(false);
    }
  });

  it("no usa referencias, que el modo estricto restringe", () => {
    expect(JSON.stringify(schema)).not.toContain('"$ref"');
  });

  it("expresa lo desconocido como null y no como campo opcional (E4)", () => {
    const props = schema.properties as Record<string, JsonSchema>;
    expect(props.decision_objetivo).toEqual({
      anyOf: [expect.objectContaining({ type: "string" }), { type: "null" }],
    });
  });
});
