import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conDemora,
  FakeLlmClient,
  falla,
  llamada,
  llamadas,
  rechazo,
  texto,
  truncada,
} from "@/server/llm/fake/client";
import { cargarEscenario, parsearEscenario } from "@/server/llm/fake/scenarios";
import { LlmError } from "@/server/llm/port";
import { unRequest } from "@tests/contract/llm-client.contract";

const señal = () => new AbortController().signal;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("FakeLlmClient", () => {
  it("devuelve las respuestas del guion en orden", async () => {
    const fake = new FakeLlmClient([texto("uno"), texto("dos")]);
    expect((await fake.complete(unRequest(), señal())).text).toBe("uno");
    expect((await fake.complete(unRequest(), señal())).text).toBe("dos");
  });

  it("acepta una función de la request y del número de llamada", async () => {
    const fake = new FakeLlmClient((request, indice) =>
      texto(`${request.messages.length} mensajes, llamada ${indice}`),
    );
    expect((await fake.complete(unRequest(), señal())).text).toBe(
      "1 mensajes, llamada 0",
    );
  });

  it("registra una copia de cada request", async () => {
    const fake = new FakeLlmClient([texto("a"), texto("b")]);
    const request = unRequest();
    await fake.complete(request, señal(), { deadline: 5000 });
    request.messages.push({ role: "user", content: "después" }); // no afecta lo registrado
    await fake.complete(unRequest(), señal());

    expect(fake.llamadas).toBe(2);
    expect(fake.requests[0]?.messages).toHaveLength(1);
    expect(fake.opciones).toEqual([{ deadline: 5000 }, undefined]);
  });

  it("completa los ids de las tool calls y el motivo de finalización", async () => {
    const fake = new FakeLlmClient([
      llamada("registrar", { dato: "x" }),
      llamadas(
        { nombre: "registrar", argumentos: { dato: "1" } },
        { nombre: "registrar", argumentos: "{}" },
      ),
    ]);
    const una = await fake.complete(unRequest(), señal());
    expect(una.toolCalls).toEqual([
      { id: "fake_call_1_1", name: "registrar", arguments: '{"dato":"x"}' },
    ]);
    expect(una.finishReason).toBe("tool_calls");

    const dos = await fake.complete(unRequest(), señal());
    expect(dos.toolCalls.map((c) => c.id)).toEqual([
      "fake_call_2_1",
      "fake_call_2_2",
    ]);
  });

  it("modela rechazos, respuestas truncadas y errores", async () => {
    const fake = new FakeLlmClient([
      rechazo("No."),
      truncada('{"a":', "registrar"),
      truncada("Hola, te cuento que"),
      falla("rate_limited", 1500),
    ]);
    expect(await fake.complete(unRequest(), señal())).toMatchObject({
      refusal: "No.",
      text: null,
    });
    expect(await fake.complete(unRequest(), señal())).toMatchObject({
      finishReason: "length",
      toolCalls: [{ arguments: '{"a":' }],
    });
    expect(await fake.complete(unRequest(), señal())).toMatchObject({
      finishReason: "length",
      text: "Hola, te cuento que",
    });
    await expect(fake.complete(unRequest(), señal())).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 1500,
    });
  });

  it("falla con un Error común, no con un LlmError, cuando el guion se agota", async () => {
    const fake = new FakeLlmClient([texto("única")]);
    await fake.complete(unRequest(), señal());
    const error = await fake
      .complete(unRequest(), señal())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(LlmError);
    expect((error as Error).message).toContain("llamada 2");
  });

  it("no registra la request si la señal ya estaba abortada", async () => {
    const fake = new FakeLlmClient([texto("x")]);
    await expect(
      fake.complete(unRequest(), AbortSignal.abort()),
    ).rejects.toMatchObject({
      kind: "aborted",
    });
    expect(fake.llamadas).toBe(0);
  });

  it("respeta la demora y se corta si se aborta mientras espera", async () => {
    const fake = new FakeLlmClient([
      conDemora(2000, texto("lenta")),
      conDemora(2000, texto("x")),
    ]);
    let respuesta: string | null = null;
    const pendiente = fake
      .complete(unRequest(), señal())
      .then((r) => (respuesta = r.text));
    await vi.advanceTimersByTimeAsync(1999);
    expect(respuesta).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await pendiente;
    expect(respuesta).toBe("lenta");

    const controlador = new AbortController();
    const cortada = fake
      .complete(unRequest(), controlador.signal)
      .catch((e: unknown) => e);
    controlador.abort();
    expect(await cortada).toMatchObject({ kind: "aborted" });
  });
});

describe("escenarios JSON", () => {
  it("carga un escenario y lo convierte en un guion", async () => {
    const fake = new FakeLlmClient(cargarEscenario("ejemplo"));
    expect((await fake.complete(unRequest(), señal())).text).toBe(
      "¿Qué decisión querés tomar con esto?",
    );
    expect(
      (await fake.complete(unRequest(), señal())).toolCalls[0],
    ).toMatchObject({
      name: "registrar",
      arguments: '{"dato":"valor"}',
    });
    await fake.complete(unRequest(), señal());
    expect((await fake.complete(unRequest(), señal())).refusal).toBe(
      "No puedo ayudar con eso.",
    );
    expect((await fake.complete(unRequest(), señal())).finishReason).toBe(
      "length",
    );
    await expect(fake.complete(unRequest(), señal())).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 2000,
    });
  });

  it("aplica la demora del escenario", async () => {
    const fake = new FakeLlmClient(
      parsearEscenario([{ texto: "tarde", demoraMs: 1500 }]),
    );
    let listo = false;
    const pendiente = fake
      .complete(unRequest(), señal())
      .then(() => (listo = true));
    await vi.advanceTimersByTimeAsync(1499);
    expect(listo).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pendiente;
    expect(listo).toBe(true);
  });

  it.each(["../ejemplo", "ejemplo.json", "Ejemplo", "a/b", "", "-x"])(
    "rechaza el nombre %j, que podría salirse del directorio",
    (nombre) => {
      expect(() => cargarEscenario(nombre)).toThrow(/inválido/);
    },
  );

  it("informa un escenario que no existe", () => {
    expect(() => cargarEscenario("no-existe")).toThrow(
      /No existe el escenario/,
    );
  });

  it.each([
    ["una lista vacía", []],
    ["un paso desconocido", [{ saludo: "hola" }]],
    ["un paso con campos de más", [{ texto: "a", extra: 1 }]],
    ["un error de un tipo desconocido", [{ error: { kind: "raro" } }]],
  ])("rechaza %s", (_, json) => {
    expect(() => parsearEscenario(json)).toThrow();
  });
});
