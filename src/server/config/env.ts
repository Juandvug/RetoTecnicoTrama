import "server-only";

import { z } from "zod";

import type { UmbralesDeFase } from "@/domain/session";

// Variables de entorno (ARCHITECTURE §11), validadas con Zod. Si alguna es
// inválida, el servidor no arranca: así el control de acceso no puede quedar
// apagado por olvido. Los errores nombran las variables, nunca sus valores.

export const LARGO_MINIMO_CODIGO = 8;
export const BYTES_MINIMOS_SECRETO = 32;

const vacioComoAusente = (v: unknown) => (v === "" ? undefined : v);
const opcional = <T extends z.ZodType>(s: T) =>
  z.preprocess(vacioComoAusente, s.optional());
const entero = (porDefecto: number) =>
  z.preprocess(
    vacioComoAusente,
    z.coerce.number().int().positive().default(porDefecto),
  );

const EnvSchema = z
  .object({
    NODE_ENV: opcional(z.string()),
    VERCEL_ENV: opcional(z.enum(["production", "preview", "development"])),
    OPENAI_API_KEY: opcional(z.string()),
    LLM_PROVIDER: z.preprocess(
      vacioComoAusente,
      z.enum(["openai", "fake"]).default("openai"),
    ),
    LLM_MODEL: opcional(z.string()),
    LLM_MAX_OUTPUT_TOKENS: entero(4096),
    ACCESS_CODE: opcional(z.string()),
    SESSION_SECRET: opcional(z.string()),
    UPSTASH_REDIS_REST_URL: opcional(z.url()),
    UPSTASH_REDIS_REST_TOKEN: opcional(z.string()),
    RATE_LIMIT_SESSION: entero(50),
    RATE_LIMIT_IP: entero(60),
    RATE_LIMIT_GLOBAL: entero(1000),
    MAX_MENSAJES_DELIMITAR: entero(3),
    MAX_TURNOS_SIN_VERSION: entero(3),
    FAKE_LLM_SCENARIO: opcional(z.string()),
  })
  .superRefine((e, ctx) => {
    const falta = (variable: string, mensaje = "es obligatoria") =>
      ctx.addIssue({ code: "custom", path: [variable], message: mensaje });
    const produccion = e.VERCEL_ENV === "production";

    if (!e.ACCESS_CODE) falta("ACCESS_CODE");
    else if (e.ACCESS_CODE.length < LARGO_MINIMO_CODIGO)
      falta(
        "ACCESS_CODE",
        `tiene que tener al menos ${LARGO_MINIMO_CODIGO} caracteres`,
      );

    if (!e.SESSION_SECRET) falta("SESSION_SECRET");
    else if (Buffer.byteLength(e.SESSION_SECRET) < BYTES_MINIMOS_SECRETO)
      falta(
        "SESSION_SECRET",
        `tiene que tener al menos ${BYTES_MINIMOS_SECRETO} bytes`,
      );

    if (e.LLM_PROVIDER === "fake") {
      if (produccion) falta("LLM_PROVIDER", "no puede ser fake en producción");
      if (!e.FAKE_LLM_SCENARIO)
        falta("FAKE_LLM_SCENARIO", "es obligatoria con LLM_PROVIDER=fake");
    } else {
      if (!e.OPENAI_API_KEY) falta("OPENAI_API_KEY");
      if (!e.LLM_MODEL) falta("LLM_MODEL");
    }

    if (produccion) {
      // En memoria, cada instancia serverless tiene su propio contador (ADR-0005).
      if (!e.UPSTASH_REDIS_REST_URL)
        falta("UPSTASH_REDIS_REST_URL", "es obligatoria en producción");
      if (!e.UPSTASH_REDIS_REST_TOKEN)
        falta("UPSTASH_REDIS_REST_TOKEN", "es obligatoria en producción");
    }
  });

export type Env = {
  produccion: boolean;
  desarrollo: boolean;
  llm: {
    provider: "openai" | "fake";
    apiKey: string | null;
    model: string | null;
    maxOutputTokens: number;
    scenario: string | null;
  };
  acceso: { codigo: string; secretoDeSesion: string };
  upstash: { url: string; token: string } | null;
  limites: { sesion: number; ip: number; global: number };
  umbrales: UmbralesDeFase;
};

export class ErrorDeConfiguracion extends Error {
  constructor(
    readonly variables: string[],
    detalle: string,
  ) {
    super(`Configuración inválida: ${detalle}`);
    this.name = "ErrorDeConfiguracion";
  }
}

export function leerEnv(fuente: Record<string, string | undefined>): Env {
  const resultado = EnvSchema.safeParse(fuente);
  if (!resultado.success) {
    // Solo el nombre de la variable y el problema: nunca el valor recibido.
    const problemas = resultado.error.issues.map((i) => ({
      variable: i.path.map(String).join("."),
      mensaje: i.code === "custom" ? i.message : "tiene un formato inválido",
    }));
    throw new ErrorDeConfiguracion(
      [...new Set(problemas.map((p) => p.variable))],
      problemas.map((p) => `${p.variable} ${p.mensaje}`).join("; "),
    );
  }

  const e = resultado.data;
  return {
    produccion: e.VERCEL_ENV === "production",
    desarrollo: e.NODE_ENV === "development",
    llm: {
      provider: e.LLM_PROVIDER,
      apiKey: e.OPENAI_API_KEY ?? null,
      model: e.LLM_MODEL ?? null,
      maxOutputTokens: e.LLM_MAX_OUTPUT_TOKENS,
      scenario: e.FAKE_LLM_SCENARIO ?? null,
    },
    // superRefine garantiza que existen.
    acceso: { codigo: e.ACCESS_CODE!, secretoDeSesion: e.SESSION_SECRET! },
    upstash:
      e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
        ? { url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }
        : null,
    limites: {
      sesion: e.RATE_LIMIT_SESSION,
      ip: e.RATE_LIMIT_IP,
      global: e.RATE_LIMIT_GLOBAL,
    },
    umbrales: {
      maxMensajesDelimitar: e.MAX_MENSAJES_DELIMITAR,
      maxTurnosSinVersion: e.MAX_TURNOS_SIN_VERSION,
    },
  };
}
