import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conPlazo,
  errorDeAbort,
  esperar,
  LlmError,
  plazoVencido,
} from "@/server/llm/port";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("LlmError", () => {
  it.each([
    ["timeout", true],
    ["rate_limited", true],
    ["unavailable", true],
    ["quota_exceeded", false],
    ["auth", false],
    ["bad_request", false],
    ["aborted", false],
    ["unknown", false],
  ] as const)("%s es reintentable: %s", (kind, retryable) => {
    expect(LlmError.de(kind)).toMatchObject({ kind, retryable });
  });

  it("guarda cuánto esperar y es un Error con el tipo por mensaje", () => {
    const error = LlmError.de("rate_limited", 4000);
    expect(error).toBeInstanceOf(Error);
    expect(error.retryAfterMs).toBe(4000);
    expect(error.message).toBe("rate_limited");
  });
});

describe("errorDeAbort", () => {
  it("es timeout cuando la señal venció por un plazo", () => {
    expect(errorDeAbort(AbortSignal.abort(plazoVencido()))).toMatchObject({
      kind: "timeout",
      retryable: true,
    });
  });

  it("es aborted cuando cancela el usuario", () => {
    expect(errorDeAbort(AbortSignal.abort())).toMatchObject({
      kind: "aborted",
      retryable: false,
    });
  });
});

describe("conPlazo", () => {
  it("aborta con TimeoutError al pasar el plazo", () => {
    const { signal } = conPlazo(new AbortController().signal, 1000);
    vi.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    expect(errorDeAbort(signal).kind).toBe("timeout");
  });

  it("propaga la cancelación de la señal original, con su motivo", () => {
    const origen = new AbortController();
    const { signal } = conPlazo(origen.signal, 1000);
    origen.abort();
    expect(signal.aborted).toBe(true);
    expect(errorDeAbort(signal).kind).toBe("aborted");
  });

  it("nace abortada si la original ya lo estaba", () => {
    expect(conPlazo(AbortSignal.abort(), 1000).signal.aborted).toBe(true);
  });

  it("limpiar cancela el plazo", () => {
    const { signal, limpiar } = conPlazo(new AbortController().signal, 1000);
    limpiar();
    vi.advanceTimersByTime(5000);
    expect(signal.aborted).toBe(false);
  });
});

describe("esperar", () => {
  it("resuelve pasado el tiempo", async () => {
    let listo = false;
    const espera = esperar(500, new AbortController().signal).then(
      () => (listo = true),
    );
    await vi.advanceTimersByTimeAsync(499);
    expect(listo).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await espera;
    expect(listo).toBe(true);
  });

  it("falla de inmediato si la señal se aborta", async () => {
    const controlador = new AbortController();
    const espera = esperar(60_000, controlador.signal).catch((e: unknown) => e);
    controlador.abort();
    expect(await espera).toMatchObject({ kind: "aborted" });
  });

  it("falla sin esperar si la señal ya estaba abortada", async () => {
    await expect(esperar(60_000, AbortSignal.abort())).rejects.toMatchObject({
      kind: "aborted",
    });
  });
});
