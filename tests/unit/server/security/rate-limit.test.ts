import { describe, expect, it } from "vitest";

import { conAlternativa } from "@/server/security/rate-limit/fallback";
import { crearLimitadorEnMemoria } from "@/server/security/rate-limit/memory";
import {
  reglasDeLimite,
  type RateLimiter,
} from "@/server/security/rate-limit/port";
import {
  crearLimitadorUpstash,
  RedisNoDisponible,
  type LimiteDeUpstash,
} from "@/server/security/rate-limit/upstash";
import { unReloj } from "@tests/fixtures/http";

const regla = { nombre: "prueba", limite: 3, ventanaMs: 60_000 };

describe("limitador en memoria (ventana deslizante)", () => {
  it("permite hasta el límite y después rechaza con cuánto esperar", async () => {
    const reloj = unReloj();
    const limitador = crearLimitadorEnMemoria(reloj);
    const restantes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await limitador.consumir("a", regla);
      expect(r.permitido).toBe(true);
      restantes.push(r.restantes);
      reloj.avanzar(10_000);
    }
    expect(restantes).toEqual([2, 1, 0]);

    // El primero entró hace 30 s: se libera dentro de 30 s.
    expect(await limitador.consumir("a", regla)).toEqual({
      permitido: false,
      restantes: 0,
      reintentarEnMs: 30_000,
    });
  });

  it("la ventana se desliza: al vencer el más viejo se libera un lugar", async () => {
    const reloj = unReloj();
    const limitador = crearLimitadorEnMemoria(reloj);
    for (let i = 0; i < 3; i++) await limitador.consumir("a", regla);
    reloj.avanzar(60_001);
    expect((await limitador.consumir("a", regla)).permitido).toBe(true);
  });

  it("separa las claves y las reglas", async () => {
    const limitador = crearLimitadorEnMemoria(unReloj());
    for (let i = 0; i < 3; i++) await limitador.consumir("a", regla);
    expect((await limitador.consumir("b", regla)).permitido).toBe(true);
    expect(
      (await limitador.consumir("a", { ...regla, nombre: "otra" })).permitido,
    ).toBe(true);
  });
});

describe("reglas de ADR-0005", () => {
  it("usa los límites de la configuración y fija el de acceso", () => {
    expect(reglasDeLimite({ sesion: 50, ip: 60, global: 1000 })).toEqual({
      sesion: { nombre: "sesion", limite: 50, ventanaMs: 86_400_000 },
      ip: { nombre: "ip", limite: 60, ventanaMs: 3_600_000 },
      global: { nombre: "global", limite: 1000, ventanaMs: 86_400_000 },
      acceso: { nombre: "acceso", limite: 5, ventanaMs: 600_000 },
    });
  });
});

describe("adaptador de Upstash", () => {
  const conRespuesta = (r: Awaited<ReturnType<LimiteDeUpstash["limit"]>>) => {
    const claves: string[] = [];
    const creadas: string[] = [];
    const limitador = crearLimitadorUpstash(
      { url: "https://redis.test", token: "t" },
      (regla) => {
        creadas.push(regla.nombre);
        return {
          limit: async (clave) => {
            claves.push(clave);
            return r;
          },
        };
      },
      unReloj(),
    );
    return { limitador, claves, creadas };
  };

  it("traduce la respuesta de Upstash", async () => {
    const ahora = unReloj().now();
    const { limitador, claves } = conRespuesta({
      success: false,
      remaining: 0,
      reset: ahora + 12_000,
    });
    expect(await limitador.consumir("sesion-1", regla)).toEqual({
      permitido: false,
      restantes: 0,
      reintentarEnMs: 12_000,
    });
    expect(claves).toEqual(["sesion-1"]);
  });

  it("crea una instancia por regla y la reutiliza", async () => {
    const { limitador, creadas } = conRespuesta({
      success: true,
      remaining: 4,
      reset: 0,
    });
    await limitador.consumir("a", regla);
    await limitador.consumir("b", regla);
    await limitador.consumir("a", { ...regla, nombre: "otra" });
    expect(creadas).toEqual(["prueba", "otra"]);
  });

  it("trata el paso por timeout como una falla, en lugar de dejar pasar", async () => {
    const { limitador } = conRespuesta({
      success: true,
      remaining: 3,
      reset: 0,
      reason: "timeout",
    });
    await expect(limitador.consumir("a", regla)).rejects.toBeInstanceOf(
      RedisNoDisponible,
    );
  });
});

describe("alternativa si Redis falla", () => {
  const roto: RateLimiter = {
    consumir: async () => {
      throw new Error("ECONNREFUSED");
    },
  };

  it("pasa al limitador en memoria y lo registra", async () => {
    const avisos: unknown[] = [];
    const logger = {
      info: () => {},
      warn: (evento: string, campos?: unknown) =>
        avisos.push({ evento, campos }),
    };
    const limitador = conAlternativa(
      roto,
      crearLimitadorEnMemoria(unReloj()),
      logger,
    );

    for (let i = 0; i < 3; i++)
      expect((await limitador.consumir("a", regla)).permitido).toBe(true);
    // Sigue limitando: la memoria lleva la cuenta.
    expect((await limitador.consumir("a", regla)).permitido).toBe(false);
    expect(avisos[0]).toEqual({
      evento: "rate_limit_degradado",
      campos: { backend: "memoria", regla: "prueba" },
    });
  });

  it("usa el principal cuando responde", async () => {
    const principal: RateLimiter = {
      consumir: async () => ({
        permitido: false,
        restantes: 0,
        reintentarEnMs: 5,
      }),
    };
    const logger = { info: () => {}, warn: () => {} };
    const limitador = conAlternativa(
      principal,
      crearLimitadorEnMemoria(unReloj()),
      logger,
    );
    expect((await limitador.consumir("a", regla)).permitido).toBe(false);
  });
});
