import { describe, expect, it } from "vitest";

import { OpenAiLlmClient } from "@/server/llm/openai/client";
import { adaptarEsquemaEstricto } from "@/server/llm/openai/strict-schema";
import { esquemaJsonDelRequerimiento } from "@/domain/requirement/json-schema";
import { unRequest } from "@tests/contract/llm-client.contract";
import {
  fetchGrabado,
  fetchSse,
  fragmento,
  fragmentoDeUso,
  RESPUESTAS,
} from "@tests/fixtures/openai/fetch";

const señal = () => new AbortController().signal;

function cliente(fetch: typeof globalThis.fetch) {
  return new OpenAiLlmClient({
    apiKey: "clave-de-prueba",
    model: "modelo-de-prueba",
    fetch,
  });
}

describe("OpenAiLlmClient · pedido", () => {
  it("manda system, contexto y mensajes, con la clave en la cabecera", async () => {
    const { fetch, pedidos } = fetchGrabado(200, RESPUESTAS.texto);
    await cliente(fetch).complete(unRequest(), señal());

    const [pedido] = pedidos;
    expect(pedido!.url).toMatch(/\/chat\/completions$/);
    expect(pedido!.headers.get("authorization")).toBe("Bearer clave-de-prueba");
    expect(pedido!.cuerpo.model).toBe("modelo-de-prueba");
    expect(pedido!.cuerpo.messages).toEqual([
      { role: "system", content: "Sos un asistente." },
      {
        role: "system",
        content: "<contexto_del_turno>\nfase: delimitar\n</contexto_del_turno>",
      },
      { role: "user", content: "Hola" },
    ]);
  });

  it("usa el tope de tokens de los modelos de razonamiento y no manda temperatura", async () => {
    const { fetch, pedidos } = fetchGrabado(200, RESPUESTAS.texto);
    await cliente(fetch).complete(unRequest(), señal());

    const { cuerpo } = pedidos[0]!;
    expect(cuerpo.max_completion_tokens).toBe(500);
    expect(cuerpo).not.toHaveProperty("max_tokens");
    expect(cuerpo).not.toHaveProperty("temperature");
    expect(cuerpo.reasoning_effort).toBe("low");
  });

  it("declara las tools en modo estricto, sin llamadas en paralelo", async () => {
    const { fetch, pedidos } = fetchGrabado(200, RESPUESTAS.texto);
    await cliente(fetch).complete(unRequest(), señal());

    const { cuerpo } = pedidos[0]!;
    expect(cuerpo.tools).toEqual([
      {
        type: "function",
        function: {
          name: "registrar",
          description: "Registra algo.",
          parameters: expect.objectContaining({ additionalProperties: false }),
          strict: true,
        },
      },
    ]);
    expect(cuerpo.parallel_tool_calls).toBe(false);
    expect(cuerpo.tool_choice).toBe("auto");
  });

  it("fuerza una tool concreta con toolChoice { name }", async () => {
    const { fetch, pedidos } = fetchGrabado(200, RESPUESTAS.texto);
    await cliente(fetch).complete(
      { ...unRequest(), toolChoice: { name: "registrar" } },
      señal(),
    );
    expect(pedidos[0]!.cuerpo.tool_choice).toEqual({
      type: "function",
      function: { name: "registrar" },
    });
  });

  it("sin tools no manda parallel_tool_calls ni tool_choice", async () => {
    const { fetch, pedidos } = fetchGrabado(200, RESPUESTAS.texto);
    await cliente(fetch).complete(
      { ...unRequest(), tools: [], toolChoice: "none" },
      señal(),
    );
    expect(pedidos[0]!.cuerpo).not.toHaveProperty("tools");
    expect(pedidos[0]!.cuerpo).not.toHaveProperty("parallel_tool_calls");
    expect(pedidos[0]!.cuerpo).not.toHaveProperty("tool_choice");
  });

  it("traduce el historial con tool calls y sus resultados", async () => {
    const { fetch, pedidos } = fetchGrabado(200, RESPUESTAS.texto);
    await cliente(fetch).complete(
      {
        ...unRequest(),
        messages: [
          { role: "user", content: "Hola" },
          {
            role: "assistant",
            content: null,
            toolCalls: [
              { id: "c1", name: "registrar", arguments: '{"dato":"x"}' },
            ],
          },
          { role: "tool", toolCallId: "c1", content: "ok" },
          { role: "assistant", content: "Listo", toolCalls: [] },
        ],
      },
      señal(),
    );
    expect(pedidos[0]!.cuerpo.messages).toEqual([
      expect.anything(),
      expect.anything(),
      { role: "user", content: "Hola" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "registrar", arguments: '{"dato":"x"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "ok" },
      { role: "assistant", content: "Listo" },
    ]);
  });

  it("informa los tokens de entrada y salida", async () => {
    const { fetch } = fetchGrabado(200, RESPUESTAS.texto);
    const r = await cliente(fetch).complete(unRequest(), señal());
    expect(r.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
  });
});

describe("OpenAiLlmClient · errores", () => {
  it("lee retry-after en segundos cuando no hay retry-after-ms", async () => {
    const { fetch } = fetchGrabado(429, RESPUESTAS.limite, {
      "retry-after": "7",
    });
    await expect(
      cliente(fetch).complete(unRequest(), señal()),
    ).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 7000,
    });
  });

  it("no filtra la clave ni el contenido del pedido en el error", async () => {
    const { fetch } = fetchGrabado(401, RESPUESTAS.auth);
    const error = (await cliente(fetch)
      .complete(unRequest(), señal())
      .then(
        () => null,
        (e: unknown) => e,
      )) as Error;
    const texto = JSON.stringify(error) + error.message + String(error.stack);
    expect(texto).not.toContain("clave-de-prueba");
    expect(texto).not.toContain("Hola");
  });

  it("un error de red es unavailable y se puede reintentar", async () => {
    const roto: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(
      cliente(roto).complete(unRequest(), señal()),
    ).rejects.toMatchObject({
      kind: "unavailable",
      retryable: true,
    });
  });

  it("una respuesta sin choices es unknown", async () => {
    const { fetch } = fetchGrabado(200, { ...RESPUESTAS.texto, choices: [] });
    await expect(
      cliente(fetch).complete(unRequest(), señal()),
    ).rejects.toMatchObject({
      kind: "unknown",
    });
  });
});

