# ADR-0006 · Extensiones del contrato `RequerimientoMotor`

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Relacionadas:** ADR-0004, ADR-0007

## Contexto

El enunciado presenta el contrato como "una base; podés extenderla si lo justificás". La forma base no alcanza para expresar tres cosas que el propio enunciado exige o que hacen falta para verificar el resultado:

- **Justificación por columna.** El enunciado exige que "cada fuente y cada columna pedida" esté justificada por al menos una clase, relación o regla. Pero en la forma base `columnas_minimas` es una lista de strings, y la justificación solo existe a nivel de fuente.
- **Datos que necesita cada regla.** La forma base no dice qué elementos usa cada regla, así que no se puede comprobar si el requerimiento alcanza para verificarla.
- **Datos todavía desconocidos.** Los campos de texto obligatorios empujan al modelo a inventar un valor cuando un dato no se conoce.

## Decisión

Se extiende el contrato solo donde la forma base no puede expresar una regla del propio enunciado. Toda extensión agrega algo o refina un tipo; ningún campo base cambia de nombre.

| # | Extensión | Base | Extendido | Justificación |
|---|---|---|---|---|
| E1 | Justificación por columna | `columnas_minimas: string[]` | `columnas_minimas: { nombre, justifica: string[] }[]` | "Cada columna pedida debe estar justificada". Permite rechazar de forma determinista una columna sin justificar. |
| E2 | Elementos que usa cada regla | `{ id, enunciado }` | `{ id, enunciado, usa: string[] }` | Permite calcular cobertura: una regla es verificable si cada clase y cada predicado que usa tiene alguna columna que lo alimente. En eso se basa la completitud efectiva (ADR-0004). |
| E3 | El predicado identifica la relación | Implícito | Invariante: `predicado` es único en el esquema | Las relaciones no tienen `id`. El predicado pasa a ser su identificador, para poder citarlas en `justifica` y en `usa`, como pide "justificada por una relación". |
| E4 | Desconocido explícito | `decision_objetivo: string`, `alcance.periodo: string` | `string \| null` | Aplica "no inventar datos": `null` significa "todavía no se sabe" e impide declarar suficiencia. |
| E5 | Topes de tamaño | Sin límites | Máximos por lista: clases, relaciones, reglas, fuentes, columnas y preguntas | Vuelven operativo el requisito de pedir lo "mínimo" y acotan el costo. |

### Referencias

Las referencias se resuelven contra un único espacio de nombres: nombres de clase ∪ predicados ∪ ids de regla, sin repetidos.

- `justifica`, tanto de fuentes como de columnas, puede citar cualquiera de los tres.
- `usa`, en las reglas, solo puede citar clases y predicados.

### Proyección al contrato base

`aContratoBase(req)` produce exactamente la forma del enunciado:

- `columnas_minimas` vuelve a ser una lista de nombres;
- `justifica` de cada fuente pasa a ser la unión de las justificaciones de la fuente y de sus columnas;
- `null` se serializa como `"sin definir"`.

El panel ofrece las dos exportaciones: la extendida y la base.

### Metadatos fuera del contrato

La versión, la fecha, el `turnId`, la versión del prompt y el análisis viven en el sobre `VersionRequerimiento`, no dentro de `RequerimientoMotor`. El contrato describe la necesidad, no el proceso que la produjo.

## Alternativas descartadas

- **Mantener el contrato base sin cambios.** La justificación por columna y la cobertura de reglas quedarían en manos del prompt, sin forma de verificarlas.
- **Un campo paralelo `trazabilidad_columnas`.** Conserva `columnas_minimas` como `string[]`, pero duplica los nombres y obliga a validar que ambas listas coincidan.
- **Referencias tipadas `{ tipo, ref }`.** Son más explícitas, pero más verbosas para el modelo y se alejan del ejemplo del enunciado (`"justifica": ["Salida", "R1"]`). Un espacio de nombres único da la misma precisión.
- **Un `id` explícito en las relaciones (`REL1`).** El modelo tendría que mantener dos identificadores por relación. Usar el predicado como identificador único es, además, buena práctica en ontologías.
- **Período estructurado (`desde` / `hasta`).** Le serviría al motor, pero el usuario suele expresar el período en sus propios términos ("el último año fiscal"). Se mantiene como texto, normalizado a `AAAA-MM / AAAA-MM` cuando se puede (el contexto del turno incluye la fecha actual). Si conviene un formato fijo queda como pregunta para Trama.

## Consecuencias

- El esquema que ve el modelo crece un poco. El ejemplo de formato del prompt cubre las extensiones.
- Para integrarse con el resto de Trama hace falta la proyección, o que Trama acepte la forma extendida. Se pregunta por el canal del reto.
- La cobertura es estructural: comprueba que haya columnas para cada elemento, no que esas columnas contengan lo necesario. Eso solo se puede validar con los datos, y queda fuera del alcance.

## Verificación

Tests de esquema e invariantes con fixtures de tres dominios:

- un requerimiento válido;
- una relación que apunta a una clase inexistente;
- un predicado duplicado;
- una columna con `justifica` vacío o con una referencia inexistente;
- una regla que usa un predicado sin columnas.

Además, la proyección al contrato base debe validar contra un esquema Zod que reproduce literalmente la forma base del enunciado.
