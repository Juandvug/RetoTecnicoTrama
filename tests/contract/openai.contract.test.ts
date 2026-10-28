import { OpenAiLlmClient } from "@/server/llm/openai/client";
import {
  fetchColgado,
  fetchGrabado,
  RESPUESTAS,
} from "@tests/fixtures/openai/fetch";

import {
  describeLlmClientContract,
  type CasoDeContrato,
} from "./llm-client.contract";

// El adaptador de OpenAI ejecuta la misma suite que el fake, con el SDK real y
// un fetch que devuelve respuestas grabadas.

function respuestaDe(caso: CasoDeContrato): typeof fetch {
  switch (caso.tipo) {
    case "texto":
      return fetchGrabado(200, {
        ...RESPUESTAS.texto,
        choices: [
          {
            ...RESPUESTAS.texto.choices[0]!,
            message: {
              ...RESPUESTAS.texto.choices[0]!.message,
              content: caso.texto,
            },
          },
        ],
      }).fetch;
    case "tool_call":
      return fetchGrabado(200, {
        ...RESPUESTAS.toolCall,
        choices: [
          {
            ...RESPUESTAS.toolCall.choices[0]!,
            message: {
              ...RESPUESTAS.toolCall.choices[0]!.message,
              tool_calls: [
                {
                  id: "call_abc123",
                  type: "function",
                  function: { name: caso.nombre, arguments: caso.argumentos },
                },
              ],
            },
          },
        ],
      }).fetch;
    case "rechazo":
      return fetchGrabado(200, {
        ...RESPUESTAS.rechazo,
        choices: [
          {
            ...RESPUESTAS.rechazo.choices[0]!,
            message: {
              ...RESPUESTAS.rechazo.choices[0]!.message,
              refusal: caso.mensaje,
            },
          },
        ],
      }).fetch;
    case "truncada":
      return fetchGrabado(200, RESPUESTAS.truncada).fetch;
    case "colgado":
      return fetchColgado;
    case "error":
      switch (caso.kind) {
        case "rate_limited":
          return fetchGrabado(429, RESPUESTAS.limite, {
            "retry-after-ms": String(caso.retryAfterMs ?? 1000),
          }).fetch;
        case "quota_exceeded":
          return fetchGrabado(429, RESPUESTAS.cuota).fetch;
        case "unavailable":
          return fetchGrabado(500, RESPUESTAS.servidor).fetch;
        case "timeout":
          return fetchGrabado(408, RESPUESTAS.plazo).fetch;
        case "auth":
          return fetchGrabado(401, RESPUESTAS.auth).fetch;
        case "bad_request":
          return fetchGrabado(400, RESPUESTAS.pedido).fetch;
        default:
          throw new Error(`Sin respuesta grabada para ${caso.kind}.`);
      }
  }
}

describeLlmClientContract(
  "OpenAiLlmClient",
  (caso) =>
    new OpenAiLlmClient({
      apiKey: "clave-de-prueba",
      model: "modelo-de-prueba",
      fetch: respuestaDe(caso),
    }),
);