describe("adaptarEsquemaEstricto", () => {
  const esquema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      nombre: { type: "string", minLength: 1, maxLength: 80 },
      lista: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: { a: { type: "string", pattern: "^x" } },
          required: ["a"],
        },
      },
      estado: { enum: ["uno", "dos"] },
    },
  };

  it("cierra los objetos, exige todas las propiedades y conserva los límites", () => {
    expect(adaptarEsquemaEstricto(esquema)).toEqual({
      type: "object",
      properties: {
        nombre: { type: "string", minLength: 1, maxLength: 80 },
        lista: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: { a: { type: "string", pattern: "^x" } },
            required: ["a"],
            additionalProperties: false,
          },
        },
        estado: { enum: ["uno", "dos"] },
      },
      required: ["nombre", "lista", "estado"],
      additionalProperties: false,
    });
  });

  it("no muta el esquema recibido", () => {
    const copia = structuredClone(esquema);
    adaptarEsquemaEstricto(esquema);
    expect(esquema).toEqual(copia);
  });

  it("quita las palabras clave sin verificar", () => {
    const r = adaptarEsquemaEstricto({
      type: "object",
      properties: { n: { type: "number", minimum: 1, default: 2 } },
    });
    expect(r).toMatchObject({ properties: { n: { type: "number" } } });
    expect(JSON.stringify(r)).not.toMatch(/minimum|default/);
  });

  it("deja el esquema real del requerimiento cerrado y sin $schema", () => {
    const texto = JSON.stringify(
      adaptarEsquemaEstricto(esquemaJsonDelRequerimiento()),
    );
    expect(texto).not.toContain('"$schema"');
    expect(texto).toContain('"maxLength"');
    expect(texto).toContain('"additionalProperties":false');
  });

  it("un enum con una propiedad llamada como una palabra clave no se toca", () => {
    const r = adaptarEsquemaEstricto({
      type: "object",
      properties: { pattern: { type: "string" } },
    });
    expect(r).toMatchObject({ properties: { pattern: { type: "string" } } });
  });
});

describe("OpenAiLlmClient · transmisión", () => {
  async function transmitir(fetch: typeof globalThis.fetch) {
    const deltas: string[] = [];
    const r = await cliente(fetch).complete(unRequest(), señal(), {
      onTextDelta: (d) => deltas.push(d),
    });
    return { r, deltas };
  }

  it("pide stream con uso y entrega el texto por partes", async () => {
    const { fetch, pedidos } = fetchSse([
      fragmento({ role: "assistant", content: "" }),
      fragmento({ content: "¿Qué " }),
      fragmento({ content: "decisión?" }),
      fragmento({}, "stop"),
      fragmentoDeUso(120, 30),
    ]);
    const { r, deltas } = await transmitir(fetch);

    expect(pedidos[0]!.cuerpo).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(deltas).toEqual(["¿Qué ", "decisión?"]);
    expect(r).toEqual({
      text: "¿Qué decisión?",
      toolCalls: [],
      refusal: null,
      finishReason: "stop",
      usage: { inputTokens: 120, outputTokens: 30 },
    });
  });

  it("arma la tool call con los argumentos repartidos en fragmentos, sin transmitirlos", async () => {
    const { fetch } = fetchSse([
      fragmento({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "registrar", arguments: "" },
          },
        ],
      }),
      fragmento({
        tool_calls: [{ index: 0, function: { arguments: '{"dato"' } }],
      }),
      fragmento({
        tool_calls: [{ index: 0, function: { arguments: ': "x"}' } }],
      }),
      fragmento({}, "tool_calls"),
    ]);
    const { r, deltas } = await transmitir(fetch);

    expect(deltas).toEqual([]);
    expect(r.finishReason).toBe("tool_calls");
    expect(r.toolCalls).toEqual([
      { id: "call_1", name: "registrar", arguments: '{"dato": "x"}' },
    ]);
    expect(r.usage).toBeNull();
  });

  it("junta el rechazo sin transmitirlo como texto", async () => {
    const { fetch } = fetchSse([
      fragmento({ refusal: "No puedo " }),
      fragmento({ refusal: "ayudar con eso." }),
      fragmento({}, "stop"),
    ]);
    const { r, deltas } = await transmitir(fetch);
    expect(deltas).toEqual([]);
    expect(r.refusal).toBe("No puedo ayudar con eso.");
    expect(r.text).toBeNull();
  });

  it("marca la respuesta truncada", async () => {
    const { fetch } = fetchSse([
      fragmento({ content: "Una respuesta que" }),
      fragmento({}, "length"),
    ]);
    const { r } = await transmitir(fetch);
    expect(r.finishReason).toBe("length");
  });

  it("un error HTTP antes del stream se traduce igual", async () => {
    const { fetch } = fetchGrabado(429, RESPUESTAS.cuota);
    await expect(transmitir(fetch)).rejects.toMatchObject({
      kind: "quota_exceeded",
      retryable: false,
    });
  });
});
