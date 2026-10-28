import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conDemora,
  FakeLlmClient,
  falla,
  texto,
  type PasoFake,
} from "@/server/llm/fake/client";
import { withRetry } from "@/server/llm/retry";
import { unRequest } from "@tests/contract/llm-client.contract";

// Con azar() = 0 el backoff es el 50 % del valor: 250 ms, 500 ms…
const sinAzar = () => 0;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function armar(guion: PasoFake[], opciones = {}) {
  const fake = new FakeLlmClient(guion);
  const cliente = withRetry(fake, { azar: sinAzar, ...opciones });
  const controlador = new AbortController();
  const llamar = (options?: { deadline?: number }) =>
    cliente.complete(unRequest(), controlador.signal, options).then(
      (r) => ({ ok: true as const, r }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  return { fake, llamar, controlador };
}

describe("withRetry", () => {
  it("reintenta un error reintentable y devuelve el éxito", async () => {
    const { fake, llamar } = armar([falla("timeout"), texto("listo")]);
    const resultado = llamar();
    await vi.advanceTimersByTimeAsync(250);
    expect(await resultado).toMatchObject({ ok: true, r: { text: "listo" } });
    expect(fake.llamadas).toBe(2);
  });

  it.each(["timeout", "rate_limited", "unavailable"] as const)(
    "reintenta %s",
    async (kind) => {
      const { fake, llamar } = armar([falla(kind), texto("listo")]);
      const resultado = llamar();
      await vi.advanceTimersByTimeAsync(250);
      expect((await resultado).ok).toBe(true);
      expect(fake.llamadas).toBe(2);
    },
  );

  it("hace como máximo 2 reintentos y entonces falla con el último error", async () => {
    const { fake, llamar } = armar([
      falla("unavailable"),
      falla("unavailable"),
      falla("unavailable"),
      texto("nunca llega"),
    ]);
    const resultado = llamar();
    await vi.advanceTimersByTimeAsync(250 + 500);
    expect(await resultado).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
    expect(fake.llamadas).toBe(3);
  });

  it.each(["quota_exceeded", "auth", "bad_request", "unknown"] as const)(
    "no reintenta %s",
    async (kind) => {
      const { fake, llamar } = armar([falla(kind), texto("no")]);
      expect(await llamar()).toMatchObject({ ok: false, error: { kind } });
      expect(fake.llamadas).toBe(1);
    },
  );

  it("no reintenta si el usuario canceló", async () => {
    const { fake, llamar, controlador } = armar([
      conDemora(5000, texto("lenta")),
      texto("no"),
    ]);
    const resultado = llamar();
    await vi.advanceTimersByTimeAsync(1000);
    controlador.abort();
    expect(await resultado).toMatchObject({
      ok: false,
      error: { kind: "aborted" },
    });
    expect(fake.llamadas).toBe(1);
  });

  it("se detiene de inmediato si se cancela mientras espera el backoff", async () => {
    const { fake, llamar, controlador } = armar([
      falla("unavailable"),
      texto("no"),
    ]);
    const resultado = llamar();
    await vi.advanceTimersByTimeAsync(100); // dentro de la espera de 250 ms
    controlador.abort();
    expect(await resultado).toMatchObject({
      ok: false,
      error: { kind: "aborted" },
    });
    expect(fake.llamadas).toBe(1);
  });

  it("no empieza si la señal ya estaba cancelada", async () => {
    const { fake, llamar, controlador } = armar([texto("no")]);
    controlador.abort();
    expect(await llamar()).toMatchObject({
      ok: false,
      error: { kind: "aborted" },
    });
    expect(fake.llamadas).toBe(0);
  });

  describe("espera", () => {
    it("crece de forma exponencial con jitter", async () => {
      // azar = 1 da el valor completo: 500 ms y 1000 ms.
      const { fake, llamar } = armar(
        [falla("unavailable"), falla("unavailable"), texto("listo")],
        { azar: () => 1 },
      );
      const resultado = llamar();
      await vi.advanceTimersByTimeAsync(499);
      expect(fake.llamadas).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fake.llamadas).toBe(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(fake.llamadas).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect((await resultado).ok).toBe(true);
      expect(fake.llamadas).toBe(3);
    });

    it("respeta retryAfterMs en lugar del backoff", async () => {
      const { fake, llamar } = armar([
        falla("rate_limited", 3000),
        texto("listo"),
      ]);
      const resultado = llamar();
      await vi.advanceTimersByTimeAsync(2999);
      expect(fake.llamadas).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await resultado).ok).toBe(true);
      expect(fake.llamadas).toBe(2);
    });
  });

  describe("plazo del turno", () => {
    it("no espera un retryAfterMs que no cabe en el plazo", async () => {
      const { fake, llamar } = armar([
        falla("rate_limited", 3000),
        texto("no"),
      ]);
      const resultado = await llamar({ deadline: Date.now() + 2000 });
      expect(resultado).toMatchObject({
        ok: false,
        error: { kind: "rate_limited" },
      });
      expect(fake.llamadas).toBe(1);
    });

    it("tampoco espera el backoff si no cabe", async () => {
      const { fake, llamar } = armar([falla("unavailable"), texto("no")]);
      const resultado = await llamar({ deadline: Date.now() + 200 });
      expect(resultado.ok).toBe(false);
      expect(fake.llamadas).toBe(1);
    });

    it("reintenta si la espera cabe en el plazo", async () => {
      const { llamar } = armar([falla("rate_limited", 3000), texto("listo")]);
      const resultado = llamar({ deadline: Date.now() + 10_000 });
      await vi.advanceTimersByTimeAsync(3000);
      expect((await resultado).ok).toBe(true);
    });
  });

  describe("plazo de cada intento", () => {
    it("cancela un intento que tarda más del plazo y lo reintenta", async () => {
      const { fake, llamar } = armar(
        [conDemora(60_000, texto("lenta")), texto("rápida")],
        { plazoPorIntentoMs: 25_000 },
      );
      const resultado = llamar();
      await vi.advanceTimersByTimeAsync(25_000 + 250);
      expect(await resultado).toMatchObject({
        ok: true,
        r: { text: "rápida" },
      });
      expect(fake.llamadas).toBe(2);
    });

    it("si todos los intentos vencen, falla con timeout", async () => {
      const { llamar } = armar(
        [
          conDemora(60_000, texto("a")),
          conDemora(60_000, texto("b")),
          conDemora(60_000, texto("c")),
        ],
        { plazoPorIntentoMs: 1000 },
      );
      const resultado = llamar();
      await vi.advanceTimersByTimeAsync(1000 + 250 + 1000 + 500 + 1000);
      expect(await resultado).toMatchObject({
        ok: false,
        error: { kind: "timeout" },
      });
    });
  });

  it("deja pasar sin tocar un error que no es de LlmError", async () => {
    const { llamar } = armar([]); // el guion vacío lanza un Error común
    const resultado = await llamar();
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect((resultado.error as Error).message).toContain("guion");
  });
});
