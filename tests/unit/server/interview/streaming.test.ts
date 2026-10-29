import { describe, expect, it } from "vitest";

import type { EventoDeTexto } from "@/contracts/interview";
import { runTurn } from "@/server/interview";
import { crearTransmisor, fronteraSegura } from "@/server/interview/streaming";
import { FakeLlmClient, falla, texto } from "@/server/llm/fake/client";
import { LlmError, type LlmClient } from "@/server/llm/port";
import { withRetry } from "@/server/llm/retry";
import { unRequerimiento } from "@tests/fixtures/requerimientos";
import {
  AHORA,
  registrar,
  sinCancelar,
  unasDeps,
  unTurno,
} from "@tests/fixtures/turnos";

// Transmisión del texto (ADR-0003, ADR-0004): sale a medida que llega, pero
// nunca una cifra que el usuario no aportó.

function transmitir(fragmentos: string[], corpus: string[] = []) {
  let salida = "";
  const t = crearTransmisor(corpus, (f) => (salida += f));
  const parciales: string[] = [];
  for (const f of fragmentos) {
    t.agregar(f);
    parciales.push(salida);
  }
  return { t, parciales, salida: () => salida };
}

describe("fronteraSegura", () => {
  it("retiene la última palabra, que puede estar a medias", () => {
    expect(fronteraSegura("¿Qué decisión que")).toBe("¿Qué decisión ".length);
  });

  it("retiene una cifra hasta ver lo que la sigue", () => {
    const texto = "Bajaron un 30 ";
    expect(fronteraSegura(texto)).toBe("Bajaron un ".length);
  });

  it("suelta la cifra cuando ya pasó suficiente contexto", () => {
    const texto = "Son 3 canales: chat, teléfono y email. Y ";
    expect(fronteraSegura(texto)).toBe(texto.length);
  });
});

describe("crearTransmisor", () => {
  it("transmite el texto por partes a medida que llega", () => {
    const { parciales, t, salida } = transmitir([
      "¿Qué ",
      "decisión ",
      "querés ",
      "tomar?",
    ]);
    expect(parciales).toEqual([
      "¿Qué ",
      "¿Qué decisión ",
      "¿Qué decisión querés ",
      "¿Qué decisión querés ",
    ]);
    t.cerrar();
    expect(salida()).toBe("¿Qué decisión querés tomar?");
  });

  it("nunca transmite un porcentaje no aportado, aunque llegue partido", () => {
    const { t, parciales, salida } = transmitir([
      "Podrían bajar un 3",
      "0",
      " ",
      "%",
      " si reforzás el chat y sumás gente.",
    ]);
    t.cerrar();
    for (const p of parciales) expect(p).not.toMatch(/\d/);
    expect(salida()).toBe("Podrían bajar un ");
  });

  it("nunca transmite un monto no aportado", () => {
    const { t, salida } = transmitir([
      "Costaría unos ",
      "1500 ",
      "dólares ",
      "por mes en total.",
    ]);
    t.cerrar();
    expect(salida()).not.toMatch(/1500/);
  });

  it("transmite una cifra que el usuario sí aportó", () => {
    const { t, salida } = transmitir(
      ["Dijiste que subieron un 30 % ", "desde marzo."],
      ["Los reclamos subieron un 30 % desde marzo."],
    );
    t.cerrar();
    expect(salida()).toBe("Dijiste que subieron un 30 % desde marzo.");
  });

  it("transmite fechas y números sueltos, que no son cifras", () => {
    const { t, salida } = transmitir([
      "Tomo el período 2026-03 / 2026-09 ",
      "y 2 fuentes.",
    ]);
    t.cerrar();
    expect(salida()).toBe("Tomo el período 2026-03 / 2026-09 y 2 fuentes.");
  });
});

describe("runTurn con transmisión", () => {
  async function correr(llm: LlmClient, turno = unTurno()) {
    const eventos: EventoDeTexto[] = [];
    const { deps } = unasDeps(llm);
    const r = await runTurn(turno, deps, sinCancelar(), (e) => eventos.push(e));
    const visible = eventos.reduce(
      (acc, e) => (e.tipo === "reinicio" ? "" : acc + e.texto),
      "",
    );
    return { r, eventos, visible };
  }

  it("lo visible al final coincide con el mensaje", async () => {
    const { r, visible, eventos } = await correr(
      new FakeLlmClient([texto("¿Qué decisión querés tomar con esto?")]),
    );
    expect(eventos.length).toBeGreaterThan(1);
    expect(visible).toBe(r.mensaje);
  });

  it("no transmite la tool call; sí el texto que se redacta después", async () => {
    const { r, visible } = await correr(
      new FakeLlmClient([
        registrar(unRequerimiento()),
        texto("Te dejé una propuesta."),
      ]),
    );
    expect(r.propuesta).not.toBeNull();
    expect(visible).toBe("Te dejé una propuesta.");
  });

  it("un texto previo a una tool call se reinicia antes del texto final", async () => {
    const { eventos, visible } = await correr(
      new FakeLlmClient([
        {
          respuesta: {
            text: "Voy a registrar esto. ",
            toolCalls: [
              {
                name: "registrar_requerimiento",
                arguments: JSON.stringify(unRequerimiento()),
              },
            ],
          },
        },
        texto("Te dejé una propuesta."),
      ]),
    );
    expect(eventos.some((e) => e.tipo === "reinicio")).toBe(true);
    expect(visible).toBe("Te dejé una propuesta.");
  });

  it("la corrección de cifras no se transmite: lo visible nunca muestra la cifra", async () => {
    const { r, eventos } = await correr(
      new FakeLlmClient([
        texto("Los reclamos podrían bajar un 30 % si reforzás el chat."),
        texto("Los reclamos podrían bajar si reforzás el chat."),
      ]),
    );
    expect(r.meta.guardaCifras).toBe("corregido");
    for (const e of eventos)
      if (e.tipo === "texto") expect(e.texto).not.toMatch(/30/);
  });

  it("un reintento del proveedor reinicia lo transmitido en el intento anterior", async () => {
    // Un proveedor que transmite y se corta en el primer intento.
    let intento = 0;
    const cortado: LlmClient = {
      async complete(request, signal, options) {
        intento++;
        if (intento === 1) {
          options?.onTextDelta?.("Primera versión que se corta ");
          throw LlmError.de("unavailable");
        }
        return new FakeLlmClient([
          texto("¿Qué decisión querés tomar?"),
        ]).complete(request, signal, options);
      },
    };
    const { eventos, visible } = await correr(
      withRetry(cortado, {
        baseMs: 1,
        azar: () => 0,
        clock: { now: () => AHORA },
      }),
    );
    expect(eventos[0]).toEqual({
      tipo: "texto",
      texto: "Primera versión que se corta ",
    });
    expect(eventos).toContainEqual({ tipo: "reinicio" });
    expect(visible).toBe("¿Qué decisión querés tomar?");
  });

  it("sin alTexto no transmite nada y el resultado es el mismo", async () => {
    const fake = new FakeLlmClient([falla("unavailable")]);
    const { deps } = unasDeps(fake);
    await expect(runTurn(unTurno(), deps, sinCancelar())).rejects.toMatchObject(
      {
        kind: "unavailable",
      },
    );
    expect(fake.opciones[0]).not.toHaveProperty("onTextDelta");
  });
});
