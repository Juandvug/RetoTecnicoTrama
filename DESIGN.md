# Diseño de la entrevista

> Entregable del paso 2 del reto. Define las fases de la entrevista, qué condición hace pasar de una a otra, y cuándo el agente pregunta, propone y se detiene. La mecánica que hace cumplir este diseño (validación, estado y política de fases) está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y en los [ADR](docs/adr/README.md).

## 1. Objetivo

Llevar al usuario de "tengo un problema" a un requerimiento que el motor pueda usar: mínimo, justificado y confirmado, con pocas preguntas y sin inventar nada.

La entrevista sale bien cuando:

- la primera propuesta aparece, a más tardar, con el tercer mensaje del usuario;
- ningún turno tiene más de dos preguntas;
- cada columna pedida se puede rastrear hasta una regla, y cada regla hasta la decisión;
- el agente no afirmó ninguna cifra ni ningún hallazgo;
- el usuario puede confirmar con unos seis mensajes o menos.

## 2. Principio: de la decisión a la columna

```text
Decisión → Sospechas (reglas candidatas) → Clases y relaciones que usan → Columnas que las alimentan → Fuentes que contienen esas columnas
```

Los datos se derivan hacia atrás, a partir de la decisión. Un dato se pide solo si se puede recorrer esa cadena desde él hasta la decisión; si no se puede, sobra.

Por eso la decisión y la sospecha valen más que cualquier otra pregunta. Sin ellas no hay reglas, y sin reglas no hay forma de justificar un dato.

## 3. Qué hay que entender: cuatro ejes

| Eje | Por qué importa | Dónde queda | Si falta |
|---|---|---|---|
| Decisión | Define qué reglas vale la pena verificar | `decision_objetivo` | Es la primera pregunta. Queda en `null` hasta conocerla. |
| Sospecha | Se convierte en reglas candidatas | `reglas_candidatas` | El agente ofrece hasta dos hipótesis verificables para que el usuario elija. |
| Entidades | Son las clases y su nivel de detalle | `esquema.clases`, `alcance.unidades` | Casi siempre se infieren del planteo. Solo se pregunta por el nivel de detalle si cambia los datos. |
| Período | Acota qué datos se piden | `alcance.periodo` | Se pregunta si no se dijo. Queda en `null` mientras no se sepa. |

## 4. Cuándo pregunta

Una pregunta es pertinente solo si alguna respuesta posible cambiaría una clase, una relación, una regla, una fuente o una columna. Si cualquier respuesta deja el requerimiento igual, la pregunta no se hace.

- **Prioridad:** decisión, sospecha, entidades y nivel de detalle, período. Después, si los datos existen y dónde están.
- **Forma:** como máximo dos preguntas por turno, cortas y con las palabras del usuario. Si ayudan, se dan ejemplos de respuesta sin cerrar las opciones.
- **Qué no se pregunta:** lo que el usuario ya dijo y lo que se puede inferir.
- **Con una propuesta en curso,** las preguntas son sobre los datos:
  - si existe un dato;
  - dónde se registra, lo que define el tipo de fuente;
  - con qué identificador se cruza con otro, lo que define las columnas que materializan las relaciones.

## 5. Cuándo propone

- **Cuándo:** en cuanto conoce los cuatro ejes o puede inferirlos razonablemente, y nunca después del tercer mensaje del usuario. En ese punto proponer es obligatorio: lo que falte queda en `null` o en preguntas abiertas.
- **Qué:** el esquema y los datos en el mismo turno, como en el ejemplo del enunciado.
- **Mejor temprano que tarde:** una propuesta concreta, aunque le falten datos, se corrige más rápido que otra ronda de preguntas abstractas.
- **Cómo la presenta:** con una o dos frases que dicen qué propuso y qué falta, más una o dos preguntas si algo falta. No repite el requerimiento en el chat: ya está en el panel.

## 6. Cuándo se detiene

- **Cuando el requerimiento alcanza** (completitud efectiva `suficiente_para_confirmar`): deja de preguntar e invita a confirmar. Las preguntas abiertas no impiden confirmar; se resuelven al cargar los datos.
- **Cuando faltan datos y la entrevista no avanza:** si pasan tres turnos sin una versión nueva, cierra. Reduce el alcance a lo que se puede verificar o pasa lo pendiente a preguntas abiertas, y registra la versión.
- **Cuando el usuario confirma:** la entrevista termina. Para cambiar algo hay que reabrirla.

## 7. Fases y transiciones

| Fase | Empieza cuando | Qué hace el agente | Termina cuando |
|---|---|---|---|
| Delimitar | Empieza la conversación | Pregunta lo que falte de los cuatro ejes | Registra una propuesta válida, o llega el tercer mensaje del usuario |
| Proponer | Llega el tercer mensaje sin propuesta | Registra una propuesta con lo que sabe (obligatorio) | La propuesta es válida |
| Pedir | Hay una propuesta a la que le faltan datos | Pregunta lo que destraba la cobertura y registra versiones nuevas | La versión es suficiente o se fuerza el cierre |
| Confirmar | Hay una propuesta suficiente | Invita a revisarla y solo registra si el usuario pide un ajuste | El usuario confirma, o un ajuste deja datos faltantes y vuelve a Pedir |
| Confirmado | El usuario confirma | Nada | El usuario reabre y vuelve a Confirmar |

