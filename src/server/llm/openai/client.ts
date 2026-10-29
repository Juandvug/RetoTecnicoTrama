import "server-only";

import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";

import {
  errorDeAbort,
  LlmError,
  type LlmCallOptions,
  type LlmClient,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmToolChoice,
} from "@/server/llm/port";
import { traducirError } from "./errors";
import { adaptarEsquemaEstricto } from "./strict-schema";

// OpenAiLlmClient (ADR-0002): único módulo que usa el SDK. Traduce el puerto a
// Chat Completions. Reintentos y plazos son política nuestra, así que el SDK va
// con maxRetries: 0 y sin timeout propio.

export type EsfuerzoDeRazonamiento = "minimal" | "low" | "medium" | "high";

export type OpenAiOptions = {
  apiKey: string;
  model: string;
  /** Para los tests: respuestas grabadas sin red. */
  fetch?: typeof fetch;
  /** Los modelos de razonamiento gastan tokens pensando: menos esfuerzo, menos costo y latencia. */
  reasoningEffort?: EsfuerzoDeRazonamiento;
};

const FINISH_REASONS: Record<string, LlmResponse["finishReason"]> = {
  stop: "stop",
  tool_calls: "tool_calls",
  length: "length",
  content_filter: "content_filter",
};

function mensajes(request: LlmRequest): ChatCompletionMessageParam[] {
  // El prefijo estático va primero para aprovechar el prompt caching.
  const traducidos: ChatCompletionMessageParam[] = [
    { role: "system", content: request.system },
    { role: "system", content: request.context },
  ];
  for (const m of request.messages satisfies LlmMessage[]) {
    if (m.role === "user") {
      traducidos.push({ role: "user", content: m.content });
    } else if (m.role === "tool") {
      traducidos.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      });
    } else {
      traducidos.push({
        role: "assistant",
        content: m.content,
        ...(m.toolCalls.length > 0 && {
          tool_calls: m.toolCalls.map((t) => ({
            id: t.id,
            type: "function" as const,
            function: { name: t.name, arguments: t.arguments },
          })),
        }),
      });
    }
  }
  return traducidos;
}

function eleccion(toolChoice: LlmToolChoice): ChatCompletionToolChoiceOption {
  return typeof toolChoice === "string"
    ? toolChoice
    : { type: "function", function: { name: toolChoice.name } };
}

function respuesta(completion: ChatCompletion): LlmResponse {
  const choice = completion.choices[0];
  if (!choice) throw LlmError.de("unknown");
  const { message } = choice;
  return {
    text: message.content ?? null,
    toolCalls: (message.tool_calls ?? []).flatMap((t) =>
      t.type === "function"
        ? [{ id: t.id, name: t.function.name, arguments: t.function.arguments }]
        : [],
    ),
    refusal: message.refusal ?? null,
    finishReason: finishReason(choice.finish_reason),
    usage: completion.usage
      ? {
          inputTokens: completion.usage.prompt_tokens,
          outputTokens: completion.usage.completion_tokens,
        }
      : null,
  };
}

const finishReason = (razon: string | null | undefined) =>
  (razon && FINISH_REASONS[razon]) || "other";

/** Arma la respuesta completa a partir de los fragmentos de un stream. */
async function transmitir(
  fragmentos: AsyncIterable<ChatCompletionChunk>,
  alTexto: (delta: string) => void,
): Promise<LlmResponse> {
  let texto = "";
  let rechazo = "";
  let razon: string | null = null;
  let usage: LlmResponse["usage"] = null;
  const llamadas = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  for await (const fragmento of fragmentos) {
    // Con include_usage, el último fragmento trae el uso y ningún choice.
    if (fragmento.usage) {
      usage = {
        inputTokens: fragmento.usage.prompt_tokens,
        outputTokens: fragmento.usage.completion_tokens,
      };
    }
    const choice = fragmento.choices[0];
    if (!choice) continue;
    const { delta } = choice;
    if (delta.content) {
      texto += delta.content;
      alTexto(delta.content);
    }
    if (delta.refusal) rechazo += delta.refusal;
    for (const parte of delta.tool_calls ?? []) {
      const actual = llamadas.get(parte.index) ?? {
        id: "",
        name: "",
        arguments: "",
      };
      if (parte.id) actual.id = parte.id;
      if (parte.function?.name) actual.name += parte.function.name;
      if (parte.function?.arguments)
        actual.arguments += parte.function.arguments;
      llamadas.set(parte.index, actual);
    }
    if (choice.finish_reason) razon = choice.finish_reason;
  }

  return {
    text: texto || null,
    toolCalls: [...llamadas.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, llamada]) => llamada),
    refusal: rechazo || null,
    finishReason: finishReason(razon),
    usage,
  };
}

export class OpenAiLlmClient implements LlmClient {
  private readonly sdk: OpenAI;
  private readonly model: string;
  private readonly reasoningEffort: EsfuerzoDeRazonamiento;

  constructor(opciones: OpenAiOptions) {
    this.model = opciones.model;
    this.reasoningEffort = opciones.reasoningEffort ?? "low";
    this.sdk = new OpenAI({
      apiKey: opciones.apiKey,
      fetch: opciones.fetch,
      maxRetries: 0,
    });
  }

  async complete(
    request: LlmRequest,
    signal: AbortSignal,
    options?: LlmCallOptions,
  ): Promise<LlmResponse> {
    if (signal.aborted) throw errorDeAbort(signal);

    const tieneTools = request.tools.length > 0;
    const cuerpo: ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages: mensajes(request),
      max_completion_tokens: request.maxOutputTokens,
      reasoning_effort: this.reasoningEffort,
      ...(tieneTools && {
        tools: request.tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: adaptarEsquemaEstricto(t.parameters),
            strict: true,
          },
        })),
        tool_choice: eleccion(request.toolChoice),
        parallel_tool_calls: false,
      }),
    };

    try {
      const alTexto = options?.onTextDelta;
      if (alTexto) {
        const flujo = await this.sdk.chat.completions.create(
          { ...cuerpo, stream: true, stream_options: { include_usage: true } },
          { signal },
        );
        return await transmitir(flujo, alTexto);
      }
      return respuesta(
        await this.sdk.chat.completions.create(cuerpo, { signal }),
      );
    } catch (error) {
      throw traducirError(error, signal);
    }
  }
}
