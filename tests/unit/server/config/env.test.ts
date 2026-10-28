import { describe, expect, it } from "vitest";

import { ErrorDeConfiguracion, leerEnv } from "@/server/config/env";
import { CENTINELA, CODIGO, FIRMA } from "@tests/fixtures/http";

const base = (cambios: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "development",
  LLM_PROVIDER: "fake",
  FAKE_LLM_SCENARIO: "ejemplo",
  ACCESS_CODE: CODIGO,
  SESSION_SECRET: FIRMA,
  ...cambios,
});

const produccion = (cambios: Record<string, string | undefined> = {}) =>
  base({
    VERCEL_ENV: "production",
    NODE_ENV: "production",
    LLM_PROVIDER: "openai",
    OPENAI_API_KEY: CENTINELA,
    LLM_MODEL: "un-modelo",
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "t".repeat(20),
    ...cambios,
  });

function fallaCon(
  fuente: Record<string, string | undefined>,
): ErrorDeConfiguracion {
  try {
    leerEnv(fuente);
  } catch (error) {
    if (error instanceof ErrorDeConfiguracion) return error;
    throw error;
  }
  throw new Error("Se esperaba un ErrorDeConfiguracion.");
}

describe("leerEnv", () => {
  it("lee una configuración de desarrollo con el fake y aplica los valores por defecto", () => {
    expect(leerEnv(base())).toEqual({
      produccion: false,
      desarrollo: true,
      llm: {
        provider: "fake",
        apiKey: null,
        model: null,
        maxOutputTokens: 4096,
        scenario: "ejemplo",
      },
      acceso: { codigo: CODIGO, secretoDeSesion: FIRMA },
      upstash: null,
      limites: { sesion: 50, ip: 60, global: 1000 },
      umbrales: { maxMensajesDelimitar: 3, maxTurnosSinVersion: 3 },
    });
  });

  it("lee una configuración de producción completa", () => {
    const env = leerEnv(produccion({ RATE_LIMIT_GLOBAL: "300" }));
    expect(env.produccion).toBe(true);
    expect(env.upstash).toEqual({
      url: "https://redis.test",
      token: "t".repeat(20),
    });
    expect(env.limites.global).toBe(300);
  });

  it("trata las variables vacías como ausentes, como las deja .env.example", () => {
    const env = leerEnv(
      base({ RATE_LIMIT_IP: "", LLM_MODEL: "", UPSTASH_REDIS_REST_URL: "" }),
    );
    expect(env.limites.ip).toBe(60);
    expect(env.llm.model).toBeNull();
    expect(env.upstash).toBeNull();
  });

  describe("el control de acceso no puede quedar apagado", () => {
    it.each([
      ["sin ACCESS_CODE", { ACCESS_CODE: undefined }, "ACCESS_CODE"],
      ["con ACCESS_CODE vacío", { ACCESS_CODE: "" }, "ACCESS_CODE"],
      ["con un ACCESS_CODE corto", { ACCESS_CODE: "1234" }, "ACCESS_CODE"],
      ["sin SESSION_SECRET", { SESSION_SECRET: undefined }, "SESSION_SECRET"],
      [
        "con un SESSION_SECRET de menos de 32 bytes",
        { SESSION_SECRET: "x".repeat(31) },
        "SESSION_SECRET",
      ],
    ])("falla %s, también fuera de producción", (_, cambios, variable) => {
      expect(fallaCon(base(cambios)).variables).toContain(variable);
      expect(fallaCon(produccion(cambios)).variables).toContain(variable);
    });
  });

  describe("reglas de producción", () => {
    it("prohíbe el LLM simulado", () => {
      const error = fallaCon(produccion({ LLM_PROVIDER: "fake" }));
      expect(error.message).toMatch(
        /LLM_PROVIDER no puede ser fake en producción/,
      );
    });

    it.each(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])(
      "exige %s",
      (variable) => {
        expect(
          fallaCon(produccion({ [variable]: undefined })).variables,
        ).toEqual([variable]);
      },
    );

    it("permite el fake en preview y en desarrollo", () => {
      expect(() => leerEnv(base({ VERCEL_ENV: "preview" }))).not.toThrow();
    });
  });

  it("con OpenAI exige la key y el modelo", () => {
    const error = fallaCon(base({ LLM_PROVIDER: "openai" }));
    expect(error.variables).toEqual(["OPENAI_API_KEY", "LLM_MODEL"]);
  });

  it("con el fake exige el escenario", () => {
    expect(fallaCon(base({ FAKE_LLM_SCENARIO: undefined })).variables).toEqual([
      "FAKE_LLM_SCENARIO",
    ]);
  });

  it("rechaza números inválidos y un proveedor desconocido", () => {
    expect(fallaCon(base({ RATE_LIMIT_SESSION: "-3" })).variables).toEqual([
      "RATE_LIMIT_SESSION",
    ]);
    expect(fallaCon(base({ LLM_PROVIDER: "otro" })).variables).toEqual([
      "LLM_PROVIDER",
    ]);
  });

  it("el error nombra las variables pero nunca sus valores", () => {
    const error = fallaCon(
      produccion({
        UPSTASH_REDIS_REST_URL: `no-es-una-url-${CENTINELA}`,
        ACCESS_CODE: "corto",
      }),
    );
    expect(error.message).toContain("UPSTASH_REDIS_REST_URL");
    expect(error.message).toContain("ACCESS_CODE");
    expect(error.message).not.toContain(CENTINELA);
    expect(error.message).not.toContain("corto");
    expect(JSON.stringify(error)).not.toContain(CENTINELA);
  });
});
