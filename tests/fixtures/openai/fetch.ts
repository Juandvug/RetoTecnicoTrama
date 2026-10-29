import cuota from "./error-cuota.json";
import auth from "./error-auth.json";
import limite from "./error-limite.json";
import pedido from "./error-pedido.json";
import plazo from "./error-plazo.json";
import servidor from "./error-servidor.json";
import rechazo from "./rechazo.json";
import texto from "./texto.json";
import toolCall from "./tool-call.json";
import truncada from "./truncada.json";

// Un `fetch` que devuelve respuestas grabadas (PLAN F4.6): ejercita el SDK real
// sin red. Cada llamada queda registrada para hacer aserciones sobre el pedido.

export const RESPUESTAS = {
  texto,
  toolCall,
  rechazo,
  truncada,
  limite,
  cuota,
  servidor,
  plazo,
  auth,
  pedido,
};

export type PedidoRegistrado = {
  url: string;
  headers: Headers;
  cuerpo: Record<string, unknown>;
};

export function fetchGrabado(
  status: number,
  cuerpo: unknown,
  headers: Record<string, string> = {},
) {
  const pedidos: PedidoRegistrado[] = [];
  const fetchSimulado: typeof fetch = async (entrada, init) => {
    pedidos.push({
      url: String(entrada),
      headers: new Headers(init?.headers),
      cuerpo: JSON.parse(String(init?.body ?? "null")),
    });
    return new Response(JSON.stringify(cuerpo), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };
  return { fetch: fetchSimulado, pedidos };
}

/** Un fetch que no responde hasta que se aborta la señal. */
export const fetchColgado: typeof fetch = (_entrada, init) =>
  new Promise((_, rechazar) => {
    init?.signal?.addEventListener("abort", () =>
      rechazar(new DOMException("Aborted", "AbortError")),
    );
  });

/** Un fragmento de chat.completion.chunk, con la forma documentada de la API. */
export const fragmento = (
  delta: Record<string, unknown>,
  finish_reason: string | null = null,
) => ({
  id: "chatcmpl-flujo",
  object: "chat.completion.chunk",
  created: 1790000000,
  model: "gpt-5-mini-2025-08-07",
  choices: [{ index: 0, delta, finish_reason }],
});

export const fragmentoDeUso = (
  prompt_tokens: number,
  completion_tokens: number,
) => ({
  id: "chatcmpl-flujo",
  object: "chat.completion.chunk",
  created: 1790000000,
  model: "gpt-5-mini-2025-08-07",
  choices: [],
  usage: {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  },
});

/** Un fetch que responde un stream SSE (`stream: true`) con esos fragmentos. */
export function fetchSse(fragmentos: unknown[]) {
  const pedidos: PedidoRegistrado[] = [];
  const fetchSimulado: typeof fetch = async (entrada, init) => {
    pedidos.push({
      url: String(entrada),
      headers: new Headers(init?.headers),
      cuerpo: JSON.parse(String(init?.body ?? "null")),
    });
    const sse =
      fragmentos.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") +
      "data: [DONE]\n\n";
    return new Response(sse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  return { fetch: fetchSimulado, pedidos };
}
