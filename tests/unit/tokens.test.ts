import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Los tokens de docs/enunciado.md son la fuente de verdad: globals.css tiene
// que repetirlos tal cual, en claro y en oscuro (PLAN F1.6).

const leer = (ruta: string) => readFileSync(ruta, "utf8");

/** Contenido del bloque `selector { … }` y sus variables, normalizadas. */
function variables(css: string, selector: ":root" | ".dark") {
  const apertura = css.indexOf(`\n${selector} {`);
  const inicio = css.indexOf("{", apertura) + 1;
  const bloque = css.slice(inicio, css.indexOf("\n}", inicio));
  const resultado = new Map<string, string>();
  for (const [, nombre, valor] of bloque.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    resultado.set(nombre!, valor!.replace(/\s+/g, " ").trim());
  }
  return resultado;
}

const enunciado = leer("docs/enunciado.md");
const bloqueEnunciado = enunciado.slice(
  enunciado.indexOf(":root {"),
  enunciado.indexOf("```", enunciado.indexOf(":root {")),
);
const globals = leer("src/app/globals.css");

describe("tokens de estilo", () => {
  it.each([
    [":root", 13],
    [".dark", 12],
  ] as const)(
    "%s repite las %i variables del enunciado",
    (selector, cantidad) => {
      const esperadas = variables(`\n${bloqueEnunciado}`, selector);
      const actuales = variables(globals, selector);

      expect(esperadas.size).toBe(cantidad);
      for (const [nombre, valor] of esperadas) {
        expect(actuales.get(nombre), `${selector} ${nombre}`).toBe(valor);
      }
    },
  );

  it("mapea los tokens con @theme inline", () => {
    expect(globals).toContain("@theme inline");
    expect(globals).toContain("--color-sidebar: var(--sidebar);");
  });

  it("no define una paleta con color (monocromática)", () => {
    // oklch(L C H): el croma (segundo valor) es 0 salvo en destructive.
    const conCroma = [
      ...globals.matchAll(/(--[\w-]+):\s*oklch\(([\d.]+) ([\d.]+)/g),
    ]
      .filter(([, , , croma]) => Number(croma) > 0)
      .map(([, nombre]) => nombre);
    expect(conCroma.every((n) => n === "--destructive")).toBe(true);
  });
});
