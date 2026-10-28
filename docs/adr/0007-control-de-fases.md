# ADR-0007 · Control de fases de la entrevista

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Relacionadas:** ADR-0003, ADR-0004, ADR-0006

## Contexto

El paso 2 del enunciado pide definir las fases de la entrevista (delimitar, proponer, pedir, confirmar) y "qué condición hace pasar de una a otra". Es decir: "cuándo el agente pregunta, cuándo propone y cuándo se detiene". Calidad de la entrevista vale 30 % y se resume en "preguntas pertinentes y pocas".

Hay dos extremos, y ninguno sirve:

- **Si la fase la decide solo el modelo,** el comportamiento no es reproducible ni testeable.
- **Si la decide solo una máquina de estados,** las transiciones dependen de juicios semánticos que el código no puede hacer, como "¿ya sé qué decisión quiere tomar?".

## Decisión

Se adopta un modelo híbrido: **la fase se deriva de forma determinista del estado observable, y el LLM decide qué hacer dentro de cada fase.**

`derivarFase(resumen)` es una función pura en `src/domain/session/phase.ts` que comparten cliente y servidor. Solo usa hechos verificables:

- si hay una versión vigente y cuál es su completitud efectiva;
- si está confirmada;
- cuántos mensajes envió el usuario;
- cuántos turnos pasaron sin una versión nueva.

| Fase | Condición | `toolChoice` | Qué hace el agente |
|---|---|---|---|
| `delimitar` | Sin versión y menos de 3 mensajes del usuario | `auto` | Pregunta como máximo dos cosas de lo que falte entre decisión, entidades, período y sospecha. Si ya tiene todo, propone. |
| `proponer` | Sin versión y 3 o más mensajes del usuario | forzada: `registrar_requerimiento` | Propone con lo que sabe. Lo desconocido va a `null` o a `preguntas_abiertas`, con `faltan_datos`. |
| `pedir` | Versión vigente con `faltan_datos` y menos de 3 turnos sin versión nueva | `auto` | Pregunta como máximo dos cosas que destraben la cobertura o la completitud. Registra una versión nueva cuando algo cambia. |
| `pedir` · cierre | Versión vigente con `faltan_datos` y 3 o más turnos sin versión nueva | forzada: `registrar_requerimiento` | Deja de preguntar. Reduce el alcance a lo que se puede verificar, o mueve lo no resuelto a `preguntas_abiertas`, y registra. |
| `confirmar` | Versión vigente con `suficiente_para_confirmar` | `auto` | Invita a revisar y confirmar, sin hacer preguntas nuevas. Solo registra si el usuario pide un ajuste. |
| `confirmado` | El usuario confirmó | — | No se llama al modelo. El composer queda bloqueado hasta que el usuario elija *Reabrir*. |

### Criterios

- **Cuándo propone.** Temprano: después de dos rondas de preguntas como máximo, el usuario ya ve algo concreto que corregir. Corregir una propuesta es más fácil que responder preguntas abstractas.
- **Cuándo se detiene.** El agente deja de preguntar cuando la completitud efectiva es suficiente. El cierre en `pedir` evita entrevistas interminables cuando el usuario no tiene la información. Registrar en el turno de cierre reinicia el contador, así que no se fuerza la tool en todos los turnos.
- **Ajustes.** La intención `ajuste` (botón *Ajustar*) agrega al contexto que el usuario quiere modificar la versión vigente.

### Quién calcula qué

- El servidor recalcula la fase a partir del snapshot; no acepta una fase enviada por el cliente. Con ella elige la instrucción de fase y el `toolChoice`.
- La completitud efectiva de la versión vigente también la recalcula el servidor (ADR-0004).
- Los contadores los mantiene el reducer del cliente y el servidor los acota (ADR-0003).

## Alternativas descartadas

- **Que la fase la decida el modelo,** por ejemplo con un campo `fase` en la salida. Es flexible, pero no reproducible: la misma conversación puede quedarse preguntando indefinidamente.
- **Una máquina de estados que detecta "slots"** mediante una segunda tool, `actualizar_delimitacion`, que va completando decisión, entidades, período y sospecha. Haría visible la delimitación, pero duplica en otra estructura lo que el requerimiento ya contiene (`decision_objetivo`, `alcance`, `clases`, `reglas_candidatas`), suma una tool y agrega llamadas. Se puede retomar si las transcripciones muestran preguntas redundantes.
- **Separar `proponer` (esquema) y `pedir` (fuentes) en turnos distintos.** Le suma rondas al usuario. El ejemplo del enunciado propone esquema y datos en el mismo turno, y el panel permite ajustar las dos cosas.

## Consecuencias

- El tope de 3 mensajes es una heurística. Si el usuario explica todo en un mensaje, el modelo propone antes. Si la necesidad es muy ambigua, la propuesta forzada sale con `faltan_datos` y preguntas abiertas, y aun así es un avance visible.
- La fase se puede testear sin LLM y queda registrada en el log de cada turno.
- Los umbrales (`MAX_MENSAJES_DELIMITAR`, `MAX_TURNOS_SIN_VERSION`) son configuración y se calibran con las tres transcripciones.

## Verificación

- Tests de `derivarFase` que recorren la tabla completa, incluidos los límites de cada umbral.
- Tests del engine:
  - con 3 mensajes y sin versión, la request al LLM lleva `toolChoice` forzado;
  - en `confirmar`, la instrucción de fase prohíbe preguntas nuevas.
- Test del reducer: con la sesión confirmada no se puede enviar un mensaje.
