# ADR-0004 · Validación estricta y manejo de errores y reintentos

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Relacionadas:** ADR-0002, ADR-0003, ADR-0006

## Contexto

El enunciado exige salida tipada, no texto libre: el requerimiento sale de function calling o de Structured Outputs y se valida antes de mostrarse. "Si no valida, no se muestra como requerimiento y el agente pide lo que falta." En Robustez se evalúa cómo se manejan las tool calls inválidas, los timeouts y los errores de la API sin perder el mensaje del usuario.

El modo estricto del proveedor garantiza la forma, pero no el significado. El modelo puede devolver una relación hacia una clase que no existe, o declarar `suficiente_para_confirmar` sin fuentes que respalden las reglas.

## Decisión

### Tres capas de validación

Todas viven en `src/domain/requirement` y son funciones puras.

| Capa | Qué detecta | Si falla |
|---|---|---|
| 1. Forma (proveedor) | Tipos y campos requeridos, mediante una tool con `strict: true` | Casi nunca falla. Si falla, lo detecta la capa 2. |
| 2. Esquema (Zod) | JSON inválido, tipos, enums, longitudes, cantidades máximas y formato del `id` de regla | Error bloqueante |
| 3. Semántica (invariantes) | Referencias inexistentes, identificadores duplicados, justificaciones faltantes, cifras que el usuario no aportó y cobertura de reglas | Error bloqueante o advertencia, según la tabla de [ARCHITECTURE.md §6.3](../ARCHITECTURE.md#63-invariantes-semánticas) |

`analizarRequerimiento(req, corpusUsuario)` devuelve `{ errores, advertencias, cobertura, completitudEfectiva, motivos }`.

**Completitud efectiva.** El LLM propone la completitud; el sistema la decide. `completitudEfectiva` vale `suficiente_para_confirmar` solo si se cumplen todas estas condiciones:

- el modelo la declara así;
- no hay errores;
- la decisión y el período están definidos;
- hay al menos una regla y al menos una fuente;
- todas las reglas tienen cobertura, es decir, cada clase y cada predicado que usan los alimenta al menos una columna.

El sistema puede bajar la completitud, pero nunca subirla. Cuando la baja, el motivo vuelve al modelo en el resultado de la tool y se muestra en el panel.

### Ciclo de reparación dentro del turno (Interview Engine)

1. El modelo llama a `registrar_requerimiento`.
2. Los argumentos pasan por las capas 2 y 3.
3. **Si son válidos**, el engine devuelve como resultado de la tool `{ ok: true, version, completitud_efectiva, motivos, observaciones }`. La llamada siguiente usa `toolChoice: "none"`, para que el modelo escriba el mensaje al usuario.
4. **Si son inválidos**, el resultado de la tool es `{ ok: false, errores: [{ ruta, codigo, mensaje }] }`, y el modelo corrige y vuelve a llamar. Se permiten como máximo **2 reparaciones**.
5. **Si se agotan las reparaciones**, el turno termina sin propuesta y la versión vigente sigue siendo la anterior. Una última llamada con `toolChoice: "none"` le pide al modelo que pregunte al usuario lo que falta. Si esa llamada también falla, se usa un texto de respaldo determinista según la fase.
6. Si la respuesta llega truncada (`finishReason: "length"`) con el JSON incompleto, se trata como inválida y se pide una versión más compacta.
7. Si llega más de una tool call en la misma respuesta, se procesa la primera. Las demás reciben `{ ok: false, motivo: "una sola llamada por turno" }`, porque el proveedor exige responder a cada id.

### Guarda de cifras

`detectarCifras(texto, corpusUsuario)` busca porcentajes y montos que no aparezcan en los mensajes del usuario. Se aplica en dos lugares:

- **En los campos de texto del requerimiento**, como invariante (`CIFRA_NO_APORTADA`, error bloqueante que se repara). Un umbral que el modelo propone como supuesto y declara en `preguntas_abiertas` no es un error; la regla por campo está en [ARCHITECTURE.md §6.3](../ARCHITECTURE.md#63-invariantes-semánticas).
- **En el mensaje al usuario**, antes de devolverlo. Si encuentra una cifra, se pide una corrección (una sola vez). Si la cifra sigue apareciendo, el mensaje se reemplaza por el texto de respaldo.

Los demás números que el usuario no aportó, como el umbral de una regla, solo generan una advertencia. Así se evitan falsos positivos con identificadores como `R1` o con números de versión.

### Reintentos de transporte

Los aplica el decorador `withRetry` sobre el puerto.

- **Errores reintentables:** `timeout`, `rate_limited` y `unavailable`. **No se reintentan:** `quota_exceeded`, `auth`, `bad_request` y `aborted`.
- **Cantidad:** hasta 2 reintentos por llamada, con backoff exponencial y jitter (base de 500 ms). `retryAfterMs` solo se respeta si cabe en el plazo que queda.
- **Plazos:** 25 s por llamada y 50 s por turno. El `maxDuration` del handler es de 60 s.
- **Cancelación:** el engine combina la señal del request con el plazo del turno (50 s) y pasa a cada llamada esa señal y el `deadline` del turno. `withRetry` agrega el plazo de 25 s de cada intento, así un intento colgado se cancela y se reintenta sin consumir el plazo de los demás (ADR-0002). Si el usuario cierra la pestaña, la llamada en curso se cancela. Los temporizadores usan `setTimeout`, para que los tests los controlen con timers simulados.
- **Presupuesto por turno:** como máximo 5 llamadas al modelo, sumando reparaciones, la corrección de cifras y la llamada de cierre. Los reintentos de transporte no cuentan aquí: tienen su propio tope.

### Errores hacia el cliente

| Origen | HTTP | `code` | `retryable` |
|---|---|---|---|
| Body inválido, o versión vigente con errores | 400 | `INVALID_REQUEST` | no |
| Sin sesión o con cookie inválida | 401 | `ACCESS_REQUIRED` | no |
| Origen no permitido | 403 | `FORBIDDEN` | no |
| Payload excedido | 413 | `PAYLOAD_TOO_LARGE` | no |
| Rate limit propio | 429 | `RATE_LIMITED`, con `Retry-After` | sí, después de esperar |
| `timeout` del modelo o plazo del turno agotado | 504 | `LLM_TIMEOUT` | sí |
| `rate_limited` o `unavailable` del modelo | 503 / 502 | `LLM_UNAVAILABLE` | sí |
| `quota_exceeded` o `auth` | 503 | `SERVICE_UNAVAILABLE` | no |
| Cualquier otro | 500 | `INTERNAL` | no |

El cuerpo de error es `{ error: { code, message, retryable, retryAfterSec? } }`, con el mensaje en español y sin detalles internos. Que el modelo se niegue a responder (`refusal`) no es un error HTTP: el turno responde 200 con un mensaje neutro y sin propuesta.

### No perder el mensaje del usuario

1. El mensaje se agrega al estado y a `localStorage` antes de enviarse, en estado `enviando`.
2. Si el turno falla, pasa a `fallido` y muestra el error junto con dos acciones:
   - **Reintentar** vuelve a enviarlo con el mismo `turnId`.
   - **Editar** devuelve el texto al composer.
3. Ningún error borra nada.

## Alternativas descartadas

- **Confiar solo en el modo estricto.** Garantiza la forma, pero no la integridad referencial ni la cobertura, que son el núcleo del reto.
- **Validar solo en el cliente.** El cliente no es confiable, y el enunciado pide validar en el servidor.
- **Reintentar indefinidamente hasta obtener un requerimiento válido.** El costo y la latencia no tendrían techo. Dos reparaciones cubren los errores típicos, como una referencia mal escrita. Si persisten, es mejor preguntar al usuario.
- **Mostrar la propuesta inválida marcada "con errores".** Contradice el enunciado: "no se muestra como requerimiento".
- **Usar los reintentos del SDK de OpenAI.** No son agnósticos al proveedor y no conocen el plazo del turno.

## Consecuencias

- El panel solo muestra requerimientos que pasaron las tres capas. Las advertencias se muestran; los errores nunca llegan al panel.
- En el peor caso, un turno hace 5 llamadas al modelo. El tope de gasto y el rate limiting (ADR-0005) acotan ese costo.
- La guarda de cifras es heurística: por ejemplo, no detecta una cifra escrita con palabras. Por eso se complementa con la regla del prompt y con las evaluaciones de transcripciones (ADR-0008).

## Verificación

Tests sin red con `FakeLlmClient`:

- tool call válida;
- JSON inválido → reparación → válida;
- tool call inválida tres veces → sin propuesta y con una pregunta al usuario;
- respuesta truncada por `length`;
- dos tool calls en la misma respuesta;
- completitud declarada suficiente con una regla sin cobertura → `faltan_datos`;
- porcentaje inventado → corrección → texto de respaldo;
- `timeout` → reintento → éxito;
- `quota_exceeded` → sin reintento → 503;
- plazo del turno agotado → 504.
