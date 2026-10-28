import { describe, expect, it } from "vitest";

import { FakeLlmClient, falla, llamada, texto } from "@/server/llm/fake/client";
import { withTelemetry, type CampoDeTelemetria } from "@/server/llm/telemetry";
import { unRequest } from "@tests/contract/llm-client.contract";

function armar(guion: ConstructorParameters<typeof FakeLlmClient>[0]) {
  const eventos: Array<Record<string, CampoDeTelemetria>> = [];
  let ahora = 1000;
  const reloj = { now: () => (ahora += 40) };
  const cliente = withTelemetry(
    new FakeLlmClient(guion),
    { registrar: (e) => eventos.push(e) },
    reloj,
  );
  return { cliente, eventos };
}

const señal = () => new AbortController().signal;

describe("withTelemetry", () => {
  it("registra la latencia, los tokens y el motivo de finalización", async () => {
    const { cliente, eventos } = armar([texto("hola")]);
    await cliente.complete(unRequest(), señal());
    expect(eventos).toEqual([
      {
        evento: "llm",
        resultado: "ok",
        finishReason: "stop",
        latenciaMs: 40,
        tokensEntrada: 100,
        tokensSalida: 50,
      },
    ]);
  });

  it("registra el tipo de error y vuelve a lanzarlo", async () => {
    const { cliente, eventos } = armar([falla("rate_limited", 2000)]);
    await expect(cliente.complete(unRequest(), señal())).rejects.toMatchObject({
      kind: "rate_limited",
    });
    expect(eventos).toEqual([
      {
        evento: "llm",
        resultado: "rate_limited",
        reintentable: true,
        latenciaMs: 40,
      },
    ]);
  });

  it("distingue un error que no es del puerto", async () => {
    const { cliente, eventos } = armar([]);
    await expect(cliente.complete(unRequest(), señal())).rejects.toThrow();
    expect(eventos[0]).toMatchObject({
      resultado: "error_no_tipado",
      reintentable: false,
    });
  });

  it("nunca registra contenido: ni el pedido, ni el texto, ni los argumentos", async () => {
    const centinela = "contenido-del-usuario-que-no-debe-registrarse";
    const { cliente, eventos } = armar([
      texto(`respuesta con ${centinela}`),
      llamada("registrar", { dato: centinela }),
      falla("unavailable"),
    ]);
    const request = { ...unRequest(), system: centinela, context: centinela };
    request.messages = [{ role: "user", content: centinela }];

    await cliente.complete(request, señal());
    await cliente.complete(request, señal());
    await cliente.complete(request, señal()).catch(() => undefined);

    expect(eventos).toHaveLength(3);
    expect(JSON.stringify(eventos)).not.toContain(centinela);
  });
});
