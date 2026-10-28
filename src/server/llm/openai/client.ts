import "server-only";

import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";

import {
  errorDeAbort,
  LlmError,
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
    finishReason: FINISH_REASONS[choice.finish_reason] ?? "other",
    usage: completion.usage
      ? {
          inputTokens: completion.usage.prompt_tokens,
          outputTokens: completion.usage.completion_tokens,
        }
      : null,
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
      return respuesta(
        await this.sdk.chat.completions.create(cuerpo, { signal }),
      );
    } catch (error) {
      throw traducirError(error, signal);
    }
  }
}
