import { describe, expect, it } from "vitest";

import { createLlmClient } from "@/server/llm/factory";
import { unRequest } from "@tests/contract/llm-client.contract";

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

  it("todavía no tiene el adaptador de OpenAI", () => {
    expect(() =>
      createLlmClient(
        { provider: "openai" },
        { telemetria: { registrar: () => {} } },
      ),
    ).toThrow(/OpenAI todavía no está disponible/);
  });
});
