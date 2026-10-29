# ADR-0002 · Abstracción del proveedor LLM

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Relacionadas:** ADR-0001, ADR-0004, ADR-0008

## Contexto

El enunciado pide encapsular la llamada a OpenAI "detrás de una interfaz propia para poder cambiar de proveedor sin tocar la lógica de la entrevista". Arquitectura vale 25 % y lo que se mira ahí es que la entrevista no dependa de OpenAI y que haya "límites claros entre prompt, tool, validación y UI". Los tests (15 %) deben correr sin red.

Las tres exigencias apuntan a lo mismo: separar explícitamente lo que decide la entrevista de cómo se le habla a un proveedor concreto.

## Decisión

Puertos y adaptadores (arquitectura hexagonal) en la frontera con el modelo.

### 1. Puerto `LlmClient`

Vive en `src/server/llm/port.ts`. Sus tipos son neutrales y modelan lo que tienen en común los proveedores con tool calling: mensajes con roles, tools definidas con JSON Schema, elección de tool, llamadas devueltas y errores normalizados.

```ts
export interface LlmClient {
  complete(
    request: LlmRequest,
    signal: AbortSignal,
    options?: LlmCallOptions,
  ): Promise<LlmResponse>;
}

// Lo que no es parte del pedido al modelo. `deadline` es el instante en que
// vence el plazo del turno: los reintentos no esperan más allá de él.
// Con `onTextDelta`, el adaptador transmite el texto a medida que llega y
// devuelve igual la respuesta completa; `onTextReset` avisa que empieza otro
// intento y lo transmitido se descarta.
export interface LlmCallOptions {
  deadline?: number;
  onTextDelta?: (delta: string) => void;
  onTextReset?: () => void;
}

export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema; // lo genera el dominio; cada adaptador lo lleva a su dialecto
}

export type LlmToolChoice = "auto" | "none" | { name: string };

export interface LlmRequest {
  system: string;   // prompt estático y versionado
  context: string;  // bloque dinámico del turno: fase, versión vigente, fecha
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  toolChoice: LlmToolChoice;
  maxOutputTokens: number;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string; // JSON crudo: el adaptador no lo interpreta
}

export interface LlmResponse {
  text: string | null;
  toolCalls: LlmToolCall[];
  refusal: string | null;
  finishReason: "stop" | "tool_calls" | "length" | "content_filter" | "other";
  usage: { inputTokens: number; outputTokens: number } | null;
}

export type LlmErrorKind =
  | "timeout"
  | "rate_limited"
  | "quota_exceeded"
  | "unavailable"
  | "auth"
  | "bad_request"
  | "aborted"
  | "unknown";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(kind);
  }
}
```

### 2. Adaptador `OpenAiLlmClient`

Vive en `src/server/llm/openai/` y es el único módulo que importa `openai`. Traduce el puerto a Chat Completions:

- `system` se envía como mensaje `system`. `context` va como un segundo mensaje `system` inmediatamente después, para que el prefijo estático aproveche el prompt caching del proveedor.
- Las tools se declaran con `strict: true` y `parallel_tool_calls: false`. El adaptador lleva el JSON Schema al subconjunto que acepta el modo estricto: todos los campos en `required`, `additionalProperties: false` y sin las palabras clave que el modo estricto no soporta. Las restricciones que se quitan las sigue aplicando Zod en el dominio.
- `toolChoice: { name }` se traduce al `tool_choice` que fuerza esa función.
- Con `onTextDelta`, la llamada va con `stream: true` y `stream_options: { include_usage: true }`. El adaptador entrega cada fragmento de texto, junta los argumentos de las tool calls (que llegan repartidos) y el rechazo, y devuelve la misma `LlmResponse` que sin streaming.
- Los errores del SDK se convierten a `LlmError`:
  - Un `429` con `insufficient_quota` pasa a `quota_exceeded`, que no se reintenta porque significa que se llegó al tope de gasto.
  - Cualquier otro `429` pasa a `rate_limited`, con el valor de `retry-after`.
  - Los `5xx` y los errores de red pasan a `unavailable`.
  - Un aborto por plazo vencido pasa a `timeout`.
- El SDK se configura con `maxRetries: 0` y sin timeout propio. Los reintentos y los plazos son política nuestra: agnóstica y testeable (ADR-0004).
- Modelo, temperatura y tope de tokens salen de variables de entorno validadas (`LLM_MODEL`, …). El código de la entrevista no tiene valores atados a un modelo.

### 3. Decoradores

Implementan el mismo puerto y se componen en la fábrica:

- `withRetry`: backoff exponencial con jitter (entre el 50 % y el 100 % de `500 ms × 2^n`), como máximo 2 reintentos, solo para `timeout`, `rate_limited` y `unavailable`. Respeta `retryAfterMs` y no espera más allá de `options.deadline`. Aplica a cada intento un plazo propio de 25 s, de modo que un intento colgado se cancela y se reintenta dentro del plazo del turno. Se detiene de inmediato si el usuario cancela. Antes de cada reintento llama a `onTextReset`, para que no quede a la vista el texto de un intento fallido.
- `withTelemetry`: registra latencia, tokens y tipo de error, nunca contenido.

