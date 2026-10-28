import "server-only";

import {
  errorDeAbort,
  esperar,
  LlmError,
  type LlmCallOptions,
  type LlmClient,
  type LlmErrorKind,
  type LlmRequest,
  type LlmResponse,
} from "@/server/llm/port";

// Cliente simulado y programable (ADR-0002, ADR-0008): es la base de los tests
// del engine y del e2e. Recibe un guion y registra cada request que recibe.

export type RespuestaFake = {
  text?: string | null;
  toolCalls?: Array<{ id?: string; name: string; arguments: string }>;
  refusal?: string | null;
  finishReason?: LlmResponse["finishReason"];
  usage?: LlmResponse["usage"];
};

/** Un paso del guion: una respuesta o un error, con una demora opcional. */
export type PasoFake = {
  respuesta: RespuestaFake | LlmError;
  demoraMs?: number;
};

export type Guion =
  | readonly PasoFake[]
  | ((request: LlmRequest, indice: number) => PasoFake | Promise<PasoFake>);

const USO_POR_DEFECTO = { inputTokens: 100, outputTokens: 50 } as const;

// --- Constructores de pasos -------------------------------------------------

export const texto = (text: string, extra: RespuestaFake = {}): PasoFake => ({
  respuesta: { text, ...extra },
});

export const llamada = (
  nombre: string,
  argumentos: object | string,
  extra: RespuestaFake = {},
): PasoFake => ({
  respuesta: {
    toolCalls: [
      {
        name: nombre,
        arguments:
          typeof argumentos === "string"
            ? argumentos
            : JSON.stringify(argumentos),
      },
    ],
    ...extra,
  },
});

/** Varias tool calls en una misma respuesta. */
export const llamadas = (
  ...calls: Array<{ nombre: string; argumentos: object | string }>
): PasoFake => ({
  respuesta: {
    toolCalls: calls.map(({ nombre, argumentos }) => ({
      name: nombre,
      arguments:
        typeof argumentos === "string"
          ? argumentos
          : JSON.stringify(argumentos),
    })),
  },
});

export const rechazo = (mensaje: string): PasoFake => ({
  respuesta: { text: null, refusal: mensaje, finishReason: "stop" },
});

/** Una respuesta cortada por el tope de tokens (`finishReason: "length"`). */
export const truncada = (parcial: string, comoLlamada?: string): PasoFake => ({
  respuesta: comoLlamada
    ? {
        toolCalls: [{ name: comoLlamada, arguments: parcial }],
        finishReason: "length",
      }
    : { text: parcial, finishReason: "length" },
});

export const falla = (kind: LlmErrorKind, retryAfterMs?: number): PasoFake => ({
  respuesta: LlmError.de(kind, retryAfterMs),
});

export const conDemora = (demoraMs: number, paso: PasoFake): PasoFake => ({
  ...paso,
  demoraMs,
});

// --- Cliente ----------------------------------------------------------------

function completar(r: RespuestaFake, indice: number): LlmResponse {
  const toolCalls = (r.toolCalls ?? []).map((c, j) => ({
    id: c.id ?? `fake_call_${indice + 1}_${j + 1}`,
    name: c.name,
    arguments: c.arguments,
  }));
  return {
    text: r.text ?? null,
    toolCalls,
    refusal: r.refusal ?? null,
    finishReason:
      r.finishReason ?? (toolCalls.length > 0 ? "tool_calls" : "stop"),
    usage: r.usage === undefined ? { ...USO_POR_DEFECTO } : r.usage,
  };
}

export class FakeLlmClient implements LlmClient {
  /** Copia de cada request recibido, en orden, para hacer aserciones sobre ellos. */
  readonly requests: LlmRequest[] = [];
  readonly opciones: Array<LlmCallOptions | undefined> = [];

  constructor(private readonly guion: Guion = []) {}

  get llamadas(): number {
    return this.requests.length;
  }

  async complete(
    request: LlmRequest,
    signal: AbortSignal,
    options?: LlmCallOptions,
  ): Promise<LlmResponse> {
    if (signal.aborted) throw errorDeAbort(signal);

    const indice = this.requests.length;
    this.requests.push(structuredClone(request));
    this.opciones.push(options);

    const paso =
      typeof this.guion === "function"
        ? await this.guion(request, indice)
        : this.guion[indice];
    if (!paso) {
      // No es un LlmError: un guion corto es un error del test, no del proveedor.
      throw new Error(
        `El guion del fake no tiene una respuesta para la llamada ${indice + 1}.`,
      );
    }

    if (paso.demoraMs) await esperar(paso.demoraMs, signal);
    if (paso.respuesta instanceof LlmError) throw paso.respuesta;
    return completar(paso.respuesta, indice);
  }
}
