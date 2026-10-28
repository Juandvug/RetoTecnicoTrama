import { describe, expect, it } from "vitest";

import { createLlmClient } from "@/server/llm/factory";
import { unRequest } from "@tests/contract/llm-client.contract";
import { fetchGrabado, RESPUESTAS } from "@tests/fixtures/openai/fetch";

const señal = () => new AbortController().signal;

describe("createLlmClient", () => {
  it("compone el fake con su escenario, la telemetría y los reintentos", async () => {
    const eventos: unknown[] = [];
    const cliente = createLlmClient(
      { provider: "fake", scenario: "ejemplo" },
      { telemetria: { registrar: (e) => eventos.push(e) } },
    );

    const respuesta = await cliente.complete(unRequest(), señal());

    expect(respuesta.text).toBe("¿Qué decisión querés tomar con esto?");
    expect(eventos).toEqual([
      expect.objectContaining({ evento: "llm", resultado: "ok" }),
    ]);
  });

  it("exige un escenario con el proveedor fake", () => {
    expect(() =>
      createLlmClient(
        { provider: "fake" },
        { telemetria: { registrar: () => {} } },
      ),
    ).toThrow(/FAKE_LLM_SCENARIO/);
  });

  it("falla con un escenario que no existe", () => {
    expect(() =>
      createLlmClient(
        { provider: "fake", scenario: "no-existe" },
        { telemetria: { registrar: () => {} } },
      ),
    ).toThrow(/No existe el escenario/);
  });

  it("compone el adaptador de OpenAI con sus decoradores", async () => {
    const eventos: unknown[] = [];
    const { fetch } = fetchGrabado(200, RESPUESTAS.texto);
    const cliente = createLlmClient(
      {
        provider: "openai",
        apiKey: "clave-de-prueba",
        model: "modelo-de-prueba",
      },
      { telemetria: { registrar: (e) => eventos.push(e) }, fetch },
    );

    const respuesta = await cliente.complete(unRequest(), señal());

    expect(respuesta.text).toBe("¿Qué decisión querés tomar?");
    expect(eventos).toEqual([
      expect.objectContaining({ evento: "llm", resultado: "ok" }),
    ]);
  });

  it.each([
    ["la clave", { model: "m" }, /OPENAI_API_KEY/],
    ["el modelo", { apiKey: "k" }, /LLM_MODEL/],
  ])("con openai exige %s", (_, env, mensaje) => {
    expect(() =>
      createLlmClient(
        { provider: "openai", ...env },
        { telemetria: { registrar: () => {} } },
      ),
    ).toThrow(mensaje);
  });
});
