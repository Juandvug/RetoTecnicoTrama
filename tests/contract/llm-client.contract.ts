import { describe, expect, it } from "vitest";

import {
  LlmError,
  plazoVencido,
  type LlmClient,
  type LlmErrorKind,
  type LlmRequest,
} from "@/server/llm/port";

// Suite de contrato del puerto LlmClient (ADR-0002). Se ejecuta contra cada
// implementación: hoy FakeLlmClient; el OpenAiLlmClient entra con su fábrica,
// que arma el cliente de modo que reciba la respuesta del caso (con un fetch
// inyectado y respuestas grabadas).

export type CasoDeContrato =
  | { tipo: "texto"; texto: string }
  | { tipo: "tool_call"; nombre: string; argumentos: string }
  | { tipo: "rechazo"; mensaje: string }
  | { tipo: "truncada" }
  | { tipo: "error"; kind: LlmErrorKind; retryAfterMs?: number }
  /** El proveedor no responde hasta que se aborta la señal. */
  | { tipo: "colgado" };

export type FabricaDeCliente = (caso: CasoDeContrato) => LlmClient;

export const unRequest = (): LlmRequest => ({
  system: "Sos un asistente.",
  context: "<contexto_del_turno>\nfase: delimitar\n</contexto_del_turno>",
  messages: [{ role: "user", content: "Hola" }],
  tools: [
    {
      name: "registrar",
      description: "Registra algo.",
      parameters: {
        type: "object",
        properties: { dato: { type: "string" } },
        required: ["dato"],
        additionalProperties: false,
      },
    },
  ],
  toolChoice: "auto",
  maxOutputTokens: 500,
});

const señal = () => new AbortController().signal;

export function describeLlmClientContract(
  nombre: string,
  fabrica: FabricaDeCliente,
) {
  describe(`contrato del puerto LlmClient · ${nombre}`, () => {
    it("devuelve el texto de una respuesta normal", async () => {
      const r = await fabrica({
        tipo: "texto",
        texto: "¿Qué decisión querés tomar?",
      }).complete(unRequest(), señal());
      expect(r).toMatchObject({
        text: "¿Qué decisión querés tomar?",
        toolCalls: [],
        refusal: null,
        finishReason: "stop",
      });
    });

    it("informa el uso de tokens cuando el proveedor lo da", async () => {
      const r = await fabrica({ tipo: "texto", texto: "Hola" }).complete(
        unRequest(),
        señal(),
      );
      expect(r.usage).toEqual({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
      });
    });

    it("devuelve una tool call con los argumentos crudos, sin interpretarlos", async () => {
      const argumentos = '{"dato": "valor",  "extra":[1,2]}';
      const r = await fabrica({
        tipo: "tool_call",
        nombre: "registrar",
        argumentos,
      }).complete(unRequest(), señal());
      expect(r.finishReason).toBe("tool_calls");
      expect(r.toolCalls).toEqual([
        {
          id: expect.stringMatching(/\S/),
          name: "registrar",
          arguments: argumentos,
        },
      ]);
    });

    it("devuelve el rechazo del modelo sin texto", async () => {
      const r = await fabrica({
        tipo: "rechazo",
        mensaje: "No puedo ayudar con eso.",
      }).complete(unRequest(), señal());
      expect(r.refusal).toBe("No puedo ayudar con eso.");
      expect(r.text ?? "").toBe("");
      expect(r.toolCalls).toEqual([]);
    });

    it("marca la respuesta truncada por el tope de tokens", async () => {
      const r = await fabrica({ tipo: "truncada" }).complete(
        unRequest(),
        señal(),
      );
      expect(r.finishReason).toBe("length");
    });

    describe("errores normalizados", () => {
      it.each([
        ["rate_limited", true, 3000],
        ["quota_exceeded", false, undefined],
        ["unavailable", true, undefined],
        ["timeout", true, undefined],
        ["auth", false, undefined],
        ["bad_request", false, undefined],
      ] as const)(
        "%s (reintentable: %s)",
        async (kind, retryable, retryAfterMs) => {
          const cliente = fabrica({ tipo: "error", kind, retryAfterMs });
          const error = await cliente
            .complete(unRequest(), señal())
            .catch((e: unknown) => e);

          expect(error).toBeInstanceOf(LlmError);
          expect(error).toMatchObject({ kind, retryable });
          expect((error as LlmError).retryAfterMs).toBe(retryAfterMs);
        },
      );
    });

    describe("cancelación", () => {
      it("falla con aborted, sin reintento, si la señal ya estaba abortada", async () => {
        const controlador = new AbortController();
        controlador.abort();
        const error = await fabrica({ tipo: "texto", texto: "x" })
          .complete(unRequest(), controlador.signal)
          .catch((e: unknown) => e);
        expect(error).toMatchObject({ kind: "aborted", retryable: false });
      });

      it("falla con aborted si el usuario cancela mientras espera al proveedor", async () => {
        const controlador = new AbortController();
        const pendiente = fabrica({ tipo: "colgado" })
          .complete(unRequest(), controlador.signal)
          .catch((e: unknown) => e);
        controlador.abort();
        expect(await pendiente).toMatchObject({
          kind: "aborted",
          retryable: false,
        });
      });

      it("falla con timeout si la señal venció por un plazo", async () => {
        const controlador = new AbortController();
        const pendiente = fabrica({ tipo: "colgado" })
          .complete(unRequest(), controlador.signal)
          .catch((e: unknown) => e);
        controlador.abort(plazoVencido());
        expect(await pendiente).toMatchObject({
          kind: "timeout",
          retryable: true,
        });
      });
    });
  });
}