La señal de cada intento distingue un plazo vencido de una cancelación del usuario por el motivo del abort (`TimeoutError`): el primero es `timeout` y se reintenta; el segundo es `aborted` y no.

### 4. Fábrica

`createLlmClient(env)` vive en la raíz de composición del servidor. `LLM_PROVIDER` acepta `openai` o `fake`; `fake` está prohibido cuando `VERCEL_ENV=production`.

### 5. `FakeLlmClient`

Es una implementación programable: recibe un guion de respuestas o una función de la request, y registra cada request para poder hacer aserciones sobre ella. Es la base de los tests y del e2e (ADR-0008).

Cada paso del guion es una respuesta o un error, con una demora opcional (`texto`, `llamada`, `rechazo`, `truncada`, `falla` y `conDemora`). Un guion que se queda corto falla con un `Error` común y no con un `LlmError`, porque es un error del test y no del proveedor. Los escenarios del e2e son archivos JSON en `tests/fixtures/scenarios`, que `FAKE_LLM_SCENARIO` selecciona por nombre.

### Dirección de las dependencias

- La entrevista (`src/server/interview`) depende del puerto.
- El adaptador depende del puerto y del SDK.
- El puerto no depende de nada.

El adaptador no conoce `RequerimientoMotor`: recibe un JSON Schema y devuelve argumentos crudos. Validarlos es trabajo del dominio.

## Alternativas descartadas

- **Llamar al SDK de OpenAI desde la lógica de la entrevista.** Es lo más rápido, pero ata prompt, tool y reintentos al formato de un proveedor, y para testear sin red habría que interceptar HTTP.
- **Usar el Vercel AI SDK como capa de abstracción.** Ver ADR-0001. Además, su abstracción es de propósito general. La nuestra expone solo lo que la entrevista necesita, y eso hace que el fake sea trivial.
- **Responses API de OpenAI.** Es la API que OpenAI recomienda para proyectos nuevos y serviría igual de bien como adaptador. Se elige Chat Completions porque su forma (mensajes sin estado, tool calls con id) es la más parecida a la de otros proveedores y a la del propio puerto, y el adaptador queda casi como un mapeo uno a uno. Cambiar de API no toca nada fuera de `src/server/llm/openai/`.
- **Structured Outputs (`response_format`) con un sobre `{ mensaje, requerimiento }` en una sola llamada.** Ahorraría una llamada en los turnos que proponen. Pero obliga a emitir JSON en todos los turnos, incluso en los que solo hacen una pregunta, y cierra la puerta a transmitir texto en streaming. La tool `registrar_requerimiento` coincide con el ejemplo del enunciado y separa la conversación del artefacto.

## Consecuencias

- Cambiar de proveedor consiste en escribir un adaptador nuevo y hacerlo pasar la suite de contrato del puerto. No cambia nada en la entrevista, la validación ni la UI.
- Reintentos y plazos se comportan igual con cualquier proveedor y se testean con relojes simulados.
- Costo: el puerto es una capa propia que hay que mantener. Las funciones específicas de un proveedor (logprobs, herramientas integradas) quedan fuera hasta que el puerto las modele.

## Verificación

- Una regla de lint `no-restricted-imports` solo permite importar `openai` desde `src/server/llm/openai/**`.
- Suite de contrato del puerto (`tests/contract/llm-client.contract.ts`). Se ejecuta contra `FakeLlmClient` y contra `OpenAiLlmClient` con un `fetch` inyectado que devuelve respuestas grabadas. Cubre:
  - texto;
  - tool call;
  - rechazo;
  - respuesta truncada por `length`;
  - `429`;
  - `429` con `insufficient_quota`;
  - `500`;
  - timeout.
- Los tests de la entrevista usan solo `FakeLlmClient`.

### Estado de la implementación

Todo está implementado. El `OpenAiLlmClient` (`src/server/llm/openai/`) pasa la misma suite de contrato que el fake, con el SDK real y respuestas grabadas en `tests/fixtures/openai/`.

Lo que se comprobó contra la API real con `gpt-5-mini` (F9.2):

- Los modelos de razonamiento usan `max_completion_tokens` (que incluye los tokens de razonamiento) y no admiten `temperature`. El adaptador manda `reasoning_effort: "low"` para acotar latencia y costo.
- El modo estricto acepta `minLength`, `maxLength`, `minItems`, `maxItems` y `pattern` en el esquema del requerimiento. Se conservan: sin ellos el modelo se pasaba del largo máximo de `justifica` y el servidor tenía que reparar. Se quitan solo `$schema` y las palabras clave que no se verificaron.
- `chat.completions` con `tool_choice` forzado devuelve la tool call en una sola llamada; una propuesta completa tarda en el orden de 15 s con esfuerzo `low` (se mide con evals en F9.4).