El modelo no decide solo si un requerimiento es suficiente. El sistema comprueba tres cosas:

- que la decisión esté definida;
- que el período esté definido;
- que cada regla tenga columnas para todo lo que usa.

Si algo falla, la propuesta queda en Pedir y el motivo se ve en el panel.

## 8. Ajustes y versiones

- Los ajustes se piden por el chat. Cada uno genera una versión nueva y completa. El panel marca qué cambió y guarda las versiones anteriores en solo lectura.
- *Ajustar* pone el foco en el composer y le avisa al agente que el siguiente mensaje es un ajuste.
- Si un ajuste es ambiguo, el agente hace una sola pregunta antes de registrar.

## 9. Situaciones difíciles

| Situación | Qué hace el agente |
|---|---|
| El planteo es muy vago ("las cosas van mal") | Pregunta qué decisión quiere tomar el usuario y dónde lo nota. Con el tercer mensaje propone igual, aunque falten datos. |
| Todo el contexto llega en el primer mensaje | Propone en el primer turno. |
| El usuario pide resultados ("¿cuánto estamos perdiendo?") | Explica que eso lo calcula Trama con los datos, y lo convierte en una regla y en los datos que la verifican. |
| El usuario no sabe si un dato existe | Lo deja como pregunta abierta y, si hay alguna, propone una fuente alternativa. No se traba. |
| El usuario no tiene una sospecha | Ofrece como máximo dos hipótesis verificables para que elija. |
| El usuario contradice una versión anterior | Registra una versión nueva, y el panel muestra qué cambió. |
| El usuario quiere confirmar pero faltan datos | El panel explica qué falta, y el agente ofrece cerrar reduciendo el alcance. |
| El usuario pide algo que no es parte de la entrevista | Dice en una frase que no puede ayudar con eso y vuelve al tema. |

## 10. Lo que el agente nunca hace

- Afirmar resultados, porcentajes, montos, causas o hallazgos.
- Pedir un dato que no pueda justificar con una clase, una relación o una regla.
- Usar listas de datos o de clases predefinidas para un tipo de problema.
- Seguir preguntando cuando el requerimiento ya alcanza.

## 11. Ejemplo

Es un dominio a propósito distinto del que usa el enunciado. La conversación ocurre en octubre de 2026.

> **Vos:** Los conteos físicos del depósito no coinciden con lo que dice el sistema.
>
> **Agente:** Para enfocarlo: ¿qué querés decidir con esto? Por ejemplo, cambiar un proceso, auditar un área o corregir el sistema. ¿Y desde cuándo lo notan?
>
> **Vos:** Queremos saber si el problema está en la recepción o en los despachos. Pasa en el depósito central, desde que cambiamos de transportista en marzo.
>
> **Agente:** *(registra v1, faltan datos)* Te dejé en el panel un esquema que conecta cada artículo con sus recepciones, despachos y conteos. Me falta un dato: ¿el sistema guarda qué transportista entregó cada recepción, o eso figura solo en los remitos?
>
> **Vos:** Solo en los remitos, en PDF.
>
> **Agente:** *(registra v2, suficiente)* Agregué los remitos como fuente para cruzar cada recepción con su transportista. Revisalo en el panel y confirmalo, o pedime ajustes.

Resumen de la v2:

- **Decisión:** reforzar el control en la recepción o en los despachos.
- **Alcance:** de 2026-03 a 2026-10, depósito central.
- **Clases:** Articulo · Recepcion · Despacho · ConteoFisico · Transportista.
- **Reglas candidatas:**
  - **R1.** Si la diferencia de conteo de un Articulo aparece después de una Recepcion, sin ningún Despacho en el medio, la diferencia se asocia a la recepción.
  - **R2.** La regla análoga para los despachos.
  - **R3.** Si las diferencias asociadas a recepción se repiten en recepciones entregadas por un mismo Transportista, la diferencia se asocia a ese transportista.
- **Fuentes:**
  - Movimientos de stock (csv): `articulo_id, tipo_movimiento, documento_id, fecha`.
  - Conteos físicos (excel): `articulo_id, fecha_conteo, cantidad_contada`.
  - Remitos de recepción (pdf): `remito_id, recepcion_id, transportista`.
- **Pregunta abierta:** ¿los conteos cubren todo el depósito o se rotan por sector?

Cada columna se puede rastrear hasta una regla. Por ejemplo, `transportista` alimenta la relación entre Recepcion y Transportista que usa R3, y R3 responde a la sospecha del usuario: el cambio de transportista.
